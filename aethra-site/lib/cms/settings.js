'use strict';
/**
 * Site settings the administrators can change without touching the server: how long messages are kept, the announcement banner and maintenance mode.
 * Stored in `instellingen` under the prefix "inst.". Everything has a default, so a fresh database works.
 */
const db = require('./db');
const audit = require('./audit');
const cache = require('./cache');
const cfg = require('../config');
const { LANGS } = require('../i18n');

const P = 'inst.';
const DEFAULTS = {
	bewaartermijn_dagen: () => cfg.RETENTION_DAYS,
	banner_aan: () => false,
	banner_tot: () => '',
	banner_link: () => '',
	...Object.fromEntries(LANGS.map((l) => [`banner_tekst_${l}`, () => ''])),
	onderhoud_aan: () => false,
	...Object.fromEntries(LANGS.map((l) => [`onderhoud_tekst_${l}`, () => ''])),
};
const BOOL = new Set(['banner_aan', 'onderhoud_aan']);

function raw(key) { const r = db.get('SELECT waarde FROM instellingen WHERE sleutel = ?', P + key); return r ? r.waarde : null; }
function get(key) {
	const v = raw(key);
	if (v === null) return DEFAULTS[key]();
	if (BOOL.has(key)) return v === '1';
	if (key === 'bewaartermijn_dagen') return Number(v) || DEFAULTS[key]();
	return v;
}
function all() { return Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, get(k)])); }

const bad = (text) => Object.assign(new Error(text), { status: 422 });
const URL_OK = /^(https?:\/\/[^\s<>"'`]+|\/(?!\/)[^\s<>"'`]*)$/i;

/** Validates and stores the posted values (only the ones that are present). Returns the new settings. */
function save(input, user) {
	const next = {};
	for (const key of Object.keys(DEFAULTS)) {
		if (!(key in input)) continue;
		let v = input[key];
		if (BOOL.has(key)) v = v === true || v === '1' || v === 'on' || v === 1;
		else if (key === 'bewaartermijn_dagen') {
			v = Number(v);
			if (!Number.isInteger(v) || v < 30 || v > 1825) throw bad('De bewaartermijn van berichten ligt tussen 30 en 1825 dagen.');
		} else if (key === 'banner_tot') {
			v = String(v || '').trim();
			if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad('Vul de einddatum van de mededeling in als datum.');
		} else if (key === 'banner_link') {
			v = String(v || '').trim();
			if (v && !URL_OK.test(v)) throw bad('De link van de mededeling moet met https:// of / beginnen.');
		} else v = String(v || '').replace(/[\r\n\t<>]/g, ' ').trim().slice(0, key.startsWith('banner') ? 200 : 600);
		next[key] = v;
	}
	// The banner text is public copy: it must pass the same editorial rules as the rest of the site.
	const bannerTexts = Object.fromEntries(LANGS.filter((l) => next[`banner_tekst_${l}`]).map((l) => [l, { banner: next[`banner_tekst_${l}`] }]));
	if (Object.keys(bannerTexts).length) {
		const { validateAethraCompliance } = require('./compliance');
		const { fouten } = validateAethraCompliance({ object: 'instelling:banner', velden: bannerTexts });
		if (fouten.length) throw bad(`De mededeling kan niet worden opgeslagen: ${fouten[0].melding}`);
	}
	const old = all();
	db.tx(() => {
		for (const [k, v] of Object.entries(next)) db.run('INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde', P + k, BOOL.has(k) ? (v ? '1' : '0') : String(v));
	});
	const now = all();
	const changed = Object.keys(next).filter((k) => String(old[k]) !== String(now[k]));
	if (changed.length) audit.log({ user, actie: 'instellingen.gewijzigd', entiteit: 'instellingen', oud: Object.fromEntries(changed.map((k) => [k, old[k]])), nieuw: Object.fromEntries(changed.map((k) => [k, now[k]])) });
	cache.invalidate();
	return now;
}

const retentionDays = () => { try { return get('bewaartermijn_dagen'); } catch (e) { return cfg.RETENTION_DAYS; } };

/** The announcement for one language, or null (off, past its end date, or no text). Falls back to English. */
function banner(lang, now = new Date()) {
	try {
		if (!get('banner_aan')) return null;
		const tot = get('banner_tot');
		if (tot && now.toISOString().slice(0, 10) > tot) return null;
		const text = get(`banner_tekst_${lang}`) || get('banner_tekst_en');
		if (!text) return null;
		return { text, link: get('banner_link') || '' };
	} catch (e) { return null; }
}
const maintenance = () => { try { return get('onderhoud_aan'); } catch (e) { return false; } };
function maintenanceText(lang) { try { return get(`onderhoud_tekst_${lang}`) || get('onderhoud_tekst_en') || ''; } catch (e) { return ''; } }

module.exports = { get, all, save, retentionDays, banner, maintenance, maintenanceText, LANGS };
