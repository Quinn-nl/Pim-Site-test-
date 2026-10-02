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

const zlib = require('zlib');
const crc32 = (buf) => { let r = 0xffffffff; for (const x of buf) { let c = (r ^ x) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; r = c ^ (r >>> 8); } return (r ^ 0xffffffff) >>> 0; };
const pngChunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function makePng(w = 4, h = 3, extra = []) {
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
	const raw = Buffer.alloc(h * (1 + w * 3));
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), ...extra, pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}
const PNG = makePng();
/** JPEG skeleton: SOI, APP1 (fake EXIF with GPS text), SOF0, SOS + data, EOI. */
function makeJpeg(w, h) {
	const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x14]), Buffer.from('Exif\0\0GPS-SECRET-1', 'latin1')]);
	const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00]);
	const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9]);
	return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof, sos]);
}
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
	const res = await fetch(base + '/en/');
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
	assert.ok((await (await fetch(base + '/en/')).text()).includes('New title'));
	const badUrl = await post('/admin/content', { csrf, fact1_url: 'javascript:alert(1)' });
	assert.equal(badUrl.status, 400);
});

test('contact form: bots dropped, errors keep input, valid message stored, shown in admin, deletable', async () => {
	const tokenOf = async () => /name="token" value="([^"]+)"/.exec(await (await fetch(base + '/en/contact')).text())[1];
	const crypto = require('crypto');
	const aged = (secs) => { const ts = String(Math.floor(Date.now() / 1000) - secs); return `${ts}.${crypto.createHmac('sha256', store.getSecret()).update(ts).digest('hex')}`; };
	const old = aged(30);
	// Sent within two seconds: not stored, but the visitor sees a message and keeps their text.
	const fast = await post('/en/contact', { token: await tokenOf(), name: 'Fast', email: 'a@b.nl', message: 'keep me', consent: '1' });
	assert.equal(fast.status, 200);
	const fastHtml = await fast.text();
	assert.ok(fastHtml.includes('keep me') && fastHtml.includes('expired'));
	assert.equal(store.listMessages().length, 0);
	// Missing consent: 422 with an inline error and the typed values preserved.
	const bad = await post('/en/contact', { token: old, name: 'Anna', email: 'bad-email', message: 'hello', role: 'Investor' });
	assert.equal(bad.status, 422);
	const badHtml = await bad.text();
	assert.ok(badHtml.includes('value="Anna"') && badHtml.includes('hello'));
	assert.ok(badHtml.includes('Enter a valid email address.') && badHtml.includes('Tick the box to agree.'));
	assert.match(badHtml, /<option value="Investor" selected>/);
	// Honeypot and forged tokens look like success but store nothing.
	const honey = await post('/en/contact', { token: old, name: 'Bot', email: 'a@b.nl', message: 'hi', consent: '1', website: 'x' });
	assert.match(honey.headers.get('location'), /contact=sent/);
	const forged = await post('/en/contact', { token: 'x.y', name: 'A', email: 'a@b.nl', message: 'hi', consent: '1' });
	assert.match(forged.headers.get('location'), /contact=sent/);
	assert.equal(store.listMessages().length, 0);
	// An expired token (over 24 h) asks the visitor to send again.
	const stale = await post('/en/contact', { token: aged(90000), name: 'Slow', email: 'a@b.nl', message: 'old form', consent: '1' });
	assert.ok((await stale.text()).includes('old form'));
	// A valid message is stored, shows the thank-you page, and appears in the admin inbox.
	const good = await post('/en/contact', { token: old, name: 'Pat <b>', email: 'pat@example.org', organisation: 'City', role: 'Municipality', message: 'Hello\nthere', consent: '1' });
	assert.match(good.headers.get('location'), /contact=sent/);
	const thanks = await (await fetch(base + '/en/contact?contact=sent')).text();
	assert.ok(thanks.includes('Message sent') && !thanks.includes('<form'));
	assert.equal(store.unreadCount(), 1);
	const nav = await (await fetch(base + '/admin/photos', { headers: { cookie } })).text();
	assert.match(nav, /class="badge"/);
	const html = await (await fetch(base + '/admin/messages', { headers: { cookie } })).text();
	assert.ok(html.includes('Pat &lt;b&gt;'));
	assert.equal(store.unreadCount(), 0);
	const id = store.listMessages()[0].id;
	await post('/admin/messages/delete', { csrf, id });
	assert.equal(store.listMessages().length, 0);
});

