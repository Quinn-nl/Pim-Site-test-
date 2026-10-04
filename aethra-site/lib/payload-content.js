'use strict';
/**
 * Pulls the website's content from the Payload CMS in the background: texts (one global per group), photos and
 * pages. Read-only and public (Payload only exposes published pages to visitors). If the CMS is unreachable the
 * last good copy (or our own saved content) keeps serving, so the public site never depends on it being up.
 * Enable with CONTENT_SOURCE=payload and CMS_URL (for example http://127.0.0.1:3001).
 */
const store = require('./store');
const { GROUPS, IMAGE_SLOTS } = require('./fields');
const { LANGS } = require('./i18n');

const PREFIX = '/admin2';
const POLL_MS = Math.max(5000, Number(process.env.CMS_POLL_MS) || 30000);
const globalSlug = (groupId) => `site-${groupId.replace(/_/g, '-')}`;
let timer = null;

const api = (base, path) => `${base.replace(/\/+$/, '')}${PREFIX}/api${path}`;

async function getJson(fetchFn, url) {
	const res = await fetchFn(url, { signal: AbortSignal.timeout(10000) });
	if (!res.ok) throw new Error(`CMS answered ${res.status} for ${url.replace(/^https?:\/\/[^/]+/, '')}`);
	return res.json();
}

/** One fetch round: texts, photos, pages. Throws when the texts cannot be read; pages and photos are optional. */
async function refresh(fetchFn = fetch, base = process.env.CMS_URL) {
	if (!base) throw new Error('CMS_URL is required');
	// Texts: locale=all returns { field: { en: '...', nl: '...' } } for every localized field
	const byLang = Object.fromEntries(LANGS.map((l) => [l, {}]));
	const docs = await Promise.all(GROUPS.map((g) => getJson(fetchFn, api(base, `/globals/${globalSlug(g.id)}?locale=all&depth=0`))));
	docs.forEach((doc, i) => {
		for (const f of GROUPS[i].fields) {
			const perLocale = doc && doc[f.key];
			if (!perLocale || typeof perLocale !== 'object') continue;
			for (const l of LANGS) if (typeof perLocale[l] === 'string') byLang[l][f.key] = perLocale[l];
		}
	});
	try { // privacy statement
		const pr = await getJson(fetchFn, api(base, '/globals/privacy?locale=all&depth=0'));
		for (const l of LANGS) if (pr && pr.text && typeof pr.text[l] === 'string') byLang[l].privacy = pr.text[l];
	} catch (e) { /* optional */ }
	store.setRemote(byLang);

	try { // photos
		const ph = await getJson(fetchFn, api(base, '/globals/photos?depth=1'));
		const images = {};
		for (const s of IMAGE_SLOTS) {
			const m = ph && ph[s.slot];
			if (m && typeof m === 'object' && m.filename) images[s.slot] = { url: `${PREFIX}/api/media/file/${encodeURIComponent(m.filename)}`, alt: String(m.alt || '').slice(0, 200), w: Number(m.width) || undefined, h: Number(m.height) || undefined };
		}
		store.setRemoteImages(images);
	} catch (e) { store.setRemoteImages({}); }

	try { // pages
		const pg = await getJson(fetchFn, api(base, '/pages?locale=all&depth=0&limit=200&draft=false'));
		const rows = [];
		for (const doc of (pg && pg.docs) || []) {
			const loc = (name, l) => (doc[name] && typeof doc[name] === 'object' ? doc[name][l] : undefined);
			for (const l of LANGS) {
				const title = loc('title', l);
				const slug = loc('slug', l);
				if (!title || !slug) continue;
				rows.push({
					id: doc.id, status: doc._status || 'published', language: l, slug, title, lead: loc('lead', l) || '',
					body: loc('body', l) || '', seo_title: loc('seoTitle', l) || '', seo_description: loc('seoDescription', l) || '',
					translation_group: `p${doc.id}`, show_in_footer: doc.showInFooter === true, date_updated: doc.updatedAt || '',
				});
			}
		}
		store.setRemotePages(rows);
	} catch (e) { store.setRemotePages([]); }
	return LANGS;
}

function start() {
	if (process.env.CONTENT_SOURCE !== 'payload' || !process.env.CMS_URL) return false;
	let failing = '';
	const tick = () => refresh().then(() => { if (failing) console.log('CMS content refresh recovered'); failing = ''; }).catch((e) => { if (failing !== e.message) console.error(`CMS content refresh failed (keeping the last copy): ${e.message}`); failing = e.message; });
	tick();
	timer = setInterval(tick, POLL_MS);
	timer.unref();
	return true;
}

const stop = () => { if (timer) clearInterval(timer); timer = null; };

module.exports = { start, stop, refresh, globalSlug };
