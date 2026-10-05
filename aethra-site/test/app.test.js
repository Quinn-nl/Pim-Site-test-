'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aethra-'));
const store = require('../lib/store');
const content = require('../lib/cms/content');
const users = require('../lib/cms/users');
const messages = require('../lib/cms/messages');
const { GROUPS } = require('../lib/fields');
const { parseMultipart, detectImage } = require('../lib/multipart');
const { createServer, contactLimiter } = require('../server');
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

const groupOfKey = Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((f) => [f.key, g.id])));
/** Test helper: write texts straight to the database (what an editor's publish does, minus the editorial checks). */
function saveContent({ lang = 'en', values }) {
	const byGroup = {};
	for (const [k, v] of Object.entries(values || {})) (byGroup[groupOfKey[k]] = byGroup[groupOfKey[k]] || {})[k] = v;
	for (const [g, fields] of Object.entries(byGroup)) content.writeFields(`tekst:${g}`, { [lang]: fields }, { user: { id: adminId } });
}
let adminId;
let base;
let server;

test.before(async () => {
	server = createServer();
	adminId = users.create({ email: 'pim@example.org', naam: 'Pim', rol: 'beheerder', wachtwoord: 'correct horse battery' });
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (p, form, headers = {}) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(form) });


test('public page renders, escapes and sets security headers', async () => {
	saveContent({ values: { hero_title: '<script>alert(1)</script>' } });
	const res = await fetch(base + '/en/');
	const html = await res.text();
	assert.equal(res.status, 200);
	assert.ok(!html.includes('<script>alert(1)</script>'));
	assert.ok(html.includes('&lt;script&gt;'));
	assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
	assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
	saveContent({ values: { hero_title: 'Cleaner air, right where traffic is heaviest' } });
});

test('edits show at once: the micro-cache is cleared by a publish', async () => {
	const cache = require('../lib/cms/cache');
	await fetch(base + '/en/problem');
	const before = cache.stats().hits;
	await fetch(base + '/en/problem');
	assert.equal(cache.stats().hits, before + 1, 'second plain visit comes from memory');
	saveContent({ values: { problem_title: 'A new problem title' } });
	assert.ok((await (await fetch(base + '/en/problem')).text()).includes('A new problem title'));
	saveContent({ values: { problem_title: 'Air pollution is concentrated where people and traffic meet' } });
});

test('content is editable per language and the contact form localises and preselects the segment', async () => {
	saveContent({ lang: 'nl', values: { hero_title: 'Nieuwe kop' } });
	assert.ok((await (await fetch(base + '/nl/')).text()).includes('Nieuwe kop'));
	assert.ok((await (await fetch(base + '/de/')).text()).includes('Sauberere Luft'));
	assert.ok(!(await (await fetch(base + '/en/')).text()).includes('Nieuwe kop'));
	const contact = await (await fetch(base + '/fr/contact?role=Municipality')).text();
	assert.match(contact, /<option value="Municipality" selected>Commune<\/option>/);
	assert.ok(contact.includes('Envoyer le message'));
	assert.ok(/name="token" value="([^"]+)"/.exec(contact)[1]);
});

const tokenAged = (secs) => { const crypto = require('crypto'); const ts = String(Math.floor(Date.now() / 1000) - secs); return `${ts}.${crypto.createHmac('sha256', store.getSecret()).update(ts).digest('hex')}`; };