test('CSV export neutralises spreadsheet formulas', async () => {
	store.addMessage({ lang: 'en', role: 'Other', name: '=HYPERLINK("http://evil")', email: 'x@y.nl', org: '+1', message: 'a "quoted"\nline' });
	const res = await fetch(base + '/admin/messages.csv', { headers: { cookie } });
	assert.match(res.headers.get('content-disposition'), /attachment/);
	const csv = await res.text();
	assert.ok(csv.includes('"\'=HYPERLINK'));
	assert.ok(csv.includes('"\'+1"'));
	assert.ok(csv.includes('a ""quoted"" line'));
	for (const m of store.listMessages()) await post('/admin/messages/delete', { csrf, id: m.id });
	assert.equal((await fetch(base + '/admin/messages.csv', { redirect: 'manual' })).status, 303);
});

test('photo upload validates structure, strips metadata, records size, and can be removed', async () => {
	const send = async (file, extra = {}) => {
		const fd = new FormData();
		fd.set('csrf', csrf);
		fd.set('slot', 'hero');
		fd.set('alt', 'Atmosphere');
		for (const [k, v] of Object.entries(extra)) fd.set(k, v);
		if (file) fd.set('file', new Blob([file]), 'a.png');
		return fetch(base + '/admin/photos', { method: 'POST', redirect: 'manual', headers: { cookie }, body: fd });
	};
	assert.match((await send(Buffer.from('<?php echo 1; ?>'))).headers.get('location'), /badimg/);
	assert.match((await send(Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(64, 1)]))).headers.get('location'), /badimg/);
	assert.match((await send(makePng(7000, 10))).headers.get('location'), /badimg/);
	const withText = makePng(4, 3, [pngChunk('tEXt', Buffer.from('GPS\0PNG-SECRET'))]);
	assert.match((await send(withText)).headers.get('location'), /saved/);
	const home = await (await fetch(base + '/en/')).text();
	const tag = /<img class="photo hero-photo"[^>]*>/.exec(home)[0];
	assert.match(tag, /width="4" height="3"/);
	assert.match(tag, /fetchpriority="high"/);
	assert.ok(!tag.includes('loading="lazy"'));
	const src = /src="(\/uploads\/hero-[0-9a-f]+\.png)"/.exec(tag)[1];
	const img = await fetch(base + src);
	assert.equal(img.headers.get('content-type'), 'image/png');
	assert.ok(!Buffer.from(await img.arrayBuffer()).includes('PNG-SECRET'));
	assert.equal((await fetch(base + '/uploads/..%2Fsecret.key')).status, 404);
	assert.equal((await fetch(base + '/js/../../data/secret.key')).status, 404);
	await send(null, { action: 'remove' });
	assert.equal((await fetch(base + src)).status, 404);
});

test('JPEG metadata is removed and the size is read', () => {
	const { inspectImage } = require('../lib/image');
	const src = makeJpeg(640, 480);
	assert.ok(src.includes('GPS-SECRET-1'));
	const out = inspectImage(src);
	assert.equal(out.ext, 'jpg');
	assert.equal(out.width, 640);
	assert.equal(out.height, 480);
	assert.ok(!out.data.includes('GPS-SECRET-1'));
	assert.equal(inspectImage(src.subarray(0, 10)), null);
});

