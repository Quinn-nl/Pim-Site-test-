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
const { createServer, contactLimiter, loginLimiter } = require('../server');
const resetContactLimit = () => ['127.0.0.1', '::ffff:127.0.0.1', '::1'].forEach((k) => contactLimiter.clear(k));

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
	assert.equal((map.match(/<url>/g) || []).length, 44);
	assert.ok(map.includes('/nl/for/investors'));
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

test('audience pages: one per audience and language, FAQ markup, links and titles', async () => {
	const { AUDIENCES } = require('../lib/audiences');
	for (const l of ['en', 'nl', 'de', 'fr']) for (const a of AUDIENCES) {
		const res = await fetch(base + `/${l}/for/${a.slug}`);
		const html = await res.text();
		assert.equal(res.status, 200, `${l}/${a.slug}`);
		assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
		assert.equal((html.match(/<details>/g) || []).length, 2);
		const title = /<title>([^<]*)<\/title>/.exec(html)[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
		assert.ok(title.length <= 62, `${l}/${a.slug}: ${title.length} ${title}`);
		assert.ok(html.includes(`href="/${l}/contact?role=${encodeURIComponent(a.role)}"`), 'CTA preselects the role');
		const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
		assert.ok(ld['@graph'].some((n) => n['@type'] === 'FAQPage' && n.mainEntity.length === 2));
		assert.ok(html.includes(`hreflang="x-default"`));
	}
	const inv = await (await fetch(base + '/en/for/investors')).text();
	assert.ok(inv.includes('not an offer of shares'), 'investor page says it is not an offer');
	assert.ok(!/\d+\s?%|reduc(e|tion) of/i.test(inv), 'no emission figures');
	assert.equal((await fetch(base + '/en/for/unknown')).status, 404);
	const home = await (await fetch(base + '/en/')).text();
	assert.ok(home.includes('/en/for/municipalities') && home.includes('/en/for/investors'));
});

test('statistics: cookieless, bot- and DNT-aware, UTM carried to the message, dashboard renders', async () => {
	const stats = require('../lib/stats');
	const http = require('http');
	// Node's fetch strips Sec-Fetch-* headers (browsers send them), so use raw HTTP here.
	const rawGet = (p, headers = {}) => new Promise((resolve) => http.get(base + p, { headers }, (res) => { let t = ''; res.on('data', (d) => (t += d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: t })); }));
	const nav = { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' };
	const before = stats.summary(30);
	const r1 = await rawGet('/en/problem?utm_source=LinkedIn&utm_campaign=Launch-1', nav);
	assert.equal(r1.headers['set-cookie'], undefined, 'public pages set no cookie');
	await rawGet('/en/problem', { ...nav, dnt: '1' });
	await rawGet('/en/problem', { ...nav, 'sec-gpc': '1' });
	await rawGet('/en/problem', { 'user-agent': 'Googlebot' });
	await rawGet('/en/problem', { ...nav, 'sec-purpose': 'prefetch' });
	await rawGet('/en/applications', { ...nav, referer: 'https://www.example.org/some/path?x=1' });
	const after = stats.summary(30);
	assert.equal(after.views - before.views, 2, 'only the two real navigations count');
	assert.equal(after.sources['linkedin / launch-1'], 1);
	assert.equal(after.sources['example.org'], 1);
	assert.ok(!JSON.stringify(require('../lib/store').readJson('stats.json', {})).includes('/some/path'), 'no referrer path stored');
	// UTM tags stay on internal links and end up on the message.
	const html = await (await fetch(base + '/en/problem?utm_source=linkedin&utm_campaign=launch-1')).text();
	assert.ok(html.includes('href="/en/contact?utm_source=linkedin&amp;utm_campaign=launch-1"'));
	assert.ok(/<link rel="canonical" href="[^"?]*\/en\/problem">/.test(html), 'canonical has no tracking tags');
	const contact = await (await fetch(base + '/en/contact?utm_source=linkedin&utm_campaign=launch-1')).text();
	assert.ok(contact.includes('name="utm_source" value="linkedin"'));
	const crypto = require('crypto');
	const ts = String(Math.floor(Date.now() / 1000) - 30);
	const token = `${ts}.${crypto.createHmac('sha256', store.getSecret()).update(ts).digest('hex')}`;
	resetContactLimit();
	await post('/en/contact', { token, name: 'Lead', email: 'lead@example.org', message: 'Hi', consent: '1', role: 'Fleet operator', utm_source: 'LinkedIn!', utm_campaign: 'Launch-1' });
	const msg = store.listMessages()[0];
	assert.equal(msg.source, 'linkedin');
	assert.equal(msg.campaign, 'launch-1');
	const sum = stats.summary(30);
	assert.equal(sum.sent - before.sent, 1);
	assert.equal((sum.roles['Fleet operator'] || 0) - (before.roles['Fleet operator'] || 0), 1);
	const page = await (await fetch(base + '/admin/stats?days=7', { headers: { cookie } })).text();
	assert.ok(page.includes('Page views per day') && page.includes('linkedin / launch-1') && page.includes('Fleet operator'));
	assert.equal((await fetch(base + '/admin/stats', { redirect: 'manual' })).status, 303);
	store.deleteMessage(msg.id);
});

test('visitor confirmation mail: sent once per address, fixed text, can be disabled', async () => {
	const net = require('net');
	const crypto = require('crypto');
	const mails = [];
	const smtp = net.createServer((sock) => {
		let data = false, buf = '';
		sock.write('220 t\r\n');
		sock.on('data', (d) => {
			buf += d.toString();
			if (data) { if (buf.endsWith('\r\n.\r\n')) { mails.push(buf); data = false; buf = ''; sock.write('250 ok\r\n'); } return; }
			for (const line of buf.split('\r\n').slice(0, -1)) {
				if (/^EHLO/.test(line)) sock.write('250 t\r\n');
				else if (/^(MAIL|RCPT)/.test(line)) sock.write('250 ok\r\n');
				else if (line === 'DATA') { data = true; sock.write('354 go\r\n'); buf = ''; return; }
				else if (line === 'QUIT') sock.end('221 bye\r\n');
			}
			buf = '';
		});
	});
	await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
	Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), MAIL_FROM: 'site@example.org', MAIL_TO: 'team@example.org' });
	const send = async (email, lang) => {
		const ts = String(Math.floor(Date.now() / 1000) - 30);
		const token = `${ts}.${crypto.createHmac('sha256', store.getSecret()).update(ts).digest('hex')}`;
		resetContactLimit();
		await post(`/${lang}/contact`, { token, name: 'Ana', email, message: 'secret body', consent: '1' });
		await new Promise((r) => setTimeout(r, 400));
	};
	await send('visitor@example.org', 'nl');
	await send('visitor@example.org', 'nl');
	await send('other@example.org', 'en');
	process.env.AUTO_REPLY = '0';
	await send('third@example.org', 'en');
	for (const k of ['SMTP_HOST', 'SMTP_PORT', 'MAIL_FROM', 'MAIL_TO', 'AUTO_REPLY']) delete process.env[k];
	smtp.close();
	const decode = (m) => { const body = m.split('\r\n\r\n')[1].replace(/\r\n\.\r\n$/, '').replace(/\r\n/g, ''); return Buffer.from(body, 'base64').toString('utf8'); };
	const toVisitors = mails.filter((m) => /^To: (visitor|other)@/m.test(m));
	assert.equal(toVisitors.length, 2, 'one confirmation per address, none when disabled');
	assert.ok(decode(toVisitors[0]).includes('Bedankt voor uw bericht'));
	assert.ok(!toVisitors.some((m) => decode(m).includes('secret body')), 'visitor text is never echoed');
	for (const m of store.listMessages()) store.deleteMessage(m.id);
});

