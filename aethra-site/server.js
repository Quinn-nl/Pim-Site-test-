'use strict';
const http = require('http');
const cfg = require('./lib/config');
const store = require('./lib/store');
const auth = require('./lib/auth');
const { send, sendPage, redirect, clientIp, readBody, readForm, serveFile } = require('./lib/http');
const { inspectImage } = require('./lib/image');
const mail = require('./lib/mail');
const stats = require('./lib/stats');
const { AUDIENCES } = require('./lib/audiences');
const { parseMultipart } = require('./lib/multipart');
const { createLimiter } = require('./lib/ratelimit');
const { ROLES, GROUPS, IMAGE_SLOTS } = require('./lib/fields');
const { LANGS, isLang, detectLang, UI } = require('./lib/i18n');
const views = require('./lib/views');
const admin = require('./lib/admin-views');
const crypto = require('crypto');

const loginLimiter = createLimiter(5, 15 * 60 * 1000);
const contactLimiter = createLimiter(5, 60 * 60 * 1000);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const flashFrom = (url) => {
	const f = url.searchParams.get('f');
	const map = { saved: { ok: true, text: 'Saved.' }, deleted: { ok: true, text: 'Deleted.' }, pw: { ok: true, text: 'Password changed.' }, badpw: { ok: false, text: 'Current password is incorrect.' }, short: { ok: false, text: 'Use at least 12 characters.' }, badimg: { ok: false, text: 'Upload a JPG, PNG or WebP image of at most 5 MB.' }, nofile: { ok: false, text: 'Choose a file first.' } };
	return map[f] || null;
};

function requireAdmin(req, res) {
	const session = auth.getSession(req);
	if (!session) {
		redirect(res, '/admin');
		return null;
	}
	return session;
}

function csrfOk(session, token) {
	return !!token && auth.safeEqual(token, session.csrf);
}

const replyLimiter = createLimiter(1, 24 * 3600 * 1000); // one confirmation per address per day: the form can not be used to mail strangers repeatedly

/** Confirmation to the visitor (only when SMTP is configured and AUTO_REPLY is not 0). Fixed text, no visitor input. */
function confirmToVisitor(m, content) {
	if (process.env.AUTO_REPLY === '0' || !mail.configured()) return;
	if (!replyLimiter.allow(m.email.toLowerCase())) return;
	const t = UI[m.lang] || UI.en;
	mail.sendMail({
		to: [m.email],
		subject: t.ar_subject,
		text: t.ar_body.replace('{name}', content.values.site_name).replace('{reply}', content.values.contact_reply),
	}).then((r) => { if (!r.sent) console.error(`Confirmation mail failed: ${r.reason}`); });
}

/** E-mail the team about a new message. Failures are logged without personal data; the message stays in the inbox. */
function notify(m) {
	mail.sendMail({
		subject: `New website message (${m.role}, ${String(m.lang).toUpperCase()})`,
		text: `From: ${m.name} <${m.email}>\nOrganisation: ${m.org || '-'}\nRole: ${m.role}\nLanguage: ${m.lang}\n\n${m.message}\n`,
		replyTo: m.email,
	}).then((r) => {
		if (!r.sent && r.reason !== 'not configured') console.error(`Mail notification failed: ${r.reason}`);
	});
}

