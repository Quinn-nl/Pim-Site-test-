'use strict';
/**
 * The navigation: header links, one button, footer links. Stored as JSON in `instellingen` (key 'menu').
 * Nothing stored = the original menu (three links, a Contact button, the usual footer), so a fresh site looks as before.
 * An item is a fixed page, a page made in the CMS, or a custom link; the label can be overridden per language.
 */
const db = require('./db');
const audit = require('./audit');
const cache = require('./cache');
const { UI, LANGS } = require('../i18n');
const { AUDIENCES, labelFor } = require('../audiences');

const KEY = 'menu';
const MAX = { header: 8, footer: 24 };
const HOME = { en: 'Home', nl: 'Home', de: 'Startseite', fr: 'Accueil' };
const FIXED_PATHS = ['/', '/problem', '/how-it-works', '/applications', '/eco-mode-today', '/contact', '/privacy', ...AUDIENCES.map((a) => `/for/${a.slug}`)];
const FIXED_KEYS = { '/problem': 'nav_problem', '/how-it-works': 'nav_how', '/applications': 'nav_apps', '/eco-mode-today': 'nav_today', '/contact': 'nav_contact', '/privacy': 'privacy' };

/** The default wording of a fixed page in one language. */
function fixedLabel(path, lang) {
	if (path === '/') return HOME[lang];
	if (FIXED_KEYS[path]) return UI[lang][FIXED_KEYS[path]];
	const a = AUDIENCES.find((x) => `/for/${x.slug}` === path);
	return a ? labelFor(a, lang) : path;
}
const fixedChoices = () => FIXED_PATHS.map((p) => ({ ref: p, labels: Object.fromEntries(LANGS.map((l) => [l, fixedLabel(p, l)])) }));

const uid = () => Math.random().toString(36).slice(2, 9);
const item = (soort, ref, extra = {}) => ({ id: uid(), soort, ref: String(ref), labels: {}, zichtbaar: true, nieuw_tab: false, ...extra });

/** What the site showed before the menu could be edited. `pagesList` = pages.list(). */
function defaults(pagesList = []) {
	const core = ['/problem', '/how-it-works', '/applications'];
	return {
		header: core.map((p) => item('vast', p)),
		cta: item('vast', '/contact'),
		footer: [...core.map((p) => item('vast', p)), item('vast', '/eco-mode-today'), ...pagesList.filter((p) => p.in_footer && p.status === 'gepubliceerd').map((p) => item('pagina', p.id)), item('vast', '/contact'), item('vast', '/privacy')],
	};
}

function stored() {
	const r = db.get('SELECT waarde FROM instellingen WHERE sleutel = ?', KEY);
	if (!r) return null;
	try { const c = JSON.parse(r.waarde); return c && Array.isArray(c.header) && Array.isArray(c.footer) ? c : null; } catch (e) { return null; }
}
const isCustom = () => !!stored();

