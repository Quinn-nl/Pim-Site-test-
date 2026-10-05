'use strict';
/** Pages made in the CMS: a template, an ordered list of sections, and per language the fields of every section. */
const db = require('./db');
const content = require('./content');
const redirects = require('./redirects');
const audit = require('./audit');
const { sanitizeHtml, safeHref } = require('./sanitize');
const { TEMPLATES, SECTIONS, validateLayout, defaultLayout, sectionFields } = require('./templates');
const { LANGS } = require('../i18n');

const RESERVED = new Set(['problem', 'how-it-works', 'applications', 'contact', 'privacy', 'for', 'eco-mode-today', 'admin', 'api', 'css', 'js', 'img', 'fonts', 'uploads', 'deck', 'healthz', 'robots', 'sitemap', 'llms', 'favicon']);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BASE = [
	{ key: 'titel', label: 'Kop van de pagina', hint: 'De hoofdtitel. Zonder kop bestaat de pagina niet in deze taal.', type: 'text', req: true },
	{ key: 'slug', label: 'Adres', hint: 'Kleine letters, cijfers en streepjes, bijvoorbeeld over-ons. De pagina staat dan op /nl/over-ons.', type: 'text', req: true },
	{ key: 'lead', label: 'Inleiding (optioneel)', hint: '', type: 'textarea' },
	{ key: 'seo_title', label: 'Titel in zoekresultaten', hint: 'Ongeveer 50 tekens. De sitenaam wordt automatisch toegevoegd.', type: 'text' },
	{ key: 'seo_description', label: 'Omschrijving in zoekresultaten', hint: 'Ongeveer 150 tekens. Zonder omschrijving kiest Google zelf een tekst.', type: 'textarea' },
];
const object = (id) => `pagina:${id}`;
const invalid = (errors, status = 422) => Object.assign(new Error(errors[0]), { status, fouten: errors });

const parseLayout = (row) => { try { return JSON.parse(row.indeling); } catch (e) { return []; } };
const rowToMeta = (r) => ({ id: r.id, sjabloon: r.sjabloon, indeling: parseLayout(r), status: r.status, in_footer: !!r.in_footer, indexeren: !!r.indexeren, volgorde: r.volgorde, aangemaakt: r.aangemaakt, gepubliceerd_op: r.gepubliceerd_op });

/** The fields a page may have, with their types, for the layout it has now. */
function allowedFields(indeling) {
	const map = new Map(BASE.map((f) => [f.key, f]));
	for (const s of indeling) for (const f of sectionFields(s)) map.set(f.key, f);
	return map;
}

/** Cleans one value by its field type. Returns { value } or { error }. */
function cleanValue(f, raw) {
	let v = String(raw == null ? '' : raw).replace(/\u0000/g, '').replace(/\r/g, '');
	if (f.type === 'rich') return { value: sanitizeHtml(v) };
	if (f.type === 'textarea') return { value: v.replace(/\n{3,}/g, '\n\n').slice(0, 2000).trim() };
	v = v.replace(/\n/g, ' ').trim().slice(0, 300);
	if (f.type === 'url' && v) {
		const h = safeHref(v);
		if (!h) return { error: `${f.label}: gebruik een link die begint met http://, https://, mailto: of /` };
		return { value: h };
	}
	if (f.type === 'media') return { value: /^\d{1,9}$/.test(v) ? v : '' };
	return { value: v };
}

function create({ sjabloon, user }) {
	if (!TEMPLATES[sjabloon]) throw invalid(['Kies een sjabloon.'], 400);
	const indeling = defaultLayout(sjabloon);
	const id = db.run("INSERT INTO paginas (sjabloon, indeling, status) VALUES (?, ?, 'concept')", sjabloon, JSON.stringify(indeling)).id;
	audit.log({ user, actie: 'pagina.aangemaakt', entiteit: object(id), nieuw: { sjabloon } });
	return id;
}

function get(id) {
	const r = db.get('SELECT * FROM paginas WHERE id = ?', id);
	if (!r) return null;
	return { meta: rowToMeta(r), velden: content.readObject(object(id)), status: content.readStatus(object(id)), versie: content.objectVersion(object(id)) };
}
function list() {
	return db.all('SELECT * FROM paginas ORDER BY volgorde, id').map((r) => {
		const f = content.readObject(object(r.id));
		return { ...rowToMeta(r), titels: Object.fromEntries(LANGS.filter((l) => f[l] && f[l].titel).map((l) => [l, f[l].titel])), slugs: Object.fromEntries(LANGS.filter((l) => f[l] && f[l].slug).map((l) => [l, f[l].slug])), versie: content.objectVersion(object(r.id)) };
	});
}

