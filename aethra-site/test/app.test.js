'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aethra-'));
const auth = require('../lib/auth');
const store = require('../lib/store');
const { parseMultipart, detectImage } = require('../lib/multipart');
const { createServer } = require('../server');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
let base;
let server;
let cookie = '';
let csrf = '';

test.before(async () => {
	auth.setPassword('correct horse battery');
	server = createServer();
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (p, form, headers = {}) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, ...headers }, body: new URLSearchParams(form) });

test('public page renders, escapes and sets security headers', async () => {
	store.saveContent({ values: { hero_title: '<script>alert(1)</script>' } });
	const res = await fetch(base + '/');
	const html = await res.text();
	assert.equal(res.status, 200);
	assert.ok(!html.includes('<script>alert(1)</script>'));
	assert.ok(html.includes('&lt;script&gt;'));
	assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
	assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
	store.saveContent({ values: { hero_title: 'Cleaner air, right where traffic is heaviest' } });
});

test('admin requires login and rejects wrong password', async () => {
	const r = await fetch(base + '/admin/photos', { redirect: 'manual' });
	assert.equal(r.status, 303);
	const bad = await post('/admin/login', { password: 'nope' });
	assert.equal(bad.status, 401);
});

test('login sets hardened cookie and CSRF is enforced', async () => {
	const ok = await post('/admin/login', { password: 'correct horse battery' });
	assert.equal(ok.status, 303);
	const set = ok.headers.get('set-cookie');
	assert.match(set, /HttpOnly/);
	assert.match(set, /SameSite=Strict/);
	cookie = set.split(';')[0];
	const page = await (await fetch(base + '/admin', { headers: { cookie } })).text();
	csrf = /name="csrf" value="([0-9a-f]+)"/.exec(page)[1];
	const noToken = await post('/admin/content', { hero_title: 'x' });
	assert.equal(noToken.status, 403);
	const saved = await post('/admin/content', { csrf, hero_title: 'New title', fact1_url: 'https://example.org/a' });
	assert.equal(saved.status, 303);
	assert.ok((await (await fetch(base + '/')).text()).includes('New title'));
	const badUrl = await post('/admin/content', { csrf, fact1_url: 'javascript:alert(1)' });
	assert.equal(badUrl.status, 400);
});

test('contact form: bots dropped, valid message stored, shown in admin, deletable', async () => {
	const token = /name="token" value="([^"]+)"/.exec(await (await fetch(base + '/contact')).text())[1];
	// Too fast (token younger than 3 seconds) is silently dropped.
	await post('/contact', { token, name: 'Fast', email: 'a@b.nl', message: 'hi', consent: '1' });
	assert.equal(store.listMessages().length, 0);
	// Age the token by signing one in the past.
	const crypto = require('crypto');
	const ts = String(Math.floor(Date.now() / 1000) - 30);
	const old = `${ts}.${crypto.createHmac('sha256', store.getSecret()).update(ts).digest('hex')}`;
	const missingConsent = await post('/contact', { token: old, name: 'A', email: 'a@b.nl', message: 'hi' });
	assert.match(missingConsent.headers.get('location'), /contact=invalid/);
	const honey = await post('/contact', { token: old, name: 'Bot', email: 'a@b.nl', message: 'hi', consent: '1', website: 'x' });
	assert.match(honey.headers.get('location'), /contact=sent/);
	assert.equal(store.listMessages().length, 0);
	const good = await post('/contact', { token: old, name: 'Pat <b>', email: 'pat@example.org', organisation: 'City', role: 'Municipality', message: 'Hello\nthere', consent: '1' });
	assert.match(good.headers.get('location'), /contact=sent/);
	const html = await (await fetch(base + '/admin/messages', { headers: { cookie } })).text();
	assert.ok(html.includes('Pat &lt;b&gt;'));
	const id = store.listMessages()[0].id;
	await post('/admin/messages/delete', { csrf, id });
	assert.equal(store.listMessages().length, 0);
	const forged = await post('/contact', { token: 'x.y', name: 'A', email: 'a@b.nl', message: 'hi', consent: '1' });
	assert.match(forged.headers.get('location'), /contact=sent/);
	assert.equal(store.listMessages().length, 0);
});

test('photo upload validates content, serves safely, and can be removed', async () => {
	const send = async (file, extra = {}) => {
		const fd = new FormData();
		fd.set('csrf', csrf);
		fd.set('slot', 'hero');
		fd.set('alt', 'Atmosphere');
		for (const [k, v] of Object.entries(extra)) fd.set(k, v);
		if (file) fd.set('file', new Blob([file]), 'a.png');
		return fetch(base + '/admin/photos', { method: 'POST', redirect: 'manual', headers: { cookie }, body: fd });
	};
	const fake = await send(Buffer.from('<?php echo 1; ?>'));
	assert.match(fake.headers.get('location'), /badimg/);
	const ok = await send(PNG);
	assert.match(ok.headers.get('location'), /saved/);
	const home = await (await fetch(base + '/')).text();
	const src = /src="(\/uploads\/hero-[0-9a-f]+\.png)"/.exec(home)[1];
	const img = await fetch(base + src);
	assert.equal(img.headers.get('content-type'), 'image/png');
	assert.equal((await fetch(base + '/uploads/..%2Fsecret.key')).status, 404);
	assert.equal((await fetch(base + '/js/../../data/secret.key')).status, 404);
	await send(null, { action: 'remove' });
	assert.equal((await fetch(base + src)).status, 404);
});

test('login is rate limited and password change works', async () => {
	const change = await post('/admin/account', { csrf, current: 'wrong', password: 'another long password' });
	assert.match(change.headers.get('location'), /badpw/);
	await post('/admin/account', { csrf, current: 'correct horse battery', password: 'another long password' });
	assert.ok(auth.checkPassword('another long password'));
	let last;
	for (let i = 0; i < 7; i++) last = await post('/admin/login', { password: 'bad' });
	assert.equal(last.status, 429);
});

test('every public page renders with its own heading and nav state', async () => {
	for (const [path, text] of [['/problem', 'Air pollution is concentrated'], ['/how-it-works', 'Detect'], ['/applications', 'Municipalities'], ['/contact', 'Send message'], ['/privacy', 'Privacy statement']]) {
		const res = await fetch(base + path);
		const html = await res.text();
		assert.equal(res.status, 200, path);
		assert.ok(html.includes(text), path);
		assert.ok(html.includes('aria-current="page"'), path);
	}
	assert.equal((await fetch(base + '/nope')).status, 404);
});

test('multipart parser and image sniffing', () => {
	const b = '----x';
	const body = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--${b}\r\nContent-Disposition: form-data; name="file"; filename="f.png"\r\nContent-Type: image/png\r\n\r\nDATA\r\n--${b}--\r\n`);
	const r = parseMultipart(body, `multipart/form-data; boundary=${b}`);
	assert.equal(r.fields.a, '1');
	assert.equal(r.files[0].data.toString(), 'DATA');
	assert.equal(detectImage(PNG).ext, 'png');
	assert.equal(detectImage(Buffer.from('GIF89a......')), null);
});