const bad = (text) => Object.assign(new Error(text), { status: 422 });
const URL_OK = /^(https?:\/\/[^\s<>"'`]+|mailto:[^\s<>"'`]+|tel:[+\d\s()-]+|\/(?!\/)[^\s<>"'`]*)$/i;

function cleanItem(raw, pageIds) {
	if (!raw || typeof raw !== 'object') throw bad('Ongeldig menu-onderdeel.');
	const soort = ['vast', 'pagina', 'link'].includes(raw.soort) ? raw.soort : null;
	if (!soort) throw bad('Onbekend soort menu-onderdeel.');
	let ref = String(raw.ref == null ? '' : raw.ref).trim();
	if (soort === 'vast' && !FIXED_PATHS.includes(ref)) throw bad('Onbekende vaste pagina in het menu.');
	if (soort === 'pagina' && !pageIds.has(Number(ref))) throw bad('Een pagina in het menu bestaat niet meer.');
	if (soort === 'pagina') ref = String(Number(ref));
	if (soort === 'link' && (ref.length > 500 || !URL_OK.test(ref))) throw bad(`“${ref.slice(0, 60)}” is geen geldige link. Gebruik https://…, mailto:…, tel:… of een adres dat met / begint.`);
	const labels = {};
	for (const l of LANGS) { const t = String((raw.labels || {})[l] || '').replace(/[\r\n\t<>]/g, ' ').trim().slice(0, 60); if (t) labels[l] = t; }
	if (soort === 'link' && !Object.keys(labels).length) throw bad('Geef elke eigen link een tekst (minstens in één taal).');
	return { id: String(raw.id || uid()).replace(/[^\w-]/g, '').slice(0, 12) || uid(), soort, ref, labels, zichtbaar: raw.zichtbaar !== false, nieuw_tab: soort === 'link' && !!raw.nieuw_tab };
}
function clean(raw, pageIds) {
	if (!raw || typeof raw !== 'object') throw bad('Ongeldig menu.');
	const list = (name) => {
		const arr = Array.isArray(raw[name]) ? raw[name] : [];
		if (arr.length > MAX[name]) throw bad(`Maximaal ${MAX[name]} onderdelen in ${name === 'header' ? 'het hoofdmenu' : 'de voettekst'}.`);
		return arr.map((i) => cleanItem(i, pageIds));
	};
	return { v: 1, header: list('header'), footer: list('footer'), cta: raw.cta ? cleanItem(raw.cta, pageIds) : null };
}

function save(raw, pagesList, user) {
	const next = clean(raw, new Set(pagesList.map((p) => p.id)));
	const old = stored();
	db.run('INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde', KEY, JSON.stringify(next));
	audit.log({ user, actie: 'menu.gewijzigd', entiteit: 'menu', oud: old ? { header: old.header.length, footer: old.footer.length } : 'standaard', nieuw: { header: next.header.length, footer: next.footer.length, cta: !!next.cta } });
	cache.invalidate();
	return next;
}
function reset(user) {
	db.run('DELETE FROM instellingen WHERE sleutel = ?', KEY);
	audit.log({ user, actie: 'menu.standaard', entiteit: 'menu' });
	cache.invalidate();
}

/**
 * The menu as the public site needs it, for one language: { header: [...], cta, footer: [...] }.
 * An entry is { path, label } (a page of this site, gets the language prefix) or { href, label, newTab } (a custom link).
 * Returns null when nothing is stored: the site then uses its built-in menu.
 */
function resolve(lang, { todayOn = false, published = [] } = {}) {
	const cfg = stored();
	if (!cfg) return null;
	const one = (it) => {
		if (!it || it.zichtbaar === false) return null;
		const own = (it.labels || {})[lang];
		if (it.soort === 'vast') return it.ref === '/eco-mode-today' && !todayOn ? null : { path: it.ref, label: own || fixedLabel(it.ref, lang) };
		if (it.soort === 'pagina') { const p = published.find((x) => x.group === `p${it.ref}` && x.language === lang); return p ? { path: `/${p.slug}`, label: own || p.title } : null; }
		const label = own || (it.labels || {}).en || Object.values(it.labels || {})[0];
		return label ? { href: it.ref, label, newTab: !!it.nieuw_tab } : null;
	};
	return { header: cfg.header.map(one).filter(Boolean), cta: one(cfg.cta), footer: cfg.footer.map(one).filter(Boolean) };
}

/** Everything the editor needs: the current (or default) menu plus what can be added. */
function editorData(pagesList) {
	const published = pagesList.filter((p) => p.status === 'gepubliceerd');
	return {
		menu: stored() || defaults(pagesList),
		custom: isCustom(),
		fixed: fixedChoices(),
		pages: published.map((p) => ({ ref: String(p.id), titels: p.titels })),
		langs: LANGS,
	};
}

module.exports = { MAX, defaults, stored, isCustom, clean, save, reset, resolve, editorData, fixedLabel };