const LANG_COOKIE = 'aethra_lang';
const PAGE_RENDERERS = { '/': views.renderHome, '/problem': views.renderProblem, '/how-it-works': views.renderHow, '/applications': views.renderApplications, '/privacy': views.renderPrivacy };
const LEGACY = new Set(['/problem', '/how-it-works', '/applications', '/contact', '/privacy']);

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
		return send(res, 200, `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${siteUrl}/sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
	}
	if (get && url.pathname === '/sitemap.xml') {
		let modified = new Date();
		try { modified = require('fs').statSync(store.file('content.json')).mtime; } catch (e) { /* no edits yet */ }
		return send(res, 200, views.renderSitemap(siteUrl, modified.toISOString().slice(0, 10)), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
	}
	if (get && url.pathname === '/llms.txt') {
		const v = store.getContent('en').values;
		const lines = [`# ${v.site_name}`, '', `> ${v.meta_description}`, '', 'Status: prototype phase. Informational website; not an offer of securities or financial products.', ''];
		for (const l of LANGS) lines.push(`- [${l.toUpperCase()}: ${store.getContent(l).values.hero_title}](${siteUrl}/${l}/)`);
		lines.push('', '## Pages (English)', ...['/problem', '/how-it-works', '/applications', ...AUDIENCES.map((a) => `/for/${a.slug}`), '/contact'].map((p) => `- ${siteUrl}/en${p}`), '');
		return send(res, 200, lines.join('\n'), { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
	}
	if (get && url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });

	// Auto-detect: the bare address and legacy paths go to the visitor's language.
	if (get && url.pathname === '/') return redirect(res, `/${visitorLang(req)}/`, { ...LANG_VARY, 'Cache-Control': 'private, no-store' }, 302);
	if (get && LEGACY.has(url.pathname)) return redirect(res, `/${visitorLang(req)}${url.pathname}${url.search}`, LANG_VARY, 302);

	const m = /^\/([a-z]{2})(\/.*)?$/.exec(url.pathname);
	if (!m || !isLang(m[1])) return false;
	const lang = m[1];
	let page = m[2] || '/';
	if (get && !m[2]) return redirect(res, `/${lang}/`, {}, 301);
	if (page.length > 1 && page.endsWith('/')) page = page.slice(0, -1);
	const content = store.getContent(lang);
	const attribution = stats.sourceOf(url, req.headers.referer, req.headers.host);
	const utm = { source: stats.tag(url.searchParams.get('utm_source')), campaign: stats.tag(url.searchParams.get('utm_campaign')) };
	views.setCarry(utm);
	const ctx = { siteUrl };
	const aud = /^\/for\/([a-z-]+)$/.exec(page);
	const audience = aud && AUDIENCES.some((a) => a.slug === aud[1]) ? aud[1] : null;
	const countView = (key) => { if (get && stats.countable(req)) stats.record('v', { lang, page: key, ...attribution }); };

	if (get && page === '/contact') {
		countView('/contact');
		return send(res, 200, views.renderContact(content, { ...ctx, status: url.searchParams.get('contact') || '', token: auth.formToken(), role: url.searchParams.get('role') || '', utm }));
	}
	if (get && audience) {
		countView(page);
		return sendPage(req, res, views.renderAudience(content, ctx, audience));
	}
	if (get && PAGE_RENDERERS[page]) {
		countView(page);
		return sendPage(req, res, PAGE_RENDERERS[page](content, ctx));
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
		const saved = store.addMessage(msg);
		if (!saved) return again('error', {}, 503);
		notify(saved);
		confirmToVisitor(saved, content);
		stats.record('s', { lang, page: msg.role, source: msg.source, campaign: msg.campaign });
		return redirect(res, `/${lang}/contact?contact=sent`);
	}
	return false;
}

