'use strict';
/**
 * Content in the database: one row per field and language (table vertalingen).
 *  - writeFields(): one transaction for the whole object, optimistic concurrency on the object version (409 when stale),
 *    the old state goes to geschiedenis first, the content cache is cleared afterwards.
 *  - drafts (auto-save) live in their own table and never reach the site.
 *  - history with a line diff and one-click rollback.
 */
const db = require('./db');
const cache = require('./cache');
const audit = require('./audit');
const { FIELDS, GROUPS, OPTIONAL } = require('../fields');
const { LANGS, defaultsFor, PRIVACY } = require('../i18n');

const listeners = new Set();
const onChange = (fn) => listeners.add(fn);
const conflict = (msg, extra = {}) => Object.assign(new Error(msg), { status: 409, ...extra });

const textObject = (groupId) => `tekst:${groupId}`;
const groupOf = (object) => GROUPS.find((g) => textObject(g.id) === object) || null;

/* ---- reading ---- */
const objectVersion = (object) => (db.get('SELECT versie_nummer FROM objecten WHERE object = ?', object) || { versie_nummer: 0 }).versie_nummer;

/** { taal: { veld: waarde } } for one object. */
function readObject(object) {
	const out = {};
	for (const r of db.all('SELECT taal, veld, waarde FROM vertalingen WHERE object = ?', object)) (out[r.taal] = out[r.taal] || {})[r.veld] = r.waarde;
	return out;
}
function readStatus(object) {
	const out = {};
	for (const r of db.all('SELECT taal, veld, status, nagekeken_door, gewijzigd_op, versie_nummer FROM vertalingen WHERE object = ?', object)) (out[r.taal] = out[r.taal] || {})[r.veld] = r;
	return out;
}

/* Public texts: cached per language, with the last good copy kept for when the database is down. */
let lastGood = null;
function loadAll() {
	try {
		const values = Object.fromEntries(LANGS.map((l) => [l, {}]));
		const privacy = {};
		for (const r of db.all("SELECT object, veld, taal, waarde, versie_nummer FROM vertalingen WHERE object LIKE 'tekst:%' OR object = 'privacy'")) {
			if (!values[r.taal] || r.versie_nummer === 0) continue; // version 0 = placeholder row made by the health check, not an edit
			if (r.object === 'privacy') { if (r.veld === 'text' && r.waarde.trim()) privacy[r.taal] = r.waarde; continue; }
			const field = FIELDS[r.veld];
			if (!field) continue;
			if (r.waarde === '' && !OPTIONAL.test(r.veld)) continue; // an empty required text falls back to the default
			values[r.taal][r.veld] = r.waarde;
		}
		lastGood = { values, privacy };
		return lastGood;
	} catch (e) {
		if (lastGood) return lastGood;
		return { values: Object.fromEntries(LANGS.map((l) => [l, {}])), privacy: {} };
	}
}
let snapshotCache = null;
const all = () => snapshotCache || (snapshotCache = loadAll());
function textValues(lang) { return { ...defaultsFor(lang), ...(all().values[lang] || {}) }; }
const privacyText = (lang) => all().privacy[lang] || PRIVACY[lang] || PRIVACY.en;

function invalidate(object) {
	snapshotCache = null;
	cache.invalidate();
	for (const fn of listeners) { try { fn(object); } catch (e) { /* a listener must not break saving */ } }
}

/* ---- writing ---- */
function snapshotOf(object, meta) { return JSON.stringify({ velden: readObject(object), meta: meta || null }); }

/**
 * Writes fields of one object in one transaction.
 *  fieldsByLang: { nl: { veld: waarde } }
 *  opts: { user, baseVersie (number: must equal the stored version, else 409), reden, vervang (delete rows not in the input),
 *          meta (JSON saved with the snapshot), applyMeta (fn run inside the transaction), status ('nagekeken' keeps review state) }
 */