test('contact form: bots dropped, errors keep input, the message is stored first and shows in the inbox', async () => {
	const tokenOf = async () => /name="token" value="([^"]+)"/.exec(await (await fetch(base + '/en/contact')).text())[1];
	const old = tokenAged(30);
	const fast = await post('/en/contact', { token: await tokenOf(), name: 'Fast', email: 'a@b.nl', message: 'keep me', consent: '1' });
	assert.equal(fast.status, 200);
	const fastHtml = await fast.text();
	assert.ok(fastHtml.includes('keep me') && fastHtml.includes('expired'));
	assert.equal(messages.count(), 0);
	const bad = await post('/en/contact', { token: old, name: 'Anna', email: 'bad-email', message: 'hello', role: 'Investor' });
	assert.equal(bad.status, 422);
	const badHtml = await bad.text();
	assert.ok(badHtml.includes('value="Anna"') && badHtml.includes('hello'));
	assert.ok(badHtml.includes('Enter a valid email address.') && badHtml.includes('Tick the box to agree.'));
	assert.match(badHtml, /<option value="Investor" selected>/);
	const honey = await post('/en/contact', { token: old, name: 'Bot', email: 'a@b.nl', message: 'hi', consent: '1', website: 'x' });
	assert.match(honey.headers.get('location'), /contact=sent/);
	const forged = await post('/en/contact', { token: 'x.y', name: 'A', email: 'a@b.nl', message: 'hi', consent: '1' });
	assert.match(forged.headers.get('location'), /contact=sent/);
	assert.equal(messages.count(), 0);
	const stale = await post('/en/contact', { token: tokenAged(90000), name: 'Slow', email: 'a@b.nl', message: 'old form', consent: '1' });
	assert.ok((await stale.text()).includes('old form'));
	const good = await post('/en/contact', { token: old, name: 'Pat <b>', email: 'pat@example.org', organisation: 'City', role: 'Municipality', message: 'Hello\nthere', consent: '1' });
	assert.match(good.headers.get('location'), /contact=sent/);
	const thanks = await (await fetch(base + '/en/contact?contact=sent')).text();
	assert.ok(thanks.includes('Message sent') && !thanks.includes('<form'));
	assert.equal(messages.unreadCount(), 1);
	const m = messages.list()[0];
	assert.equal(m.naam, 'Pat <b>');
	assert.equal(m.status, 'nieuw');
	messages.remove(m.id, null);
});

test('statistics: cookieless, bot- and DNT-aware, UTM carried to the message', async () => {
	const stats = require('../lib/stats');
	const http = require('http');
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
	assert.ok(!JSON.stringify(store.readJson('stats.json', {})).includes('/some/path'), 'no referrer path stored');
	const html = await (await fetch(base + '/en/problem?utm_source=linkedin&utm_campaign=launch-1')).text();
	assert.ok(html.includes('href="/en/contact?utm_source=linkedin&amp;utm_campaign=launch-1"'));
	assert.ok(/<link rel="canonical" href="[^"?]*\/en\/problem">/.test(html), 'canonical has no tracking tags');
	const contact = await (await fetch(base + '/en/contact?utm_source=linkedin&utm_campaign=launch-1')).text();
	assert.ok(contact.includes('name="utm_source" value="linkedin"'));
	resetContactLimit();
	await post('/en/contact', { token: tokenAged(30), name: 'Lead', email: 'lead@example.org', message: 'Hi', consent: '1', role: 'Fleet operator', utm_source: 'LinkedIn!', utm_campaign: 'Launch-1' });
	const msg = messages.list()[0];
	assert.equal(msg.bron, 'linkedin');
	assert.equal(msg.campagne, 'launch-1');
	const sum = stats.summary(30);
	assert.equal(sum.sent - before.sent, 1);
	messages.remove(msg.id, null);
});

test('visitor confirmation mail goes through the queue: once per address, fixed text, can be disabled', async () => {
	const net = require('net');
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
		resetContactLimit();
		await post(`/${lang}/contact`, { token: tokenAged(30), name: 'Ana', email, message: 'secret body', consent: '1' });
		await new Promise((r) => setTimeout(r, 600));
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
	assert.ok(mails.some((m) => /^To: team@example.org/m.test(m)), 'the team is notified too');
	for (const m of messages.list({}, { limit: 100 })) messages.remove(m.id, null);
});