test('social image becomes og:image and a large Twitter card', async () => {
	const fd = new FormData();
	fd.set('csrf', csrf); fd.set('slot', 'social'); fd.set('alt', '');
	fd.set('file', new Blob([makePng(1200, 630)]), 's.png');
	await fetch(base + '/admin/photos', { method: 'POST', redirect: 'manual', headers: { cookie }, body: fd });
	const html = await (await fetch(base + '/nl/problem')).text();
	assert.match(html, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/uploads\/social-[0-9a-f]+\.png"/);
	assert.match(html, /twitter:card" content="summary_large_image"/);
	const body = new FormData();
	body.set('csrf', csrf); body.set('slot', 'social'); body.set('action', 'remove');
	await fetch(base + '/admin/photos', { method: 'POST', redirect: 'manual', headers: { cookie }, body });
});

test('e-mail notification is sent over SMTP when configured', async () => {
	const net = require('net');
	const mail = require('../lib/mail');
	const received = [];
	const smtp = net.createServer((sock) => {
		let data = false, buf = '';
		sock.write('220 test ESMTP\r\n');
		sock.on('data', (d) => {
			buf += d.toString();
			if (data) { if (buf.endsWith('\r\n.\r\n')) { received.push(buf); data = false; buf = ''; sock.write('250 queued\r\n'); } return; }
			for (const line of buf.split('\r\n').slice(0, -1)) {
				received.push(line);
				if (/^EHLO/.test(line)) sock.write('250-test\r\n250 AUTH PLAIN\r\n');
				else if (/^AUTH/.test(line)) sock.write('235 ok\r\n');
				else if (/^(MAIL|RCPT)/.test(line)) sock.write('250 ok\r\n');
				else if (line === 'DATA') { data = true; sock.write('354 go\r\n'); buf = ''; return; }
				else if (line === 'QUIT') sock.end('221 bye\r\n');
			}
			buf = '';
		});
	});
	await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
	assert.deepEqual(await mail.sendMail({ subject: 's', text: 't' }), { sent: false, reason: 'not configured' });
	Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'site@example.org', MAIL_TO: 'team@example.org' });
	const result = await mail.sendMail({ subject: 'New message \u00e9\r\nBcc: evil@example.org', text: 'Hello world', replyTo: 'pat@example.org' });
	for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'MAIL_TO']) delete process.env[k];
	smtp.close();
	assert.equal(result.sent, true);
	const log = received.join('\n');
	assert.ok(log.includes('RCPT TO:<team@example.org>'));
	assert.ok(log.includes('Reply-To: pat@example.org'));
	assert.ok(!/^Bcc:/m.test(log), 'header injection is neutralised');
	assert.ok(log.includes(Buffer.from('Hello world').toString('base64')));
});