function writeFields(object, fieldsByLang, opts = {}) {
	const { user = null, baseVersie = null, reden = null, vervang = false, meta = null, applyMeta = null } = opts;
	const userId = user ? (user.id || user) : null;
	const result = db.tx(() => {
		const row = db.get('SELECT versie_nummer FROM objecten WHERE object = ?', object);
		const current = row ? row.versie_nummer : 0;
		if (baseVersie != null && Number(baseVersie) !== current) throw conflict('Iemand anders heeft ondertussen opgeslagen. Laad de pagina opnieuw om die wijzigingen te zien.', { huidige_versie: current });
		const existing = new Map(db.all('SELECT taal, veld, waarde, versie_nummer FROM vertalingen WHERE object = ?', object).map((r) => [`${r.taal}|${r.veld}`, r]));
		const planned = [];
		const seen = new Set();
		for (const [taal, fields] of Object.entries(fieldsByLang || {})) {
			if (!LANGS.includes(taal)) continue;
			for (const [veld, raw] of Object.entries(fields || {})) {
				const waarde = String(raw == null ? '' : raw);
				const key = `${taal}|${veld}`;
				seen.add(key);
				const old = existing.get(key);
				if (!old) planned.push({ type: 'ins', taal, veld, waarde });
				else if (old.waarde !== waarde || old.versie_nummer === 0) planned.push({ type: 'upd', taal, veld, waarde, versie: old.versie_nummer }); // version 0 = placeholder: saving it, even empty, is a real edit
			}
		}
		if (vervang) for (const [key, old] of existing) if (!seen.has(key) && LANGS.includes(key.split('|')[0])) planned.push({ type: 'del', taal: key.split('|')[0], veld: key.split('|').slice(1).join('|'), versie: old.versie_nummer });
		const metaChanged = applyMeta != null;
		if (!planned.length && !metaChanged) return { versie: current, gewijzigd: 0 };
		// the state before this change goes to the history
		const before = snapshotOf(object, opts.metaVoor || null);
		if (current > 0 || existing.size) db.run('INSERT INTO geschiedenis (object, versie_nummer, snapshot, gebruiker_id, reden, tijdstip) VALUES (?, ?, ?, ?, ?, ?)', object, current, before, userId, reden, db.iso());
		const now = db.iso();
		for (const p of planned) {
			const status = String(p.waarde || '').trim() ? 'eerste_versie' : 'leeg';
			if (p.type === 'ins') db.run('INSERT INTO vertalingen (object, veld, taal, waarde, status, gewijzigd_op, versie_nummer) VALUES (?, ?, ?, ?, ?, ?, 1)', object, p.veld, p.taal, p.waarde, status, now);
			else if (p.type === 'upd') {
				const r = db.run('UPDATE vertalingen SET waarde = ?, status = ?, nagekeken_door = NULL, gewijzigd_op = ?, versie_nummer = versie_nummer + 1 WHERE object = ? AND veld = ? AND taal = ? AND versie_nummer = ?', p.waarde, status, now, object, p.veld, p.taal, p.versie);
				if (r.changes !== 1) throw conflict('Een veld is tijdens het opslaan gewijzigd. Laad de pagina opnieuw en probeer het nog eens.', { veld: p.veld });
			} else db.run('DELETE FROM vertalingen WHERE object = ? AND veld = ? AND taal = ? AND versie_nummer = ?', object, p.veld, p.taal, p.versie);
		}
		if (applyMeta) applyMeta();
		const versie = current + 1;
		db.run('INSERT INTO objecten (object, versie_nummer, gewijzigd_op, gewijzigd_door) VALUES (?, ?, ?, ?) ON CONFLICT(object) DO UPDATE SET versie_nummer = excluded.versie_nummer, gewijzigd_op = excluded.gewijzigd_op, gewijzigd_door = excluded.gewijzigd_door', object, versie, now, userId);
		db.run('DELETE FROM concepten WHERE object = ? AND gebruiker_id = ?', object, userId);
		return { versie, gewijzigd: planned.length };
	});
	if (result.gewijzigd || applyMeta) {
		audit.log({ user: userId, actie: reden === 'rollback' ? 'inhoud.rollback' : 'inhoud.gepubliceerd', entiteit: object, nieuw: { versie: result.versie, velden: result.gewijzigd } });
		invalidate(object);
	}
	return result;
}

