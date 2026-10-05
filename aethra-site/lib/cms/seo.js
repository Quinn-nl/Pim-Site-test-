'use strict';
/** Site-wide SEO check: every published page in every language is rendered the way a visitor gets it and inspected. */
const render = require('./render');
const store = require('../store');
const views = require('../views');
const cfg = require('../config');
const cache = require('./cache');
const { LANGS } = require('../i18n');

const todayOn = () => String(store.getContent('en').values.today_enabled || '').trim().toLowerCase() === 'yes';
const decode = (t) => String(t).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
const strip = (h) => decode(String(h).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** Every public page: [{ lang, path, label }]. */
function targets() {
	const on = todayOn();
	const out = [];
	for (const lang of LANGS) {
		for (const path of [...views.PAGES, ...(on ? ['/eco-mode-today'] : [])]) out.push({ lang, path, label: path === '/' ? 'Home' : path });
		for (const p of store.publishedPages().filter((x) => x.language === lang)) out.push({ lang, path: `/${p.slug}`, label: p.title });
	}
	return out;
}
const siteUrl = () => cfg.SITE_URL || 'http://localhost';

/** Looks at one rendered page. */
function inspect(html) {
	const title = strip((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '');
	const desc = decode((/<meta name="description" content="([^"]*)"/i.exec(html) || [])[1] || '').trim();
	const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
	const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
	const links = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: decode(m[1]), text: strip(m[2]) }));
	return {
		title, desc, h1: levels.filter((l) => l === 1).length,
		skip: levels.some((l, i) => i > 0 && l > levels[i - 1] + 1),
		noAlt: imgs.filter((i) => !/\balt="[^"]+"/i.test(i)).length,
		noindex: /<meta name="robots" content="[^"]*noindex/i.test(html),
		canonical: /<link rel="canonical"/i.test(html),
		links,
	};
}

/** The checks, as { code, ernst, tekst }. */
function judge(info) {
	const out = [];
	const add = (code, ernst, tekst) => out.push({ code, ernst, tekst });
	if (!info.title) add('titel_mist', 'fout', 'Geen paginatitel.');
	else if (info.title.length < 30) add('titel_kort', 'let_op', `Titel is kort (${info.title.length} tekens). Rond de 50 tot 60 werkt het best.`);
	else if (info.title.length > 60) add('titel_lang', 'let_op', `Titel is lang (${info.title.length} tekens) en wordt in zoekresultaten waarschijnlijk afgekapt.`);
	if (!info.desc) add('omschrijving_mist', 'fout', 'Geen omschrijving voor zoekresultaten.');
	else if (info.desc.length < 70) add('omschrijving_kort', 'let_op', `Omschrijving is kort (${info.desc.length} tekens). Probeer 120 tot 155.`);
	else if (info.desc.length > 160) add('omschrijving_lang', 'let_op', `Omschrijving is lang (${info.desc.length} tekens) en wordt afgekapt.`);
	if (info.h1 !== 1) add('h1', 'let_op', info.h1 === 0 ? 'Geen hoofdkop (h1).' : `${info.h1} hoofdkoppen (h1); één is genoeg.`);
	if (info.skip) add('kopniveau', 'let_op', 'Een kopniveau wordt overgeslagen (bijvoorbeeld h2 direct gevolgd door h4).');
	if (info.noAlt) add('alt', 'fout', `${info.noAlt} afbeelding${info.noAlt === 1 ? '' : 'en'} zonder omschrijving.`);
	if (!info.canonical) add('canonical', 'let_op', 'Geen canonieke link.');
	if (info.noindex) add('noindex', 'info', 'Staat op “niet indexeren”: zoekmachines laten deze pagina met opzet buiten beeld.');
	return out;
}

/** The audit renders every page in every language, so the result is kept until something is published (or for ten minutes). */
let memo = null;
cache.onInvalidate(() => { memo = null; });
function audit({ fresh = false, now = Date.now() } = {}) {
	if (!fresh && memo && now - memo.at < 10 * 60 * 1000) return memo.rows;
	const rows = compute();
	memo = { at: now, rows };
	return rows;
}
const age = () => (memo ? memo.at : null);

/** All pages with their findings. Duplicate titles and descriptions inside one language are added as well. */
function compute() {
	const on = todayOn();
	const rows = [];
	for (const t of targets()) {
		const r = render.renderPublic(t.lang, t.path, siteUrl(), on);
		if (!r) continue;
		const info = inspect(r.html);
		rows.push({ ...t, title: info.title, desc: info.desc, findings: judge(info), links: info.links });
	}
	for (const lang of LANGS) {
		const mine = rows.filter((r) => r.lang === lang && !r.findings.some((f) => f.code === 'noindex'));
		for (const key of ['title', 'desc']) {
			const seen = new Map();
			for (const r of mine) if (r[key]) seen.set(r[key], [...(seen.get(r[key]) || []), r]);
			for (const group of seen.values()) if (group.length > 1) for (const r of group) r.findings.push({ code: key === 'title' ? 'titel_dubbel' : 'omschrijving_dubbel', ernst: 'let_op', tekst: `${key === 'title' ? 'Titel' : 'Omschrijving'} is hetzelfde als bij ${group.filter((x) => x !== r).map((x) => x.label).slice(0, 2).join(', ')}.` });
		}
	}
	return rows;
}
const score = (rows) => { const all = rows.length; const bad = rows.filter((r) => r.findings.some((f) => f.ernst !== 'info')).length; return { pages: all, ok: all - bad, bad }; };

module.exports = { age, targets, inspect, judge, audit, score, siteUrl, todayOn };
