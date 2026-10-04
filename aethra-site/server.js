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
const worst = require('./lib/worst-case');
const DEV_TOGGLE = process.env.DEV_TOGGLE === '1' && process.env.NODE_ENV !== 'production';
const { parseMultipart } = require('./lib/multipart');
const { createLimiter } = require('./lib/ratelimit');
const { ROLES, GROUPS, IMAGE_SLOTS } = require('./lib/fields');
const { LANGS, isLang, detectLang, UI } = require('./lib/i18n');
const views = require('./lib/views');
const admin = require('./lib/admin-views');
const crypto = require('crypto');

const loginLimiter = createLimiter(5, 15 * 60 * 1000);
const accountLimiter = createLimiter(5, 15 * 60 * 1000);
const contactLimiter = createLimiter(5, 60 * 60 * 1000);
const EMAIL = /^[^\s@<>(),;:\\"\[\]]+@[^\s@<>(),;:\\"\[\]]+\.[^\s@<>(),;:\\"\[\]]+$/;

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

const dailyReplyCap = createLimiter(200, 24 * 3600 * 1000); // overall ceiling, whatever the senders' addresses or IPs
const replyLimiter = createLimiter(1, 24 * 3600 * 1000); // one confirmation per address per day: the form can not be used to mail strangers repeatedly

/** Confirmation to the visitor (only when SMTP is configured and AUTO_REPLY is not 0). Fixed text, no visitor input. */
function confirmToVisitor(m, content) {
	if (process.env.AUTO_REPLY === '0' || !mail.configured()) return;
	if (!replyLimiter.allow(m.email.toLowerCase()) || !dailyReplyCap.allow('all')) return;
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
		// Search and answer bots stay allowed. Training-only bots are blocked unless AI_TRAINING=allow (a licensing choice, it does not affect search or AI answers).
		const training = process.env.AI_TRAINING === 'allow' ? '' : `${['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot', 'Applebot-Extended'].map((b) => `User-agent: ${b}`).join('\n')}\nDisallow: /\n\n`;
		return send(res, 200, `${training}User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${siteUrl}/sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
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
	if (get && url.pathname === '/.well-known/security.txt' && process.env.SECURITY_CONTACT) {
		const expires = new Date(Date.now() + 365 * 86400000).toISOString();
		return send(res, 200, `Contact: ${process.env.SECURITY_CONTACT}\nExpires: ${expires}\nPreferred-Languages: en, nl\nCanonical: ${siteUrl}/.well-known/security.txt\n`, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
	}
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
	if (page.length > 1 && page.endsWith('/')) page = page.slice(0, -1);
	const content = store.getContent(lang);
	if (DEV_TOGGLE) {
		const mode = auth.parseCookies(req.headers.cookie).aethra_dev_data || 'demo';
		content.values = worst.overlay(mode, content.values);
		res.devToggle = worst.toggleHtml(mode, url.pathname + url.search);
	}
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

/** Defence in depth next to SameSite=Strict and the CSRF token: a cross-site Origin on an admin POST is refused. */
function sameOrigin(req) {
	const origin = req.headers.origin;
	if (!origin || origin === 'null') return !origin;
	try {
		const host = new URL(origin).host;
		return host === String(req.headers.host || '') || (!!cfg.SITE_URL && host === new URL(cfg.SITE_URL).host);
	} catch (e) {
		return false;
	}
}

async function handleAdmin(req, res, url) {
	const p = url.pathname;
	if (req.method === 'POST' && !sameOrigin(req)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
	const flash = flashFrom(url);
	const qlang = url.searchParams.get('lang');
	const lang = isLang(qlang) ? qlang : 'en';

	if (req.method === 'POST' && p === '/admin/login') {
		const ip = clientIp(req);
		const form = await readForm(req, 4096);
		if (!loginLimiter.allow(ip)) return send(res, 429, admin.loginPage({ ok: false, text: 'Too many attempts. Try again in 15 minutes.' }, false));
		if (!auth.checkPassword(form.password || '')) return send(res, 401, admin.loginPage({ ok: false, text: 'Incorrect password.' }, !auth.hasAdmin()));
		if (auth.twoFactorEnabled()) return send(res, 200, admin.codePage(auth.createTicket()));
		loginLimiter.clear(ip);
		const s = auth.createSession();
		return redirect(res, '/admin', { 'Set-Cookie': auth.cookieHeader(s.id, 8 * 3600) });
	}

	if (req.method === 'POST' && p === '/admin/login/code') {
		const ip = clientIp(req);
		const form = await readForm(req, 4096);
		if (!loginLimiter.allow(ip)) return send(res, 429, admin.loginPage({ ok: false, text: 'Too many attempts. Try again in 15 minutes.' }, false));
		const ticket = String(form.ticket || '');
		if (!auth.useTicket(ticket)) return send(res, 401, admin.loginPage({ ok: false, text: 'That step expired. Log in again.' }, false));
		if (!auth.verifySecondFactor(form.code)) return send(res, 401, admin.codePage(ticket, { ok: false, text: 'That code is not correct.' }));
		auth.endTicket(ticket);
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
			const per = 50;
			const all = store.listMessages();
			const pages = Math.max(1, Math.ceil(all.length / per));
			const page = Math.min(pages, Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1));
			const shown = all.slice((page - 1) * per, page * per);
			const html = admin.messagesPage(session, shown, cfg.RETENTION_DAYS, flash, { page, pages, total: all.length });
			store.markRead(shown.map((m) => m.id));
			return send(res, 200, html);
		}
		if (p === '/admin/account') return send(res, 200, admin.accountPage(session, flash, { enabled: auth.twoFactorEnabled(), left: auth.recoveryLeft(), setup: auth.pendingTwoFactor() }));
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
	if (p === '/admin/2fa/start') {
		if (auth.twoFactorEnabled()) return redirect(res, '/admin/account');
		if (!accountLimiter.allow(clientIp(req))) return send(res, 429, 'Too many attempts', { 'Content-Type': 'text/plain' });
		if (!auth.checkPassword(form.current || '')) return send(res, 400, admin.accountPage(session, { ok: false, text: 'Password is not correct.' }, { enabled: false }));
		accountLimiter.clear(clientIp(req));
		auth.beginTwoFactor();
		return redirect(res, '/admin/account');
	}
	if (p === '/admin/2fa/restart') { // a fresh key and QR code while set-up is open; the old one stops working
		if (!auth.twoFactorEnabled() && auth.pendingTwoFactor()) auth.beginTwoFactor();
		return redirect(res, '/admin/account');
	}
	if (p === '/admin/2fa/confirm') {
		if (!accountLimiter.allow(clientIp(req))) return send(res, 429, 'Too many attempts', { 'Content-Type': 'text/plain' });
		const codes = auth.confirmTwoFactor(form.code);
		if (!codes) return send(res, 400, admin.accountPage(session, { ok: false, text: 'That code is not correct. Check the key and the time on your phone.' }, { setup: auth.pendingTwoFactor(), enabled: false }));
		accountLimiter.clear(clientIp(req));
		auth.destroyOtherSessions(req);
		return send(res, 200, admin.accountPage(session, { ok: true, text: 'Two-step verification is on.' }, { codes }));
	}
	if (p === '/admin/2fa/recovery') {
		if (!accountLimiter.allow(clientIp(req))) return send(res, 429, 'Too many attempts', { 'Content-Type': 'text/plain' });
		if (!auth.twoFactorEnabled() || !auth.checkPassword(form.current || '') || !auth.verifySecondFactor(form.code)) return send(res, 400, admin.accountPage(session, { ok: false, text: 'Password or code is not correct.' }, { enabled: auth.twoFactorEnabled(), left: auth.recoveryLeft() }));
		accountLimiter.clear(clientIp(req));
		return send(res, 200, admin.accountPage(session, { ok: true, text: 'New recovery codes created. The old ones no longer work.' }, { codes: auth.regenerateRecoveryCodes() }));
	}
	if (p === '/admin/2fa/disable') {
		if (!accountLimiter.allow(clientIp(req))) return send(res, 429, 'Too many attempts', { 'Content-Type': 'text/plain' });
		if (!auth.checkPassword(form.current || '') || !auth.verifySecondFactor(form.code)) return send(res, 400, admin.accountPage(session, { ok: false, text: 'Password or code is not correct.' }, { enabled: true, left: auth.recoveryLeft() }));
		accountLimiter.clear(clientIp(req));
		auth.disableTwoFactor();
		auth.destroyOtherSessions(req);
		return redirect(res, '/admin/account');
	}
	if (p === '/admin/account') {
		if (!accountLimiter.allow(clientIp(req))) return send(res, 429, 'Too many attempts', { 'Content-Type': 'text/plain' });
		if (!auth.checkPassword(form.current || '')) return redirect(res, '/admin/account?f=badpw');
		accountLimiter.clear(clientIp(req));
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
			else if (req.method === 'GET' && (url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/') || url.pathname.startsWith('/img/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/deck/'))) handled = serveFile(res, cfg.PUBLIC_DIR, url.pathname.slice(1), url.pathname.startsWith('/fonts/') ? 'public, max-age=604800' : 'public, max-age=3600');
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
	server.headersTimeout = 15000;
	server.requestTimeout = 30000; // slow-loris: a request must complete within 30 s
	server.keepAliveTimeout = 5000;
	server.maxHeadersCount = 50;
	server.listen(cfg.PORT, cfg.HOST, () => console.log(`Aethra site on http://${cfg.HOST}:${cfg.PORT}`));
	for (const sig of ['SIGTERM', 'SIGINT']) {
		process.on(sig, () => {
			stats.flush();
			server.close(() => process.exit(0));
			setTimeout(() => process.exit(0), 5000).unref();
		});
	}
}

module.exports = { createServer, contactLimiter, loginLimiter };