/**
 * Turns what the editor sent into a clean, validated change. Throws 422 with a list of messages.
 * input: { velden: { taal: { veld: waarde } }, meta: { indeling, in_footer, indexeren, volgorde, status } }
 */
function prepare(id, input) {
	const row = db.get('SELECT * FROM paginas WHERE id = ?', id);
	if (!row) throw invalid(['Pagina niet gevonden.'], 404);
	const meta = input.meta || {};
	const indeling = Array.isArray(meta.indeling) ? meta.indeling.map((s) => ({ id: String(s.id), type: String(s.type) })) : parseLayout(row);
	const errors = validateLayout(row.sjabloon, indeling);
	if (errors.length) throw invalid(errors);
	const status = meta.status === 'gepubliceerd' ? 'gepubliceerd' : meta.status === 'concept' ? 'concept' : row.status;
	const allowed = allowedFields(indeling);
	const velden = {};
	for (const taal of LANGS) {
		const given = (input.velden || {})[taal] || {};
		velden[taal] = {};
		for (const [key, f] of allowed) {
			if (!(key in given)) continue;
			const r = cleanValue(f, given[key]);
			if (r.error) errors.push(`${taal.toUpperCase()}: ${r.error}`);
			else if (r.value !== '') velden[taal][key] = r.value;
		}
	}
	// per language: a page exists in a language when it has a heading; then it needs an address
	const others = db.all("SELECT p.id, v.taal, v.waarde FROM paginas p JOIN vertalingen v ON v.object = 'pagina:' || p.id AND v.veld = 'slug' WHERE p.id != ?", id);
	for (const taal of LANGS) {
		const f = velden[taal];
		if (!f.titel && !f.slug) continue;
		if (f.titel && !f.slug) errors.push(`${taal.toUpperCase()}: de pagina heeft een adres nodig.`);
		if (f.slug) {
			if (!SLUG.test(f.slug)) errors.push(`${taal.toUpperCase()}: het adres mag alleen kleine letters, cijfers en losse streepjes bevatten.`);
			else if (RESERVED.has(f.slug)) errors.push(`${taal.toUpperCase()}: "${f.slug}" wordt door de website zelf gebruikt. Kies een ander adres.`);
			else if (others.some((o) => o.taal === taal && o.waarde === f.slug)) errors.push(`${taal.toUpperCase()}: een andere pagina gebruikt het adres "${f.slug}" al.`);
			if (!f.titel) errors.push(`${taal.toUpperCase()}: de pagina heeft een kop nodig.`);
		}
		for (const s of indeling) if (s.type === 'foto' && f[`s.${s.id}.media`] && !db.get('SELECT 1 FROM media WHERE id = ?', Number(f[`s.${s.id}.media`]))) errors.push(`${taal.toUpperCase()}: een gekozen foto bestaat niet meer.`);
	}
	if (status === 'gepubliceerd' && !LANGS.some((l) => velden[l].titel)) errors.push('Vul vóór het publiceren in minstens één taal een kop in.');
	if (errors.length) throw invalid(errors);
	return {
		row, status, indeling, velden,
		meta: { indeling, status, in_footer: meta.in_footer == null ? !!row.in_footer : !!meta.in_footer, indexeren: meta.indexeren == null ? !!row.indexeren : !!meta.indexeren, volgorde: Number.isFinite(Number(meta.volgorde)) ? Math.max(0, Math.min(9999, Math.floor(Number(meta.volgorde)))) : row.volgorde },
	};
}

/** Writes a prepared change in one transaction (fields, layout, status) and keeps old addresses working. */
function save(id, prepared, { user, baseVersie, reden = null }) {
	const { row, meta, velden } = prepared;
	const before = rowToMeta(row);
	const oldFields = content.readObject(object(id));
	const result = content.writeFields(object(id), velden, {
		user, baseVersie, reden, vervang: true, metaVoor: before,
		applyMeta: () => {
			const gepubliceerdOp = meta.status === 'gepubliceerd' ? (row.gepubliceerd_op || db.iso()) : row.gepubliceerd_op;
			db.run('UPDATE paginas SET indeling = ?, status = ?, in_footer = ?, indexeren = ?, volgorde = ?, gepubliceerd_op = ? WHERE id = ?', JSON.stringify(meta.indeling), meta.status, meta.in_footer ? 1 : 0, meta.indexeren ? 1 : 0, meta.volgorde, gepubliceerdOp, id);
			if (before.status === 'gepubliceerd' || meta.status === 'gepubliceerd') {
				for (const taal of LANGS) {
					const was = oldFields[taal] && oldFields[taal].slug;
					const now = velden[taal].slug;
					if (was && now && was !== now && before.status === 'gepubliceerd') redirects.add(`/${taal}/${was}`, `/${taal}/${now}`, user);
					if (now && meta.status === 'gepubliceerd') redirects.clearFor(`/${taal}/${now}`);
				}
			}
		},
	});
	if (before.status !== meta.status) audit.log({ user, actie: meta.status === 'gepubliceerd' ? 'pagina.gepubliceerd' : 'pagina.gedepubliceerd', entiteit: object(id) });
	return result;
}

