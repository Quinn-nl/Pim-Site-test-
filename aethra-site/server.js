'use strict';
const http = require('http');
const cfg = require('./lib/config');
const store = require('./lib/store');
const auth = require('./lib/auth');
const { send, sendPage, redirect, clientIp, readForm, serveFile } = require('./lib/http');
const mail = require('./lib/mail');
const stats = require('./lib/stats');
const { AUDIENCES } = require('./lib/audiences');
const worst = require('./lib/worst-case');
const DEV_TOGGLE = process.env.DEV_TOGGLE === '1' && process.env.NODE_ENV !== 'production';
const { createLimiter } = require('./lib/ratelimit');
const { ROLES } = require('./lib/fields');
const { LANGS, isLang, detectLang } = require('./lib/i18n');
const views = require('./lib/views');
const db = require('./lib/cms/db');
const cmsAdmin = require('./lib/cms/admin');
const messages = require('./lib/cms/messages');
const redirects = require('./lib/cms/redirects');
const cache = require('./lib/cms/cache');
const cmsContent = require('./lib/cms/content');
const render = require('./lib/cms/render');
const ws = require('./lib/cms/ws');
const events = require('./lib/cms/events');
const jobs = require('./lib/cms/jobs');
const settings = require('./lib/cms/settings');
const sharelinks = require('./lib/cms/sharelinks');
const legacy = require('./lib/cms/legacy');

