'use strict';
const http = require('http');
const cfg = require('./lib/config');
const store = require('./lib/store');
const auth = require('./lib/auth');
const { send, redirect, clientIp, readBody, readForm, serveFile } = require('./lib/http');
const { parseMultipart, detectImage } = require('./lib/multipart');
const { createLimiter } = require('./lib/ratelimit');
const { ROLES, GROUPS, IMAGE_SLOTS } = require('./lib/fields');
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

async function handlePublic(req, res, url) {
	const content = store.getContent();
	if (req.method === 'GET' && url.pathname === '/') {
		return send(res, 200, views.renderHome(content, { status: url.searchParams.get('contact') || '', token: auth.formToken() }));
	}
	if (req.method === 'GET' && url.pathname === '/privacy') return send(res, 200, views.renderPrivacy(content));
	if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
	if (req.method === 'POST' && url.pathname === '/contact') {
		const back = (s) => redirect(res, `/?contact=${s}#contact`);
		const ip = clientIp(req);
		const form = await readForm(req);
		if (form.website || !auth.checkFormToken(form.token)) return back('sent'); // silent for bots
		if (!contactLimiter.allow(ip)) return back('limit');
		const msg = {
			name: (form.name || '').trim().slice(0, 120),
			email: (form.email || '').trim().slice(0, 200),
			org: (form.organisation || '').trim().slice(0, 160),
			role: ROLES.includes(form.role) ? form.role : 'Other',
			message: (form.message || '').trim(),
		};
		if (!msg.name || !EMAIL.test(msg.email) || !msg.message || msg.message.length > 5000 || !form.consent) return back('invalid');
		return back(store.addMessage(msg) ? 'sent' : 'error');
	}
	return false;
}

async function handleAdmin(req, res, url) {
	const p = url.pathname;
	const flash = flashFrom(url);

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
		const c = store.getContent();
		if (p === '/admin') return send(res, 200, admin.contentPage(session, c.values, flash));
		if (p === '/admin/photos') return send(res, 200, admin.photosPage(session, c.images, flash));
		if (p === '/admin/privacy') return send(res, 200, admin.privacyPage(session, c.privacy, flash));
		if (p === '/admin/messages') return send(res, 200, admin.messagesPage(session, store.listMessages(), cfg.RETENTION_DAYS, flash));
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
		const existing = store.getContent().images[fields.slot];
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
		const kind = upload.data.length <= cfg.MAX_IMAGE_BYTES && detectImage(upload.data);
		if (!kind) return redirect(res, '/admin/photos?f=badimg');
		const name = `${fields.slot}-${crypto.randomBytes(8).toString('hex')}.${kind.ext}`;
		store.ensureDirs();
		require('fs').writeFileSync(require('path').join(store.uploadsDir(), name), upload.data, { mode: 0o600 });
		store.setImage(fields.slot, { file: name, alt });
		return redirect(res, '/admin/photos?f=saved');
	}

	const form = await readForm(req, 300 * 1024);
	if (!csrfOk(session, form.csrf)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });

	if (p === '/admin/logout') {
		auth.destroySession(req);
		return redirect(res, '/admin', { 'Set-Cookie': auth.cookieHeader('', 0) });
	}
	if (p === '/admin/content') {
		const values = {};
		for (const g of GROUPS) for (const f of g.fields) if (f.key in form) values[f.key] = form[f.key];
		const r = store.saveContent({ values });
		if (!r.ok) return send(res, 400, admin.contentPage(session, { ...store.getContent().values, ...values }, { ok: false, text: r.errors.join(' ') }));
		return redirect(res, '/admin?f=saved');
	}
	if (p === '/admin/privacy') {
		store.saveContent({ privacy: form.privacy || '' });
		return redirect(res, '/admin/privacy?f=saved');
	}
	if (p === '/admin/messages/delete') {
		store.deleteMessage(String(form.id || ''));
		return redirect(res, '/admin/messages?f=deleted');
	}
	if (p === '/admin/account') {
		if (!auth.checkPassword(form.current || '')) return redirect(res, '/admin/account?f=badpw');
		if (String(form.password || '').length < 12) return redirect(res, '/admin/account?f=short');
		auth.setPassword(form.password);
		return redirect(res, '/admin/account?f=pw');
	}
	return false;
}

function createServer() {
	store.ensureDirs();
	return http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url, 'http://localhost');
			let handled = false;
			if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) handled = await handleAdmin(req, res, url);
			else if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) handled = serveFile(res, store.uploadsDir(), url.pathname.slice('/uploads/'.length), 'public, max-age=31536000, immutable');
			else if (req.method === 'GET' && (url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/') || url.pathname.startsWith('/img/'))) handled = serveFile(res, cfg.PUBLIC_DIR, url.pathname.slice(1), 'public, max-age=3600');
			else handled = await handlePublic(req, res, url);
			if (handled === false) send(res, 404, views.renderNotFound(store.getContent().values.site_name));
		} catch (err) {
			if (res.headersSent) return res.end();
			const status = err.status || 500;
			if (status === 500) console.error(err);
			send(res, status, status === 413 ? 'Payload too large' : 'Server error', { 'Content-Type': 'text/plain' });
		}
	});
}

if (require.main === module) {
	createServer().listen(cfg.PORT, cfg.HOST, () => console.log(`Aethra site on http://${cfg.HOST}:${cfg.PORT}`));
}

module.exports = { createServer };