test('admin messages are paginated and counts are formatted; dev toggle is absent in normal runs', async () => {
	for (let i = 0; i < 120; i++) store.addMessage({ lang: 'en', role: 'Other', name: `Person ${i}`, email: `p${i}@example.org`, org: '', message: 'm' });
	const first = await (await fetch(base + '/admin/messages', { headers: { cookie } })).text();
	assert.equal((first.match(/class="card msg"/g) || []).length, 50);
	assert.ok(first.includes('Page 1 of 3') && first.includes('(120)'));
	assert.ok(first.includes('/admin/messages?page=2'));
	assert.equal(store.unreadCount(), 70, 'only the messages shown are marked read');
	const last = await (await fetch(base + '/admin/messages?page=3', { headers: { cookie } })).text();
	assert.equal((last.match(/class="card msg"/g) || []).length, 20);
	assert.equal((await (await fetch(base + '/admin/messages?page=999', { headers: { cookie } })).text()).includes('Page 3 of 3'), true);
	for (const m of store.listMessages()) store.deleteMessage(m.id);
	const home = await (await fetch(base + '/en/')).text();
	assert.ok(!home.includes('dev-toggle'), 'the stress-data switch only exists with DEV_TOGGLE=1');
	assert.equal((await fetch(base + '/__data?mode=worst', { redirect: 'manual' })).status, 404);
});

