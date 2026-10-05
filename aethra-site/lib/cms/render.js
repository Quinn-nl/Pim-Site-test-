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
	views.setBanner(store.bannerFor(lang));
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
	views.setBanner(store.bannerFor(lang));
	views.setCarry({});
	return views.renderPage(content, { siteUrl }, page, { [lang]: page.slug });
}

/**
 * The published page at a public path in one language, exactly as a visitor gets it (used by the SEO and link checks).
 * path: '/problem', '/for/fleets', or '/some-slug' of a page made in the CMS. Returns { html, indexable } or null.
 */
function renderPublic(lang, path, siteUrl, todayOn) {
	const content = store.getContent(lang);
	views.setToday(!!todayOn);
	views.setFooterPages(store.footerPages(lang));
	views.setMenu(store.menuFor(lang, !!todayOn));
	views.setBanner(store.bannerFor(lang));
	views.setCarry({});
	const created = path.length > 1 && !FIXED[path] && path !== '/contact' && !path.startsWith('/for/') ? store.findPage(lang, path.slice(1)) : null;
	const html = created ? views.renderPage(content, { siteUrl }, created, store.pageVersions(created)) : renderFixed(path, content, { siteUrl });
	return html ? { html, indexable: created ? created.indexeren !== false : true } : null;
}

/** Any preview from an editor state: { kind, lang, velden, meta, path, siteUrl }. Returns HTML or null. */
function previewAny({ kind, lang, velden, meta, path, siteUrl }) {
	try {
		if (kind === 'pagina') return previewPage({ lang, velden, meta, siteUrl });
		if (kind === 'privacy') return previewText({ lang, path: '/privacy', velden: {}, privacy: velden && velden[lang] && velden[lang].text, siteUrl });
		return previewText({ lang, path: String(path || '/'), velden, siteUrl });
	} catch (e) { return null; }
}

module.exports = { renderPublic, previewAny, FIXED, renderFixed, previewText, previewPage, LANGS };