test('titles stay within search limits, HEAD works and pages revalidate with ETag', async () => {
	for (const l of ['en', 'nl', 'de', 'fr']) for (const p of ['/', '/problem', '/how-it-works', '/applications', '/contact']) {
		const html = await (await fetch(base + `/${l}${p === '/' ? '/' : p}`)).text();
		const title = /<title>([^<]*)<\/title>/.exec(html)[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
		assert.ok(title.length <= 62, `${l}${p}: ${title.length} ${title}`);
	}
	const head = await fetch(base + '/en/', { method: 'HEAD' });
	assert.equal(head.status, 200);
	assert.equal((await head.text()), '');
	const res = await fetch(base + '/en/problem');
	const etag = res.headers.get('etag');
	assert.ok(etag);
	assert.equal(res.headers.get('cache-control'), 'no-cache');
	assert.equal((await fetch(base + '/en/problem', { headers: { 'if-none-match': etag } })).status, 304);
	assert.equal((await fetch(base + '/en/contact')).headers.get('cache-control'), 'no-store');
});

test('login is rate limited and password change works', async () => {
	const change = await post('/admin/account', { csrf, current: 'wrong', password: 'another long password' });
	assert.match(change.headers.get('location'), /badpw/);
	await post('/admin/account', { csrf, current: 'correct horse battery', password: 'another long password' });
	assert.ok(auth.checkPassword('another long password'));
	const other = auth.createSession();
	await post('/admin/account', { csrf, current: 'another long password', password: 'yet another password' });
	assert.equal(auth.getSession({ headers: { cookie: `${auth.COOKIE}=${other.id}` } }), null);
	await post('/admin/account', { csrf, current: 'yet another password', password: 'another long password' });
	let last;
	for (let i = 0; i < 7; i++) last = await post('/admin/login', { password: 'bad' });
	assert.equal(last.status, 429);
});

test('every public page renders with its own heading and nav state', async () => {
	for (const [path, text] of [['/problem', 'Air pollution is concentrated'], ['/how-it-works', 'Detect'], ['/applications', 'Municipalities'], ['/contact', 'Send message'], ['/privacy', 'Privacy statement']]) {
		const res = await fetch(base + '/en' + path);
		const html = await res.text();
		assert.equal(res.status, 200, path);
		assert.ok(html.includes(text), path);
		assert.ok(html.includes('aria-current="page"'), path);
	}
	assert.equal((await fetch(base + '/nope')).status, 404);
	const nf = await fetch(base + '/nl/nope');
	assert.equal(nf.status, 404);
	assert.match(await nf.text(), /noindex/);
});

test('language is detected from the browser and remembered from the cookie', async () => {
	const go = (headers) => fetch(base + '/', { redirect: 'manual', headers });
	let r = await go({ 'accept-language': 'nl-NL,nl;q=0.9,en;q=0.5' });
	assert.equal(r.status, 302);
	assert.equal(r.headers.get('location'), '/nl/');
	assert.match(r.headers.get('vary'), /Accept-Language/);
	assert.equal((await go({ 'accept-language': 'de-AT,de;q=0.8' })).headers.get('location'), '/de/');
	assert.equal((await go({ 'accept-language': 'fr;q=0.2, ja;q=0.9, de;q=0.5' })).headers.get('location'), '/de/');
	assert.equal((await go({ 'accept-language': 'ja,zh' })).headers.get('location'), '/en/');
	assert.equal((await go({})).headers.get('location'), '/en/');
	assert.equal((await go({ 'accept-language': 'nl', cookie: 'aethra_lang=fr' })).headers.get('location'), '/fr/');
	r = await fetch(base + '/problem', { redirect: 'manual', headers: { 'accept-language': 'de' } });
	assert.equal(r.headers.get('location'), '/de/problem');
	assert.equal((await fetch(base + '/nl', { redirect: 'manual' })).status, 301);
});

test('SEO: canonical, hreflang, Open Graph, JSON-LD, sitemap and robots', async () => {
	const html = await (await fetch(base + '/nl/problem')).text();
	assert.match(html, /<html lang="nl">/);
	assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/nl\/problem">/);
	for (const l of ['en', 'nl', 'de', 'fr', 'x-default']) assert.ok(html.includes(`hreflang="${l}"`), l);
	assert.match(html, /property="og:locale" content="nl_NL"/);
	assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
	const home = await (await fetch(base + '/de/')).text();
	const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home)[1]);
	assert.equal(ld['@graph'][0]['@type'], 'Organization');
	assert.ok(home.includes('Sauberere Luft'));
	const map = await (await fetch(base + '/sitemap.xml')).text();
	assert.equal((map.match(/<url>/g) || []).length, 24);
	assert.ok(map.includes('hreflang="fr"'));
	const robots = await (await fetch(base + '/robots.txt')).text();
	assert.match(robots, /Disallow: \/admin/);
	assert.match(robots, /Sitemap: http/);
	const admin = await (await fetch(base + '/admin')).text();
	assert.match(admin, /noindex/);
});

test('content is editable per language and the contact form localises and preselects the segment', async () => {
	await post('/admin/login', { password: 'another long password' }).then(async (r) => { if (r.status === 303) cookie = r.headers.get('set-cookie').split(';')[0]; });
	const page = await (await fetch(base + '/admin?lang=nl', { headers: { cookie } })).text();
	csrf = /name="csrf" value="([0-9a-f]+)"/.exec(page)[1];
	assert.ok(page.includes('Schonere lucht'));
	await post('/admin/content', { csrf, lang: 'nl', hero_title: 'Nieuwe kop' });
	assert.ok((await (await fetch(base + '/nl/')).text()).includes('Nieuwe kop'));
	assert.ok((await (await fetch(base + '/de/')).text()).includes('Sauberere Luft'));
	assert.ok(!(await (await fetch(base + '/en/')).text()).includes('Nieuwe kop'));
	const contact = await (await fetch(base + '/fr/contact?role=Municipality')).text();
	assert.match(contact, /<option value="Municipality" selected>Commune<\/option>/);
	assert.ok(contact.includes('Envoyer le message'));
	const tok = /name="token" value="([^"]+)"/.exec(contact)[1];
	assert.ok(tok);
});

test('responses are gzip-compressed and static files support ETag', async () => {
	const r = await fetch(base + '/en/', { headers: { 'accept-encoding': 'gzip' } });
	assert.equal(r.headers.get('content-encoding'), 'gzip');
	const css = await fetch(base + '/css/site.css', { headers: { 'accept-encoding': 'gzip' } });
	const etag = css.headers.get('etag');
	assert.ok(etag);
	const again = await fetch(base + '/css/site.css', { headers: { 'if-none-match': etag } });
	assert.equal(again.status, 304);
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