const contactLimiter = createLimiter(5, 60 * 60 * 1000);
const EMAIL = /^[^\s@<>(),;:\\"\[\]]+@[^\s@<>(),;:\\"\[\]]+\.[^\s@<>(),;:\\"\[\]]+$/;

const dailyReplyCap = createLimiter(200, 24 * 3600 * 1000); // overall ceiling, whatever the senders' addresses or IPs
const replyLimiter = createLimiter(1, 24 * 3600 * 1000); // one confirmation per address per day: the form can not be used to mail strangers repeatedly

/** Confirmation to the visitor: queued like every mail (only when SMTP is configured and AUTO_REPLY is not 0). Fixed text, no visitor input. */
function confirmToVisitor(saved) {
	if (process.env.AUTO_REPLY === '0' || !mail.configured()) return;
	if (!replyLimiter.allow(saved.email.toLowerCase()) || !dailyReplyCap.allow('all')) return;
	messages.enqueue(saved.id, 'bezoeker');
}

const LANG_COOKIE = 'aethra_lang';
const LEGACY = new Set(['/problem', '/how-it-works', '/applications', '/contact', '/privacy']);
/** The context page is published only when the English content has today_enabled = yes (sources are checked by a person first). */
const todayOn = () => String(store.getContent('en').values.today_enabled || '').trim().toLowerCase() === 'yes';

function siteUrlFor(req) {
	if (cfg.SITE_URL) return cfg.SITE_URL;
	const host = String(req.headers.host || '');
	return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${cfg.SECURE ? 'https' : 'http'}://${host}` : 'http://localhost';
}

const visitorLang = (req) => detectLang(auth.parseCookies(req.headers.cookie)[LANG_COOKIE], req.headers['accept-language']);
const LANG_VARY = { Vary: 'Accept-Language, Cookie, Accept-Encoding', 'Cache-Control': 'private, no-store' };

async function handlePublic(req, res, url) {
	const siteUrl = siteUrlFor(req);
	const get = req.method === 'GET';

	if (get && url.pathname === '/robots.txt') {
		// Search and answer bots stay allowed. Training-only bots are blocked unless AI_TRAINING=allow (a licensing choice, it does not affect search or AI answers).
		const training = process.env.AI_TRAINING === 'allow' ? '' : `${['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot', 'Applebot-Extended'].map((b) => `User-agent: ${b}`).join('\n')}\nDisallow: /\n\n`;
		return send(res, 200, `${training}User-agent: *\nAllow: /\nDisallow: /admin\nContent-Signal: search=yes, ai-input=yes, ai-train=${process.env.AI_TRAINING === 'allow' ? 'yes' : 'no'}\n\nSitemap: ${siteUrl}/sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
	}
	if (get && url.pathname === '/sitemap.xml') {
		const modified = cmsContent.lastModified();
		return send(res, 200, views.renderSitemap(siteUrl, modified, todayOn() ? ['/eco-mode-today'] : [], store.publishedPages(), store.pageVersions), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
	}
	if (get && url.pathname === '/llms.txt') {
		const v = store.getContent('en').values;
		const lines = [`# ${v.site_name}`, '', `> ${v.meta_description}`, '', 'Status: prototype phase. Informational website; not an offer of securities or financial products.', ''];
		for (const l of LANGS) lines.push(`- [${l.toUpperCase()}: ${store.getContent(l).values.hero_title}](${siteUrl}/${l}/)`);
		lines.push('', '## Pages (English)', ...['/problem', '/how-it-works', '/applications', ...AUDIENCES.map((a) => `/for/${a.slug}`), ...(todayOn() ? ['/eco-mode-today'] : []), '/contact'].map((p) => `- ${siteUrl}/en${p}`), '');
		const extra = store.publishedPages();
		if (extra.length) lines.push('', '## More pages', ...extra.map((p) => `- [${p.title}](${siteUrl}/${p.language}/${p.slug})`), '');
		return send(res, 200, lines.join('\n'), { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
	}
	if (get && url.pathname === '/.well-known/security.txt' && process.env.SECURITY_CONTACT) {
		const expires = new Date(Date.now() + 365 * 86400000).toISOString();
		return send(res, 200, `Contact: ${process.env.SECURITY_CONTACT}\nExpires: ${expires}\nPreferred-Languages: en, nl\nCanonical: ${siteUrl}/.well-known/security.txt\n`, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
	}
	let sm;
	if (get && (sm = /^\/voorbeeld\/([A-Za-z0-9_-]{43})$/.exec(url.pathname))) {
		const link = sharelinks.find(sm[1]);
		if (!link) return send(res, 404, 'Deze voorbeeldlink bestaat niet of is verlopen.', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
		const p = link.payload || {};
		let html = render.previewAny({ kind: link.soort, lang: link.taal, velden: p.velden, meta: p.meta, path: link.pad, siteUrl });
		if (!html) return send(res, 404, 'Voor dit onderdeel is geen voorbeeld beschikbaar.', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
		const note = { en: 'Preview of an unpublished draft. Only visible with this link.', nl: 'Voorbeeld van een concept dat nog niet gepubliceerd is. Alleen zichtbaar met deze link.', de: 'Vorschau eines unveröffentlichten Entwurfs. Nur mit diesem Link sichtbar.', fr: 'Aperçu d’un brouillon non publié. Visible uniquement avec ce lien.' }[link.taal];
		html = html.replace('content="index, follow, max-image-preview:large"', 'content="noindex, nofollow"').replace(/<link rel="canonical"[^>]*>\n?/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace('<body>', `<body><div class="site-banner" role="status">${views.esc(note)}</div>`);
		return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
	}
	if (get && url.pathname === '/favicon.ico') return redirect(res, '/img/favicon.svg', { 'Cache-Control': 'public, max-age=86400' }, 301);
	const indexNowKey = String(process.env.INDEXNOW_KEY || '');
	if (get && /^[A-Za-z0-9-]{8,128}$/.test(indexNowKey) && url.pathname === `/${indexNowKey}.txt`) return send(res, 200, indexNowKey, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
	if (get && url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });

	if (DEV_TOGGLE && get && url.pathname === '/__data') {
		const mode = ['demo', 'worst', 'empty'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'demo';
		const back = String(url.searchParams.get('back') || '/');
		return redirect(res, back.startsWith('/') && !back.startsWith('//') ? back : '/', { 'Set-Cookie': `aethra_dev_data=${mode}; Path=/; SameSite=Lax` });
	}

	// Auto-detect: the bare address and legacy paths go to the visitor's language.
	if (get && url.pathname === '/') return redirect(res, `/${visitorLang(req)}/`, { ...LANG_VARY, 'Cache-Control': 'private, no-store' }, 302);
	if (get && LEGACY.has(url.pathname)) return redirect(res, `/${visitorLang(req)}${url.pathname}${url.search}`, LANG_VARY, 302);

	const m = /^\/([a-z]{2})(\/.*)?$/.exec(url.pathname);
	if (!m || !isLang(m[1])) return false;
	const lang = m[1];
	let page = m[2] || '/';
	if (get && !m[2]) return redirect(res, `/${lang}/`, {}, 301);
	if (page.length > 1 && page.endsWith('/')) {
		if (get) return redirect(res, `/${lang}${page.replace(/\/+$/, '')}${url.search}`, {}, 301); // one URL per page
		page = page.replace(/\/+$/, '');
	}
	const content = store.getContent(lang);
	if (DEV_TOGGLE) {
		const mode = auth.parseCookies(req.headers.cookie).aethra_dev_data || 'demo';
		content.values = worst.overlay(mode, content.values);
		res.devToggle = worst.toggleHtml(mode, url.pathname + url.search);
	}
	views.setToday(todayOn());
	views.setFooterPages(store.footerPages(lang));
	views.setMenu(store.menuFor(lang, todayOn()));
	views.setBanner(store.bannerFor(lang));
	if (page === '/eco-mode-today' && !todayOn()) return false;
	const attribution = stats.sourceOf(url, req.headers.referer, req.headers.host);
	const utm = { source: stats.tag(url.searchParams.get('utm_source')), campaign: stats.tag(url.searchParams.get('utm_campaign')) };
	views.setCarry(utm);
	const ctx = { siteUrl };
	const countView = (key) => { if (get && stats.countable(req)) stats.record('v', { lang, page: key, ...attribution }); };

	if (get && page === '/contact') {
		countView('/contact');
		return send(res, 200, views.renderContact(content, { ...ctx, status: url.searchParams.get('contact') || '', token: auth.formToken(), role: url.searchParams.get('role') || '', utm }));
	}
	if (get) {
		// Micro-cache: plain visits (no tags, no dev toggle) are answered from memory until something is published.
		// While the database is down the cache is served even past its time limit.
		const cacheable = !url.search && !DEV_TOGGLE;
		const key = `${lang}|${siteUrl}|${page}`;
		let html = cacheable ? (db.degraded() ? cache.getStale(key) : cache.get(key)) : null;
		if (!html) {
			const created = /^\/[a-z0-9-]+$/.test(page) ? store.findPage(lang, page.slice(1)) : null; // a page made in the CMS
			html = created ? views.renderPage(content, ctx, created, store.pageVersions(created)) : render.renderFixed(page, content, ctx);
			if (html && cacheable) cache.set(key, html);
		}
		if (html) {
			countView(page);
			return sendPage(req, res, html);
		}
	}

	if (req.method === 'POST' && page === '/contact') {
		const ip = clientIp(req);
		const form = await readForm(req);
		const msg = {
			lang,
			name: (form.name || '').trim().slice(0, 120),
			email: (form.email || '').trim().slice(0, 200),
			org: (form.organisation || '').trim().slice(0, 160),
			role: ROLES.includes(form.role) ? form.role : 'Other',
			message: (form.message || '').trim(),
			source: stats.tag(form.utm_source) || 'direct',
			campaign: stats.tag(form.utm_campaign),
		};
		const again = (status, errors = {}, code = 200) => send(res, code, views.renderContact(content, { ...ctx, status, errors, token: auth.formToken(), form: msg, utm: { source: msg.source === 'direct' ? '' : msg.source, campaign: msg.campaign } }));
		const token = auth.inspectFormToken(form.token);
		if (form.website || token === 'bad') return redirect(res, `/${lang}/contact?contact=sent`); // bots get a quiet success
		if (token !== 'ok') return again('expired');
		if (!contactLimiter.allow(ip)) return again('limit', {}, 429);
		const errors = {};
		if (!msg.name) errors.name = true;
		if (!EMAIL.test(msg.email)) errors.email = true;
		if (!msg.message || msg.message.length > 5000) errors.message = true;
		if (!form.consent) errors.consent = true;
		if (Object.keys(errors).length) return again('invalid', errors, 422);
		let saved = null;
		try { saved = messages.add(msg); } catch (e) { console.error(`Message could not be stored: ${e.message}`); }
		if (!saved) return again('error', {}, 503);
		confirmToVisitor(saved);
		stats.record('s', { lang, page: msg.role, source: msg.source, campaign: msg.campaign });
		return redirect(res, `/${lang}/contact?contact=sent`);
	}
	return false;
}

/** Maintenance mode (Instellingen): visitors get a 503 page; the admin, health check and static files keep working. */
const MAINT_OPEN = /^\/(admin(\/|$)|healthz$|css\/|js\/|img\/|fonts\/|uploads\/|robots\.txt$)/;
function maintenanceBlocks(req, url) {
	try { return !db.degraded() && settings.maintenance() && !MAINT_OPEN.test(url.pathname); } catch (e) { return false; }
}
function maintenancePage(req, res) {
	const url = new URL(req.url, 'http://localhost');
	const seg = /^\/([a-z]{2})(\/|$)/.exec(url.pathname);
	const lang = seg && isLang(seg[1]) ? seg[1] : visitorLang(req);
	const title = { en: 'Back soon', nl: 'We zijn zo terug', de: 'Gleich wieder da', fr: 'De retour bientôt' }[lang];
	const fallback = { en: 'We are doing some maintenance. Please try again in a little while.', nl: 'We voeren onderhoud uit. Probeer het straks opnieuw.', de: 'Wir führen Wartungsarbeiten durch. Bitte versuchen Sie es gleich noch einmal.', fr: 'Nous effectuons une maintenance. Merci de réessayer dans un instant.' }[lang];
	const text = settings.maintenanceText(lang) || fallback;
	const esc = views.esc;
	send(res, 503, `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="stylesheet" href="/css/design-tokens.css"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f9fc;color:#0b1b33;font:18px/1.6 "IBM Plex Sans",system-ui,sans-serif;text-align:center;padding:1.5rem}main{max-width:32rem}h1{font-family:"Exo 2",system-ui,sans-serif;margin:0 0 .5rem}</style></head><body><main><h1>${esc(title)}</h1><p>${esc(text)}</p></main></body></html>`, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '3600', 'Cache-Control': 'no-store' });
}

function createServer() {
	store.ensureDirs();
	db.open();
	legacy.importLegacy();
	const server = http.createServer(async (req, res) => {
		try {
			if (req.method === 'HEAD') req.method = 'GET'; // Node drops the body of a HEAD response itself
			const url = new URL(req.url, 'http://localhost');
			let handled = false;
			if (maintenanceBlocks(req, url)) return maintenancePage(req, res);
			if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) handled = await cmsAdmin.handleAdmin(req, res, url);
			else if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) handled = serveFile(res, store.uploadsDir(), url.pathname.slice('/uploads/'.length), 'public, max-age=31536000, immutable');
			else if (req.method === 'GET' && (url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/') || url.pathname.startsWith('/img/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/deck/'))) handled = serveFile(res, cfg.PUBLIC_DIR, url.pathname.slice(1), url.pathname.startsWith('/fonts/') ? 'public, max-age=604800' : (url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'));
			else handled = await handlePublic(req, res, url);
			if (handled === false) {
				if (req.method === 'GET' && !db.degraded()) { // a page whose address changed: permanent redirect
					let to = null;
					try { to = redirects.find(url.pathname); } catch (e) { /* no redirect table access: plain 404 */ }
					if (to) return redirect(res, to, {}, 301);
				}
				const seg = /^\/([a-z]{2})(\/|$)/.exec(url.pathname);
				const lang = seg && isLang(seg[1]) ? seg[1] : visitorLang(req);
				send(res, 404, views.renderNotFound(store.getContent(lang), { siteUrl: siteUrlFor(req) }));
			}
		} catch (err) {
			if (res.headersSent) return res.end();
			const status = err.status || 500;
			if (status === 500) console.error(err);
			send(res, status, status === 413 ? 'Payload too large' : status === 503 ? 'Service unavailable' : 'Server error', { 'Content-Type': 'text/plain' });
		}
	});
	server.on('upgrade', (req, socket, head) => ws.upgrade(req, socket, head)); // edit locks (WebSocket)
	return server;
}

/** Starts listening with the upgrade handler (edit locks), the background jobs and a graceful shutdown. */
function start() {
	const server = createServer();
	server.headersTimeout = 15000;
	server.requestTimeout = 30000; // slow-loris: a request must complete within 30 s
	server.keepAliveTimeout = 5000;
	server.maxHeadersCount = 50;
	let active = 0;
	server.on('request', (req, res) => { active += 1; res.on('close', () => { active -= 1; }); });
	ws.start();
	jobs.start();
	server.listen(cfg.PORT, cfg.HOST, () => console.log(`Aethra site on http://${cfg.HOST}:${cfg.PORT}`));
	let stopping = false;
	const shutdown = (sig) => {
		if (stopping) return;
		stopping = true;
		console.log(`${sig}: no new connections, finishing running work (at most 10 seconds)`);
		server.close(); // no new HTTP connections
		events.closeAll();
		ws.closeAll();
		jobs.stop();
		const started = Date.now();
		const wait = setInterval(() => {
			if ((active <= 0 && !messages.busy()) || Date.now() - started > 10000) {
				clearInterval(wait);
				try { stats.flush(); db.close(); } catch (e) { /* closing */ }
				process.exit(0);
			}
		}, 100);
	};
	for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => shutdown(sig));
	return server;
}

if (require.main === module) start();

module.exports = { createServer, start, contactLimiter };