function remove(id, user) {
	const row = db.get('SELECT * FROM paginas WHERE id = ?', id);
	if (!row) return false;
	const fields = content.readObject(object(id));
	db.tx(() => {
		if (row.status === 'gepubliceerd') for (const taal of LANGS) if (fields[taal] && fields[taal].slug) db.run('DELETE FROM redirects WHERE naar = ?', `/${taal}/${fields[taal].slug}`);
		db.run('DELETE FROM vertalingen WHERE object = ?', object(id));
		db.run('DELETE FROM concepten WHERE object = ?', object(id));
		db.run('DELETE FROM objecten WHERE object = ?', object(id));
		db.run('DELETE FROM paginas WHERE id = ?', id);
	});
	audit.log({ user, actie: 'pagina.verwijderd', entiteit: object(id), oud: { sjabloon: row.sjabloon, velden: fields } });
	content.invalidate(object(id));
	return true;
}

/** Restores a page from a history entry (fields and layout). */
function rollback(id, historyId, { user, baseVersie }) {
	const h = content.historyEntry(historyId);
	if (!h || h.object !== object(id)) throw invalid(['Versie niet gevonden.'], 404);
	const snap = h.snapshot;
	const row = db.get('SELECT * FROM paginas WHERE id = ?', id);
	const meta = snap.meta || rowToMeta(row);
	const indeling = Array.isArray(meta.indeling) ? meta.indeling : parseLayout(row);
	return content.writeFields(object(id), snap.velden || {}, {
		user, baseVersie, reden: 'rollback', vervang: true, metaVoor: rowToMeta(row),
		applyMeta: () => db.run('UPDATE paginas SET indeling = ?, status = ?, in_footer = ?, indexeren = ?, volgorde = ? WHERE id = ?', JSON.stringify(indeling), 'concept', meta.in_footer ? 1 : 0, meta.indexeren ? 1 : 0, meta.volgorde || 0, id), // a restored page comes back as a draft
	});
}

/* ---- public side ---- */
let publicCache = null;
content.onChange(() => { publicCache = null; });

function publishedPages() {
	if (publicCache) return publicCache;
	const out = [];
	try {
		for (const r of db.all("SELECT * FROM paginas WHERE status = 'gepubliceerd' ORDER BY id")) {
			const f = content.readObject(object(r.id));
			const indeling = parseLayout(r);
			for (const taal of LANGS) {
				const v = f[taal];
				if (!v || !v.titel || !v.slug || !SLUG.test(v.slug) || RESERVED.has(v.slug)) continue;
				out.push({
					id: r.id, sjabloon: r.sjabloon, language: taal, slug: v.slug, title: v.titel, lead: v.lead || '',
					seo_title: v.seo_title || '', seo_description: v.seo_description || '', group: `p${r.id}`, footer: !!r.in_footer, indexeren: !!r.indexeren,
					updated: String(r.gepubliceerd_op || r.aangemaakt || '').slice(0, 10), volgorde: r.volgorde,
					sections: indeling.map((s) => ({ id: s.id, type: s.type, values: Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith(`s.${s.id}.`)).map(([k, val]) => [k.slice(`s.${s.id}.`.length), val])) })),
				});
			}
		}
		publicCache = out;
	} catch (e) { return publicCache || out; }
	return out;
}
const findPage = (lang, slug) => publishedPages().find((p) => p.language === lang && p.slug === slug) || null;
function pageVersions(page) {
	const out = {};
	for (const p of publishedPages()) if (p.group === page.group && !out[p.language]) out[p.language] = p.slug;
	out[page.language] = page.slug;
	return out;
}
const footerPages = (lang) => publishedPages().filter((p) => p.footer && p.language === lang).sort((a, b) => a.volgorde - b.volgorde || a.id - b.id);

module.exports = { RESERVED, BASE, cleanValue, object, create, get, list, prepare, save, remove, rollback, allowedFields, publishedPages, findPage, pageVersions, footerPages, parseLayout };