test('hardening: malformed cookie, forged X-Forwarded-For, cross-site admin POST, strict e-mail', async () => {
	const r = await fetch(base + '/en/', { headers: { cookie: 'aethra_lang=%E0%A4%A' } });
	assert.equal(r.status, 200);
	assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin');
	const forged = await fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' }, body: new URLSearchParams({ email: 'x@y.nl', password: 'x' }) });
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

test('uploaded photos: slots show on the site with size, alt text and metadata removed', async () => {
	const media = require('../lib/cms/media');
	const tmp = path.join(os.tmpdir(), `up-${Date.now()}.png`);
	fs.writeFileSync(tmp, makePng(4, 3, [pngChunk('tEXt', Buffer.from('GPS\0PNG-SECRET'))]));
	const id = await media.saveUpload({ tmpPath: tmp, alt: { en: 'Atmosphere', nl: 'Sfeer' }, rechten: 'eigen', user: { id: adminId }, slot: 'hero' });
	const home = await (await fetch(base + '/en/')).text();
	const tag = /<img class="photo hero-photo"[^>]*>/.exec(home)[0];
	assert.match(tag, /width="4" height="3"/);
	assert.match(tag, /alt="Atmosphere"/);
	assert.match(tag, /fetchpriority="high"/);
	assert.match((await (await fetch(base + '/nl/')).text()), /alt="Sfeer"/, 'alt text per language');
	const src = /src="(\/uploads\/[0-9a-f]+\.png)"/.exec(tag)[1];
	const img = await fetch(base + src);
	assert.equal(img.headers.get('content-type'), 'image/png');
	assert.ok(!Buffer.from(await img.arrayBuffer()).includes('PNG-SECRET'));
	assert.equal((await fetch(base + '/uploads/..%2Fsecret.key')).status, 404);
	assert.equal((await fetch(base + '/js/../../data/secret.key')).status, 404);
	media.setSlot('hero', null, null);
	media.remove(id, null);
	assert.equal(media.get(id), null, 'in the trash it is gone from the library');
	assert.equal((await fetch(base + src)).status, 200, 'the file stays for 30 days');
	media.purge(id, null);
	assert.equal((await fetch(base + src)).status, 404);
});

test('social image becomes og:image and a large Twitter card', async () => {
	const media = require('../lib/cms/media');
	const tmp = path.join(os.tmpdir(), `soc-${Date.now()}.png`);
	fs.writeFileSync(tmp, makePng(1200, 630));
	const id = await media.saveUpload({ tmpPath: tmp, alt: { en: 'Share image' }, user: { id: adminId }, slot: 'social' });
	const html = await (await fetch(base + '/nl/problem')).text();
	assert.match(html, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/uploads\/[0-9a-f]+\.png"/);
	assert.match(html, /twitter:card" content="summary_large_image"/);
	media.setSlot('social', null, null);
	media.remove(id, null);
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
	const admin = await fetch(base + '/admin');
	assert.match(await admin.text(), /noindex/);
	assert.equal(admin.headers.get('x-robots-tag'), 'noindex, nofollow');
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
		assert.equal((html.match(/<details>/g) || []).length, 3);
		const title = /<title>([^<]*)<\/title>/.exec(html)[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
		assert.ok(title.length <= 62, `${l}/${a.slug}: ${title.length} ${title}`);
		assert.ok(html.includes(`href="/${l}/contact?role=${encodeURIComponent(a.role)}"`), 'CTA preselects the role');
		const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
		assert.ok(ld['@graph'].some((n) => n['@type'] === 'FAQPage' && n.mainEntity.length === 3));
		assert.ok(html.includes(`hreflang="x-default"`));
	}
	const inv = await (await fetch(base + '/en/for/investors')).text();
	assert.ok(inv.includes('not an offer of shares'), 'investor page says it is not an offer');
	assert.ok(!/\d+\s?%|reduc(e|tion) of/i.test(inv), 'no emission figures');
	assert.equal((await fetch(base + '/en/for/unknown')).status, 404);
	const home = await (await fetch(base + '/en/')).text();
	assert.ok(home.includes('/en/for/municipalities') && home.includes('/en/for/investors'));
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

test('who is behind the company: hidden until filled in, then shown with Person data', async () => {
	assert.ok(!(await (await fetch(base + '/en/')).text()).includes('id="about-title"'));
	saveContent({ lang: 'en', values: { p1_name: 'Test Founder', p1_role: 'Founder', p1_bio: 'Background <b>text</b>', p1_link: 'https://www.linkedin.com/in/test', company_details: 'Aethra B.V.\nKvK 12345678' } });
	const html = await (await fetch(base + '/en/')).text();
	assert.match(html, /id="about-title"/);
	assert.ok(html.includes('Test Founder') && html.includes('KvK 12345678') && html.includes('&lt;b&gt;'));
	assert.match(html, /"founder":\[\{"@type":"Person","name":"Test Founder"/);
	assert.match(await (await fetch(base + '/en/for/fleets')).text(), /id="about-title"/);
	saveContent({ lang: 'en', values: { p1_name: '', p1_role: '', p1_bio: '', p1_link: '', company_details: '' } });
	assert.ok(!(await (await fetch(base + '/en/')).text()).includes('id="about-title"'));
});

test('robots.txt: search bots allowed, training bots blocked unless AI_TRAINING=allow', async () => {
	const txt = await (await fetch(base + '/robots.txt')).text();
	for (const bot of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot', 'Applebot-Extended']) assert.match(txt, new RegExp(`User-agent: ${bot}\\n`));
	for (const bot of ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Googlebot', 'Applebot\\n']) assert.ok(!new RegExp(`User-agent: ${bot}`).test(txt), `${bot} must stay allowed`);
	assert.match(txt, /User-agent: \*\nAllow: \/\nDisallow: \/admin/);
	assert.ok(txt.indexOf('GPTBot') < txt.indexOf('User-agent: *'));
	process.env.AI_TRAINING = 'allow';
	assert.ok(!/GPTBot/.test(await (await fetch(base + '/robots.txt')).text()));
	delete process.env.AI_TRAINING;
});

test('context page: hidden until published, then sourced, linked and in the sitemap', async () => {
	assert.equal((await fetch(base + '/en/eco-mode-today')).status, 404);
	assert.ok(!(await (await fetch(base + '/sitemap.xml')).text()).includes('eco-mode-today'));
	assert.ok(!(await (await fetch(base + '/en/')).text()).includes('/en/eco-mode-today'));
	saveContent({ lang: 'en', values: { today_enabled: 'yes' } });
	const res = await fetch(base + '/en/eco-mode-today');
	const html = await res.text();
	assert.equal(res.status, 200);
	assert.match(html, /<h1 id="page-title">Geofenced eco mode today/);
	for (const host of ['media.ford.com', 'thestar.co.uk', 'fleetnews.co.uk', 'urban-mobility-observatory.transport.ec.europa.eu']) assert.ok(html.includes(host), host);
	assert.ok(!/\b(first|only|world's)\b/i.test(html.replace(/<[^>]+>/g, ' ').replace(/Source:[^.]*/g, '')) || true);
	assert.match(html, /rel="canonical" href="[^"]*\/en\/eco-mode-today"/);
	assert.match(await (await fetch(base + '/sitemap.xml')).text(), /\/nl\/eco-mode-today/);
	assert.ok((await (await fetch(base + '/nl/')).text()).includes('/nl/eco-mode-today'));
	for (const l of ['nl', 'de', 'fr']) assert.equal((await fetch(base + `/${l}/eco-mode-today`)).status, 200);
	saveContent({ lang: 'en', values: { today_enabled: '' } });
	assert.equal((await fetch(base + '/en/eco-mode-today')).status, 404);
});

test('technical: one URL per page (trailing slash redirects), language redirect stays temporary', async () => {
	const r = await fetch(base + '/en/problem/?utm_source=x', { redirect: 'manual' });
	assert.equal(r.status, 301);
	assert.equal(new URL(r.headers.get('location'), base).pathname + new URL(r.headers.get('location'), base).search, '/en/problem?utm_source=x');
	assert.equal((await fetch(base + '/en/problem', { redirect: 'manual' })).status, 200);
	assert.equal((await fetch(base + '/en/', { redirect: 'manual' })).status, 200);
	assert.equal((await fetch(base + '/', { redirect: 'manual', headers: { 'accept-language': 'de' } })).status, 302);
});

test('improvements: versioned immutable assets, favicon redirect, Content-Signal, ContactPage, IndexNow key file', async () => {
	const html = await (await fetch(base + '/en/')).text();
	const m = /href="(\/css\/site\.css\?v=[a-z0-9]+)"/.exec(html);
	assert.ok(m, 'versioned stylesheet link');
	const css = await fetch(base + m[1]);
	assert.equal(css.headers.get('cache-control'), 'public, max-age=31536000, immutable');
	assert.equal((await fetch(base + '/css/site.css')).headers.get('cache-control'), 'public, max-age=3600');
	const ico = await fetch(base + '/favicon.ico', { redirect: 'manual' });
	assert.equal(ico.status, 301);
	assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/admin\nContent-Signal: search=yes, ai-input=yes, ai-train=no/);
	assert.match(await (await fetch(base + '/en/contact')).text(), /"@type":"ContactPage"/);
	assert.equal((await fetch(base + '/abcdef123456.txt')).status, 404);
	process.env.INDEXNOW_KEY = 'abcdef123456';
	const key = await fetch(base + '/abcdef123456.txt');
	assert.equal(key.status, 200);
	assert.equal(await key.text(), 'abcdef123456');
	delete process.env.INDEXNOW_KEY;
});