test('pages carry a default sharing image per language until one is uploaded', async () => {
	const html = await (await fetch(base + '/nl/')).text();
	assert.match(html, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/img\/og-default-nl\.png"/);
	assert.ok(html.includes('og:image:width" content="1200"') && html.includes('twitter:card" content="summary_large_image"'));
	const img = await fetch(base + '/img/og-default-nl.png');
	assert.equal(img.status, 200);
	assert.equal(img.headers.get('content-type'), 'image/png');
});

test('introduction deck is served per language with working navigation files and no inline scripts', async () => {
	for (const l of ['en', 'nl', 'de', 'fr']) {
		const res = await fetch(base + `/deck/aethra-${l}.html`);
		const html = await res.text();
		assert.equal(res.status, 200);
		assert.match(res.headers.get('content-type'), /text\/html/);
		assert.equal((html.match(/<section class="slide"/g) || []).length, 5);
		assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'no inline scripts');
		assert.ok(!/https?:\/\/(?!www\.who|www\.eea)/.test(html.replace(/<html[^>]*>/, '')), 'no external hosts');
	}
	assert.ok((await (await fetch(base + '/deck/aethra-de.html')).text()).includes('Sauberere Luft'));
	assert.equal((await fetch(base + '/deck/deck.js')).status, 200);
	assert.equal((await fetch(base + '/deck/../server.js')).status, 404);
});

