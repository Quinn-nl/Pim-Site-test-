'use strict';
/** Permanent redirects. Created automatically when a page address changes; checked by the router before it answers 404. */
const db = require('./db');
const audit = require('./audit');

const clean = (p) => String(p || '').split('?')[0].replace(/\/+$/, '') || '/';

function add(van, naar, user = null) {
	van = clean(van); naar = clean(naar);
	if (van === naar || !/^\/[a-z]{2}\/[a-z0-9-]+$/.test(van) || !/^\/[a-z]{2}\/[a-z0-9-]+$/.test(naar)) return false;
	db.tx(() => {
		db.run('DELETE FROM redirects WHERE van = ?', naar); // the new address is real again: no loop
		db.run('UPDATE redirects SET naar = ? WHERE naar = ?', naar, van); // shorten chains: a -> b becomes a -> c when b moves to c
		db.run('INSERT INTO redirects (van, naar) VALUES (?, ?) ON CONFLICT(van) DO UPDATE SET naar = excluded.naar', van, naar);
	});
	audit.log({ user, actie: 'redirect.aangemaakt', entiteit: van, nieuw: naar });
	return true;
}
function find(pathname) {
	const r = db.get('SELECT naar FROM redirects WHERE van = ?', clean(pathname));
	if (r) db.run('UPDATE redirects SET hits = hits + 1 WHERE van = ?', clean(pathname));
	return r ? r.naar : null;
}
const list = () => db.all('SELECT * FROM redirects ORDER BY aangemaakt DESC');
function remove(van, user) { db.run('DELETE FROM redirects WHERE van = ?', van); audit.log({ user, actie: 'redirect.verwijderd', entiteit: van }); }
/** A page is published again at this address: a redirect that pointed away from it must go. */
const clearFor = (pad) => db.run('DELETE FROM redirects WHERE van = ?', clean(pad));

/** Redirects that point to an address that is itself redirected (visitors would hop twice). */
const chains = () => db.all('SELECT a.van, a.naar, b.naar AS einde FROM redirects a JOIN redirects b ON b.van = a.naar');
/** Points every redirect straight at its final address and drops loops. Returns how many were changed or removed. */
function flatten(user = null) {
	let n = 0;
	db.tx(() => {
		const map = new Map(db.all('SELECT van, naar FROM redirects').map((r) => [r.van, r.naar]));
		for (const [van, naar] of map) {
			let to = naar; const seen = new Set([van]);
			while (map.has(to) && !seen.has(to) && seen.size < 12) { seen.add(to); to = map.get(to); }
			if (seen.has(to) || to === van) { db.run('DELETE FROM redirects WHERE van = ?', van); n += 1; } else if (to !== naar) { db.run('UPDATE redirects SET naar = ? WHERE van = ?', to, van); n += 1; }
		}
	});
	if (n) audit.log({ user, actie: 'redirect.ketens_ingekort', entiteit: 'redirects', nieuw: { aantal: n } });
	return n;
}
const csvCell = (v) => { let t = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
const exportCsv = () => ['van,naar,gebruikt,aangemaakt', ...list().map((r) => [r.van, r.naar, r.hits, r.aangemaakt].map(csvCell).join(','))].join('\r\n') + '\r\n';
/** Lines of "van,naar" (also ; or tab). A header line is skipped. Returns { toegevoegd, overgeslagen, fouten: [{regel, tekst}] }. */
function importCsv(text, user = null, max = 500) {
	const out = { toegevoegd: 0, overgeslagen: 0, fouten: [] };
	const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, max + 1);
	lines.forEach((line, i) => {
		const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
		if (i === 0 && /^van$/i.test(cells[0])) return;
		if (cells.length < 2) { out.fouten.push({ regel: i + 1, tekst: 'Verwacht “van,naar”.' }); return; }
		if (!add(cells[0], cells[1], user)) { out.overgeslagen += 1; out.fouten.push({ regel: i + 1, tekst: `“${cells[0].slice(0, 40)}” naar “${cells[1].slice(0, 40)}” kan niet: gebruik adressen als /nl/oude-pagina en maak geen redirect naar zichzelf.` }); } else out.toegevoegd += 1;
	});
	return out;
}
function removeMany(vans, user = null) { let n = 0; for (const v of vans) { if (db.run('DELETE FROM redirects WHERE van = ?', String(v)).changes) n += 1; } if (n) audit.log({ user, actie: 'redirect.verwijderd_bulk', entiteit: 'redirects', nieuw: { aantal: n } }); return n; }

module.exports = { add, find, list, remove, removeMany, clearFor, clean, chains, flatten, exportCsv, importCsv };
