'use strict';
/** The translation overview: per text group, the privacy statement and every page, the state of each language. */
const db = require('./db');
const content = require('./content');
const pages = require('./pages');
const { GROUPS } = require('../fields');
const { LANGS } = require('../i18n');

/**
 * state: 'standaard' (never edited: the built-in text is shown), 'leeg' (nothing at all, pages only), 'eerste_versie', 'nagekeken'.
 * outdated: fields whose English text changed after this language was last written or reviewed.
 */
function cell(rows, lang, isPage) {
	const mine = Object.entries(rows[lang] || {}).filter(([, r]) => r.versie_nummer > 0 && r.status !== 'leeg');
	let state = !mine.length ? (isPage ? 'leeg' : 'standaard') : mine.every(([, r]) => r.status === 'nagekeken') ? 'nagekeken' : 'eerste_versie';
	let outdated = 0;
	if (lang !== 'en') for (const [veld, r] of mine) {
		const en = (rows.en || {})[veld];
		const fresh = [r.gewijzigd_op, r.nagekeken_op || ''].sort().pop();   // written or reviewed, whichever is later
		if (en && en.versie_nummer > 0 && en.status !== 'leeg' && en.gewijzigd_op > fresh) outdated += 1;
	}
	return { state, outdated, fields: mine.length };
}
function overview() {
	const out = [];
	const row = (kind, label, href, object, isPage) => { const st = content.readStatus(object); out.push({ kind, label, href, cells: Object.fromEntries(LANGS.map((l) => [l, cell(st, l, isPage)])) }); };
	const { PLACE } = require('./views');
	for (const g of GROUPS) row('tekst', (PLACE[g.id] && PLACE[g.id].label) || g.title, `/admin/tekst/${g.id}`, content.textObject(g.id), false);
	row('privacy', 'Privacyverklaring', '/admin/privacy', 'privacy', false);
	for (const p of pages.list()) row('pagina', (p.titels.nl || p.titels.en || `Pagina ${p.id}`) + (p.status === 'concept' ? ' (concept)' : ''), `/admin/paginas/${p.id}`, pages.object(p.id), true);
	return out;
}
const totals = (rows) => Object.fromEntries(LANGS.map((l) => [l, rows.reduce((a, r) => ({ nagekeken: a.nagekeken + (r.cells[l].state === 'nagekeken' ? 1 : 0), outdated: a.outdated + (r.cells[l].outdated ? 1 : 0), open: a.open + (r.cells[l].state === 'eerste_versie' || r.cells[l].state === 'leeg' ? 1 : 0) }), { nagekeken: 0, outdated: 0, open: 0 })]));
module.exports = { overview, totals };