/** Marks every filled field of a language as reviewed by a native speaker. */
function markReviewed(object, taal, user) {
	const r = db.run("UPDATE vertalingen SET status = 'nagekeken', nagekeken_door = ?, gewijzigd_op = gewijzigd_op WHERE object = ? AND taal = ? AND waarde != ''", user.id, object, taal);
	audit.log({ user, actie: 'inhoud.nagekeken', entiteit: object, nieuw: { taal, velden: r.changes } });
	return r.changes;
}

/* ---- drafts (auto-save) ---- */
function saveDraft(object, userId, data, baseVersie = 0) {
	const text = JSON.stringify(data);
	if (text.length > 400000) throw Object.assign(new Error('Draft too large'), { status: 413 });
	db.run("INSERT INTO concepten (object, gebruiker_id, status, data, basis_versie, bijgewerkt) VALUES (?, ?, 'auto-save', ?, ?, ?) ON CONFLICT(object, gebruiker_id) DO UPDATE SET data = excluded.data, basis_versie = excluded.basis_versie, bijgewerkt = excluded.bijgewerkt", object, userId, text, baseVersie, db.iso());
}
function getDraft(object, userId) {
	const r = db.get('SELECT * FROM concepten WHERE object = ? AND gebruiker_id = ?', object, userId);
	if (!r) return null;
	let data = null;
	try { data = JSON.parse(r.data); } catch (e) { return null; }
	return { data, basis_versie: r.basis_versie, bijgewerkt: r.bijgewerkt };
}
const deleteDraft = (object, userId) => db.run('DELETE FROM concepten WHERE object = ? AND gebruiker_id = ?', object, userId);

/* ---- history, diff, rollback ---- */
const history = (object, limit = 50) => db.all('SELECT h.id, h.versie_nummer, h.reden, h.tijdstip, g.naam AS gebruiker FROM geschiedenis h LEFT JOIN gebruikers g ON g.id = h.gebruiker_id WHERE h.object = ? ORDER BY h.id DESC LIMIT ?', object, limit);
function historyEntry(id) {
	const r = db.get('SELECT * FROM geschiedenis WHERE id = ?', id);
	if (!r) return null;
	return { ...r, snapshot: JSON.parse(r.snapshot) };
}

/** Line-by-line diff (longest common subsequence). Returns [{ t: '=' | '+' | '-', tekst }]. */
function diffLines(a, b) {
	const x = String(a == null ? '' : a).split('\n');
	const y = String(b == null ? '' : b).split('\n');
	const n = x.length, m = y.length;
	if (n * m > 400000) return [...x.map((tekst) => ({ t: '-', tekst })), ...y.map((tekst) => ({ t: '+', tekst }))];
	const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
	const out = [];
	let i = 0, j = 0;
	while (i < n && j < m) {
		if (x[i] === y[j]) { out.push({ t: '=', tekst: x[i] }); i++; j++; }
		else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: '-', tekst: x[i++] });
		else out.push({ t: '+', tekst: y[j++] });
	}
	while (i < n) out.push({ t: '-', tekst: x[i++] });
	while (j < m) out.push({ t: '+', tekst: y[j++] });
	return out;
}
/** Differences per language and field between two { taal: { veld: waarde } } maps. */
function diffObjects(before, after) {
	const out = [];
	for (const taal of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
		const a = (before || {})[taal] || {};
		const b = (after || {})[taal] || {};
		for (const veld of new Set([...Object.keys(a), ...Object.keys(b)])) {
			if ((a[veld] || '') === (b[veld] || '')) continue;
			out.push({ taal, veld, regels: diffLines(a[veld] || '', b[veld] || '') });
		}
	}
	return out;
}

/** Date (YYYY-MM-DD) of the last published change, for the sitemap. */
function lastModified() {
	try {
		const r = db.get('SELECT MAX(gewijzigd_op) AS t FROM objecten');
		return String((r && r.t) || new Date().toISOString()).slice(0, 10);
	} catch (e) { return new Date().toISOString().slice(0, 10); }
}

module.exports = { lastModified, textObject, groupOf, readObject, readStatus, objectVersion, textValues, privacyText, writeFields, markReviewed, saveDraft, getDraft, deleteDraft, history, historyEntry, diffLines, diffObjects, invalidate, onChange, snapshotOf };