async function handleAdmin(req, res, url) {
	const p = url.pathname;
	const flash = flashFrom(url);
	const qlang = url.searchParams.get('lang');
	const lang = isLang(qlang) ? qlang : 'en';

	if (req.method === 'POST' && p === '/admin/login') {
		const ip = clientIp(req);
		const form = await readForm(req, 4096);
		if (!loginLimiter.allow(ip)) return send(res, 429, admin.loginPage({ ok: false, text: 'Too many attempts. Try again in 15 minutes.' }, false));
		if (!auth.checkPassword(form.password || '')) return send(res, 401, admin.loginPage({ ok: false, text: 'Incorrect password.' }, !auth.hasAdmin()));
		loginLimiter.clear(ip);
		const s = auth.createSession();
		return redirect(res, '/admin', { 'Set-Cookie': auth.cookieHeader(s.id, 8 * 3600) });
	}

	const session = auth.getSession(req);
	if (req.method === 'GET' && p === '/admin' && !session) return send(res, 200, admin.loginPage(null, !auth.hasAdmin()));
	if (!session) return redirect(res, '/admin');

	if (req.method === 'GET') {
		const c = store.getContent(lang);
		if (p === '/admin') return send(res, 200, admin.contentPage(session, lang, c.values, flash));
		if (p === '/admin/photos') return send(res, 200, admin.photosPage(session, c.images, flash));
		if (p === '/admin/privacy') return send(res, 200, admin.privacyPage(session, lang, c.privacy, flash));
		if (p === '/admin/stats') {
			const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
			return send(res, 200, admin.statsPage(session, stats.summary(days), days));
		}
		if (p === '/admin/messages.csv') {
			return send(res, 200, store.messagesCsv(), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="aethra-messages.csv"' });
		}
		if (p === '/admin/messages') {
			const html = admin.messagesPage(session, store.listMessages(), cfg.RETENTION_DAYS, flash);
			store.markAllRead();
			return send(res, 200, html);
		}
		if (p === '/admin/account') return send(res, 200, admin.accountPage(session, flash));
		return false;
	}

	if (req.method !== 'POST') return false;

	if (p === '/admin/photos') {
		const body = await readBody(req, cfg.MAX_IMAGE_BYTES + 64 * 1024);
		let parsed;
		try {
			parsed = parseMultipart(body, req.headers['content-type']);
		} catch (e) {
			return redirect(res, '/admin/photos?f=badimg');
		}
		const { fields, files } = parsed;
		if (!csrfOk(session, fields.csrf)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
		if (!IMAGE_SLOTS.some((s) => s.slot === fields.slot)) return redirect(res, '/admin/photos?f=badimg');
		const alt = String(fields.alt || '').replace(/\s+/g, ' ').trim().slice(0, 200);
		const existing = store.getContent('en').images[fields.slot];
		if (fields.action === 'remove') {
			store.setImage(fields.slot, null);
			return redirect(res, '/admin/photos?f=deleted');
		}
		const upload = files.find((f) => f.name === 'file' && f.data.length > 0);
		if (!upload) {
			if (existing) {
				store.setImage(fields.slot, { ...existing, alt });
				return redirect(res, '/admin/photos?f=saved');
			}
			return redirect(res, '/admin/photos?f=nofile');
		}
		const img = upload.data.length <= cfg.MAX_IMAGE_BYTES && inspectImage(upload.data);
		if (!img) return redirect(res, '/admin/photos?f=badimg');
		const name = `${fields.slot}-${crypto.randomBytes(8).toString('hex')}.${img.ext}`;
		store.ensureDirs();
		require('fs').writeFileSync(require('path').join(store.uploadsDir(), name), img.data, { mode: 0o600 });
		store.setImage(fields.slot, { file: name, alt, w: img.width, h: img.height });
		return redirect(res, '/admin/photos?f=saved');
	}

	const form = await readForm(req, 300 * 1024);
	if (!csrfOk(session, form.csrf)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });

	if (p === '/admin/logout') {
		auth.destroySession(req);
		return redirect(res, '/admin', { 'Set-Cookie': auth.cookieHeader('', 0) });
	}
	if (p === '/admin/content') {
		const flang = isLang(form.lang) ? form.lang : 'en';
		const values = {};
		for (const g of GROUPS) for (const f of g.fields) if (f.key in form) values[f.key] = form[f.key];
		const r = store.saveContent({ lang: flang, values });
		if (!r.ok) return send(res, 400, admin.contentPage(session, flang, { ...store.getContent(flang).values, ...values }, { ok: false, text: r.errors.join(' ') }));
		return redirect(res, `/admin?lang=${flang}&f=saved`);
	}
	if (p === '/admin/privacy') {
		const flang = isLang(form.lang) ? form.lang : 'en';
		store.saveContent({ lang: flang, privacy: form.privacy || '' });
		return redirect(res, `/admin/privacy?lang=${flang}&f=saved`);
	}
	if (p === '/admin/messages/delete') {
		store.deleteMessage(String(form.id || ''));
		return redirect(res, '/admin/messages?f=deleted');
	}
	if (p === '/admin/account') {
		if (!auth.checkPassword(form.current || '')) return redirect(res, '/admin/account?f=badpw');
		if (String(form.password || '').length < 12) return redirect(res, '/admin/account?f=short');
		auth.setPassword(form.password);
		auth.destroyOtherSessions(req);
		return redirect(res, '/admin/account?f=pw');
	}
	return false;
}

function createServer() {
	store.ensureDirs();
	return http.createServer(async (req, res) => {
		try {
			if (req.method === 'HEAD') req.method = 'GET'; // Node drops the body of a HEAD response itself
			const url = new URL(req.url, 'http://localhost');
			let handled = false;
			if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) handled = await handleAdmin(req, res, url);
			else if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) handled = serveFile(res, store.uploadsDir(), url.pathname.slice('/uploads/'.length), 'public, max-age=31536000, immutable');
			else if (req.method === 'GET' && (url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/') || url.pathname.startsWith('/img/') || url.pathname.startsWith('/fonts/'))) handled = serveFile(res, cfg.PUBLIC_DIR, url.pathname.slice(1), url.pathname.startsWith('/fonts/') ? 'public, max-age=604800' : 'public, max-age=3600');
			else handled = await handlePublic(req, res, url);
			if (handled === false) {
				const seg = /^\/([a-z]{2})(\/|$)/.exec(url.pathname);
				const lang = seg && isLang(seg[1]) ? seg[1] : visitorLang(req);
				send(res, 404, views.renderNotFound(store.getContent(lang), { siteUrl: siteUrlFor(req) }));
			}
		} catch (err) {
			if (res.headersSent) return res.end();
			const status = err.status || 500;
			if (status === 500) console.error(err);
			send(res, status, status === 413 ? 'Payload too large' : 'Server error', { 'Content-Type': 'text/plain' });
		}
	});
}

if (require.main === module) {
	const server = createServer();
	server.listen(cfg.PORT, cfg.HOST, () => console.log(`Aethra site on http://${cfg.HOST}:${cfg.PORT}`));
	for (const sig of ['SIGTERM', 'SIGINT']) {
		process.on(sig, () => {
			stats.flush();
			server.close(() => process.exit(0));
			setTimeout(() => process.exit(0), 5000).unref();
		});
	}
}

module.exports = { createServer, contactLimiter };
