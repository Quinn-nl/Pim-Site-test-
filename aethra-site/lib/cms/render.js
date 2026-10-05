'use strict';
/** Which template draws which public path, shared by the public router and the admin preview. */
const views = require('../views');
const store = require('../store');
const pages = require('./pages');
const { FIELDS } = require('../fields');
const { AUDIENCES } = require('../audiences');
const { LANGS } = require('../i18n');

const FIXED = { '/': views.renderHome, '/problem': views.renderProblem, '/how-it-works': views.renderHow, '/applications': views.renderApplications, '/privacy': views.renderPrivacy, '/eco-mode-today': views.renderToday };

/** HTML for a fixed public path (null when the path is not one of them). */
function renderFixed(path, content, ctx) {
	if (path === '/contact') return views.renderContact(content, { ...ctx, status: '', token: ctx.token || '', role: '', utm: {} });
	const aud = /^\/for\/([a-z-]+)$/.exec(path);
	if (aud && AUDIENCES.some((a) => a.slug === aud[1])) return views.renderAudience(content, ctx, aud[1]);
	if (FIXED[path]) return FIXED[path](content, ctx);
	return null;
}

/** The page as a visitor would see it, built from what the editor has typed (nothing is stored). */
function previewText({ lang, path, velden, privacy, siteUrl }) {
	const content = store.getContent(lang);
	const posted = (velden && velden[lang]) || {};
	const values = { ...content.values };
	for (const [key, raw] of Object.entries(posted)) {
		const field = FIELDS[key];
		if (!field) continue;
		const v = store.cleanValue(field, raw);
		if (v !== null && (v !== '' || /^(about_text|p\d_(name|role|bio|link)|company_details|linkedin_url|today_enabled|status_note|contact_reply|company_line|home_problem_line|status_short|cta_text|meta_description|fact\d_url|fact\d_source)$/.test(key))) values[key] = v;
	}
	const merged = { ...content, values, privacy: typeof privacy === 'string' && privacy.trim() ? privacy : content.privacy };
	const todayOn = path === '/eco-mode-today' || String(values.today_enabled || '').toLowerCase() === 'yes';
	views.setToday(todayOn);
	views.setFooterPages(store.footerPages(lang));
	views.setMenu(store.menuFor(lang, todayOn));
	views.setCarry({});
	return renderFixed(path, merged, { siteUrl });
}

/** A page made in the CMS, built leniently from the editor state. */
function previewPage({ lang, velden, meta, siteUrl }) {
	const content = store.getContent(lang);
	const indeling = Array.isArray(meta && meta.indeling) ? meta.indeling.map((s) => ({ id: String(s.id), type: String(s.type) })) : [];
	const allowed = pages.allowedFields(indeling);
	const given = (velden && velden[lang]) || {};
	const clean = {};
	for (const [key, f] of allowed) if (key in given) { const r = pages.cleanValue(f, given[key]); if (!r.error && r.value !== '') clean[key] = r.value; }
	const page = {
		language: lang, slug: clean.slug || 'voorbeeld', title: clean.titel || '(zonder titel)', lead: clean.lead || '',
		seo_title: clean.seo_title || '', seo_description: clean.seo_description || '', indeling: undefined,
		indexeren: !(meta && meta.indexeren === false),
		sections: indeling.map((s) => ({ id: s.id, type: s.type, values: Object.fromEntries(Object.entries(clean).filter(([k]) => k.startsWith(`s.${s.id}.`)).map(([k, v]) => [k.slice(`s.${s.id}.`.length), v])) })),
	};
	views.setToday(false);
	views.setFooterPages(store.footerPages(lang));
	views.setMenu(store.menuFor(lang, false));
	views.setCarry({});
	return views.renderPage(content, { siteUrl }, page, { [lang]: page.slug });
}

module.exports = { FIXED, renderFixed, previewText, previewPage, LANGS };