test('llms.txt describes the site for AI search', async () => {
	const txt = await (await fetch(base + '/llms.txt')).text();
	assert.ok(txt.startsWith('# Aethra'));
	assert.ok(txt.includes('/en/for/investors') && txt.includes('not an offer of securities'));
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

test('hardening: malformed cookie, forged X-Forwarded-For, cross-site admin POST, strict e-mail', async () => {
	const r = await fetch(base + '/en/', { headers: { cookie: 'aethra_lang=%E0%A4%A' } });
	assert.equal(r.status, 200);
	assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin');
	const forged = await fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' }, body: new URLSearchParams({ password: 'x' }) });
	assert.equal(forged.status, 403);
	const { clientIp } = require('../lib/http');
	const cfg = require('../lib/config');
	cfg.TRUST_PROXY = true;
	assert.equal(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, socket: {} }), '203.0.113.9');
	assert.equal(clientIp({ headers: { 'x-forwarded-for': 'junk<>' }, socket: { remoteAddress: '10.0.0.1' } }), '10.0.0.1');
	cfg.TRUST_PROXY = false;
	const EMAIL = /const EMAIL = (\/.*\/);/.exec(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'))[1];
	const re = eval(EMAIL);
	assert.ok(re.test('jan.de-vries+x@bedrijf.nl'));
	for (const bad of ['a>@b.co', 'a@b.co>,evil@x.nl', '"a"@b.co', 'a b@c.nl']) assert.ok(!re.test(bad), bad);
});

test('two-step verification: setup, login needs a code, replay and recovery codes, disable', async () => {
	const totp = require('../lib/totp');
	// RFC 6238 test vector (SHA1, secret "12345678901234567890", T=59 s -> 94287082, last 6 digits 287082)
	assert.equal(totp.codeAt(totp.base32(Buffer.from('12345678901234567890')), 1), '287082');
	auth.setPassword('another long password');
	['127.0.0.1', '::ffff:127.0.0.1', '::1'].forEach((k) => loginLimiter.clear(k));
	await post('/admin/login', { password: 'another long password' }).then((r) => { cookie = r.headers.get('set-cookie').split(';')[0]; });
	csrf = /name="csrf" value="([a-f0-9]+)"/.exec(await (await fetch(base + '/admin/account', { headers: { cookie } })).text())[1];
	assert.equal((await post('/admin/2fa/start', { csrf, current: 'wrong password!' })).status, 400);
	assert.ok(!auth.pendingTwoFactor());
	await post('/admin/2fa/start', { csrf, current: 'another long password' });
	const setup = auth.pendingTwoFactor();
	assert.ok(setup && /^[A-Z2-7]{32}$/.test(setup.secret));
	assert.ok(!fs.readFileSync(path.join(process.env.DATA_DIR, 'admin.json'), 'utf8').includes(setup.secret), 'secret is stored encrypted');
	const setupHtml = await (await fetch(base + '/admin/account', { headers: { cookie } })).text();
	assert.match(setupHtml, /<svg class="qr"[\s\S]*?<path d="M/);
	assert.ok(!/<svg[^>]*style=/.test(setupHtml), 'no inline styles (CSP)');
	await post('/admin/2fa/restart', { csrf });
	const renewed = auth.pendingTwoFactor();
	assert.notEqual(renewed.secret, setup.secret, 'restart gives a new key');
	setup.secret = renewed.secret;
	const wrong = await post('/admin/2fa/confirm', { csrf, code: '000000' });
	assert.equal(wrong.status, 400);
	assert.ok(!auth.twoFactorEnabled());
	const ok = await post('/admin/2fa/confirm', { csrf, code: totp.codeAt(setup.secret, Math.floor(Date.now() / 30000)) });
	assert.equal(ok.status, 200);
	const codes = [...(await ok.text()).matchAll(/<code>([a-z]{5}-[a-z]{5})<\/code>/g)].map((m) => m[1]);
	assert.equal(codes.length, 8);
	assert.ok(auth.twoFactorEnabled());
	// password alone no longer gives a session
	const step1 = await post('/admin/login', { password: 'another long password' }, { cookie: '' });
	assert.equal(step1.status, 200);
	assert.ok(!step1.headers.get('set-cookie'));
	const ticket = /name="ticket" value="([a-f0-9]+)"/.exec(await step1.text())[1];
	const bad = await post('/admin/login/code', { ticket, code: '123456' }, { cookie: '' });
	assert.equal(bad.status, 401);
	// the code that confirmed setup cannot be replayed; the next time step is accepted
	const now = Math.floor(Date.now() / 30000);
	const replay = await post('/admin/login/code', { ticket, code: totp.codeAt(setup.secret, now) }, { cookie: '' });
	assert.equal(replay.status, 401);
	const good = await post('/admin/login/code', { ticket, code: totp.codeAt(setup.secret, now + 1) }, { cookie: '' });
	assert.equal(good.status, 303);
	assert.ok(good.headers.get('set-cookie').includes('aethra_sid='));
	// a ticket is single use
	assert.equal((await post('/admin/login/code', { ticket, code: totp.codeAt(setup.secret, now + 1) }, { cookie: '' })).status, 401);
	// recovery code works once
	const t2 = /name="ticket" value="([a-f0-9]+)"/.exec(await (await post('/admin/login', { password: 'another long password' }, { cookie: '' })).text())[1];
	assert.equal((await post('/admin/login/code', { ticket: t2, code: codes[0] }, { cookie: '' })).status, 303);
	const t3 = /name="ticket" value="([a-f0-9]+)"/.exec(await (await post('/admin/login', { password: 'another long password' }, { cookie: '' })).text())[1];
	assert.equal((await post('/admin/login/code', { ticket: t3, code: codes[0] }, { cookie: '' })).status, 401);
	// new recovery codes need password and code, and replace the old ones
	assert.equal((await post('/admin/2fa/recovery', { csrf, current: 'another long password', code: 'bad' })).status, 400);
	const regen = await post('/admin/2fa/recovery', { csrf, current: 'another long password', code: codes[2] });
	assert.equal(regen.status, 200);
	const fresh = [...(await regen.text()).matchAll(/<code>([a-z]{5}-[a-z]{5})<\/code>/g)].map((m) => m[1]);
	assert.equal(fresh.length, 8);
	assert.ok(!auth.verifySecondFactor(codes[3]), 'old codes stop working');
	// password change keeps two-step on; disabling needs password and a code
	auth.setPassword('another long password');
	assert.ok(auth.twoFactorEnabled());
	assert.equal((await post('/admin/2fa/disable', { csrf, current: 'another long password', code: 'nope' })).status, 400);
	assert.ok(auth.twoFactorEnabled());
	const off = await post('/admin/2fa/disable', { csrf, current: 'another long password', code: fresh[0] });
	assert.equal(off.status, 303);
	assert.ok(!auth.twoFactorEnabled());
});
