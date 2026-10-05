'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const zlib = require('zlib');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aethra-cms-'));
const db = require('../lib/cms/db');
const users = require('../lib/cms/users');
const content = require('../lib/cms/content');
const pages = require('../lib/cms/pages');
const audit = require('../lib/cms/audit');
const messages = require('../lib/cms/messages');
const media = require('../lib/cms/media');
const redirects = require('../lib/cms/redirects');
const events = require('../lib/cms/events');
const ws = require('../lib/cms/ws');
const jobs = require('../lib/cms/jobs');
const publish = require('../lib/cms/publish');
const { validateAethraCompliance } = require('../lib/cms/compliance');
const { sanitizeHtml } = require('../lib/cms/sanitize');
const { validateLayout, TEMPLATES } = require('../lib/cms/templates');
const totp = require('../lib/totp');
const { createServer } = require('../server');

const PW = 'correct horse battery';
let server, base, adminId, editorId, readerId;
const UA = 'cms-test-browser';

test.before(async () => {
	server = createServer();
	adminId = users.create({ email: 'pim@example.org', naam: 'Pim', rol: 'beheerder', wachtwoord: PW });
	editorId = users.create({ email: 'els@example.org', naam: 'Els', rol: 'editor', wachtwoord: PW });
	readerId = users.create({ email: 'rob@example.org', naam: 'Rob', rol: 'lezer', wachtwoord: PW });
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${server.address().port}`;
	ws.start();
});
test.after(() => { ws.closeAll(); events.reset(); messages.stop(); server.close(); });

/* ---- small HTTP client with cookies ---- */
function client(user = 'pim@example.org', password = PW) {
	const c = { cookie: '', csrf: '' };
	c.req = (p, opts = {}) => fetch(base + p, { redirect: 'manual', ...opts, headers: { 'user-agent': UA, cookie: c.cookie, ...(opts.headers || {}) } });
	c.post = (p, form, headers = {}) => c.req(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ csrf: c.csrf, ...form }) });
	c.json = (p, body, headers = {}) => c.req(p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': c.csrf, accept: 'application/json', ...headers }, body: JSON.stringify(body) });
	c.login = async () => {
		const r = await c.req('/admin/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: user, password }) });
		if (r.status !== 303) return r;
		c.cookie = r.headers.get('set-cookie').split(';')[0];
		const page = await (await c.req('/admin')).text();
		c.csrf = /name="csrf" value="([0-9a-f]+)"/.exec(page)[1];
		return r;
	};
	return c;
}

/* ---- schema, audit ---- */
test('migrations run once from database/migrations and are recorded', () => {
	assert.deepEqual(db.all('SELECT versie, naam FROM schema_versies').map((r) => r.naam), ['001_init.sql', '002_bericht_status.sql']);
	db.open();
	assert.equal(db.all('SELECT versie FROM schema_versies').length, 2, 'opening again does not repeat a migration');
	const unique = db.all("PRAGMA index_list('vertalingen')").filter((i) => i.unique).map((i) => db.all(`PRAGMA index_info('${i.name}')`).map((c) => c.name).join(','));
	assert.ok(unique.includes('object,veld,taal'), 'unique index on (object, veld, taal)');
});

test('audit_logs is append-only; rows older than 180 days can be archived and removed', () => {
	audit.log({ user: adminId, actie: 'test.actie', entiteit: 'x:1', nieuw: { a: 1 }, reden: 'omdat' });
	assert.throws(() => db.run("UPDATE audit_logs SET actie = 'x'"), /append-only/);
	assert.throws(() => db.run('DELETE FROM audit_logs'), /append-only/);
	db.run("INSERT INTO audit_logs (actie, entiteit, timestamp) VALUES ('oud', 'x:0', '2020-01-01T00:00:00.000Z')");
	const r = audit.rotate();
	assert.equal(r.archived, 1);
	assert.ok(fs.existsSync(r.file));
	assert.match(zlib.gunzipSync(fs.readFileSync(r.file)).toString(), /"actie":"oud"/);
	assert.equal(db.get("SELECT COUNT(*) AS n FROM audit_logs WHERE actie = 'oud'").n, 0);
	assert.ok(db.get("SELECT COUNT(*) AS n FROM audit_logs WHERE actie = 'test.actie'").n >= 1, 'recent rows stay');
});

/* ---- users ---- */
test('passwords: scrypt N=16384 r=8 p=1 with a salt per user; wrong or unknown users cost the same', () => {
	const h = users.byEmail('pim@example.org').wachtwoord_hash;
	assert.match(h, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
	assert.notEqual(h.split('$')[4], users.byEmail('els@example.org').wachtwoord_hash.split('$')[4], 'different salts');
	assert.ok(users.verifyPassword(PW, h));
	assert.ok(!users.verifyPassword('nope', h));
	assert.ok(!users.verifyPassword(PW, null));
	assert.throws(() => users.create({ email: 'x@y.nl', naam: 'X', wachtwoord: 'short' }), /12 tekens/);
});

test('lockout: 5 tries per 15 minutes, then 15 minutes, 1 hour, 24 hours', () => {
	const t0 = 1_000_000_000_000;
	const ip = '203.0.113.5', em = 'lock@example.org';
	let r;
	for (let i = 0; i < 4; i++) { r = users.failedAttempt(ip, em, t0 + i); assert.equal(r.locked, false); }
	r = users.failedAttempt(ip, em, t0 + 10);
	assert.equal(r.locked, true);
	assert.equal(r.until - (t0 + 10), 15 * 60 * 1000);
	assert.equal(users.lockState(ip, em, t0 + 60000).locked, true);
	assert.equal(users.lockState(ip, em, t0 + 16 * 60 * 1000).locked, false);
	let now = t0 + 16 * 60 * 1000;
	for (let i = 0; i < 5; i++) r = users.failedAttempt(ip, em, now + i);
	assert.equal(r.until - (now + 4), 60 * 60 * 1000, 'second lockout: 1 hour');
	now += 2 * 60 * 60 * 1000;
	for (let i = 0; i < 5; i++) r = users.failedAttempt(ip, em, now + i);
	assert.equal(r.until - (now + 4), 24 * 60 * 60 * 1000, 'third lockout: 24 hours');
	users.clearAttempts(ip, em);
	assert.equal(users.lockState(ip, em, now + 1).locked, false);
});

test('sessions: bound to User-Agent and IP subnet, only a hash is stored, rotation ends the old id', () => {
	const s = users.createSession(adminId, '198.51.100.7', 'UA-1');
	const req = (ua, id = s.id) => ({ headers: { cookie: `aethra_sid=${id}`, 'user-agent': ua } });
	assert.ok(!db.all('SELECT id_hash FROM sessies').some((r) => r.id_hash === s.id), 'the session id itself is never stored');
	assert.equal(users.getSession(req('UA-1'), '198.51.100.99').user.email, 'pim@example.org', 'same /24 is fine');
	assert.equal(users.getSession(req('UA-2'), '198.51.100.7'), null, 'other browser: session ends');
	const s2 = users.createSession(adminId, '198.51.100.7', 'UA-1');
	assert.equal(users.getSession({ headers: { cookie: `aethra_sid=${s2.id}`, 'user-agent': 'UA-1' } }, '203.0.113.9'), null, 'other network: session ends');
	const s3 = users.createSession(adminId, '198.51.100.7', 'UA-1');
	const rotated = users.rotateSession({ id: s3.id, user: { id: adminId } }, { headers: { 'user-agent': 'UA-1' } }, '198.51.100.7');
	assert.notEqual(rotated.id, s3.id);
	assert.equal(users.getSession({ headers: { cookie: `aethra_sid=${s3.id}`, 'user-agent': 'UA-1' } }, '198.51.100.7'), null);
	assert.match(users.cookieHeader('x', 5), /HttpOnly; SameSite=Strict/);
	assert.match(users.cookieHeader('x', 5), /Path=\/admin/);
});

test('two-step verification: encrypted secret, one use per time step, hashed single-use recovery codes', () => {
	const id = users.create({ email: 'tf@example.org', naam: 'TF', rol: 'editor', wachtwoord: PW });
	const setup = users.beginTwoFactor(id);
	assert.match(setup.uri, /^otpauth:\/\/totp\/Aethra:tf%40example\.org\?secret=[A-Z2-7]+&issuer=Aethra/);
	assert.ok(!db.get('SELECT totp_open_geheim FROM gebruikers WHERE id = ?', id).totp_open_geheim.includes(setup.secret), 'secret is not stored in the clear');
	const step = Math.floor(Date.now() / 30000);
	assert.equal(users.confirmTwoFactor(id, '000000'), null);
	const codes = users.confirmTwoFactor(id, totp.codeAt(setup.secret, step));
	assert.equal(codes.length, 8);
	assert.ok(codes.every((c) => /^[a-z]{5}-[a-z]{5}$/.test(c)));
	assert.ok(!db.all('SELECT hash FROM herstelcodes WHERE gebruiker_id = ?', id).some((r) => codes.some((c) => r.hash.includes(c.replace('-', '')))), 'recovery codes are hashed');
	assert.equal(users.verifySecondFactor(id, totp.codeAt(setup.secret, step)), false, 'the same step cannot be used twice');
	assert.equal(users.verifySecondFactor(id, totp.codeAt(setup.secret, step + 1)), true);
	assert.equal(users.verifySecondFactor(id, codes[0]), true);
	assert.equal(users.verifySecondFactor(id, codes[0]), false, 'a recovery code works once');
	assert.equal(users.recoveryLeft(id), 7);
	users.disableTwoFactor(id);
	assert.equal(users.recoveryLeft(id), 0);
});

/* ---- content ---- */
test('writeFields: one transaction, version check (409), history, diff and rollback', () => {
	const o = 'tekst:hero';
	let r = content.writeFields(o, { en: { hero_title: 'One', hero_cta: 'Go' }, nl: { hero_title: 'Een' } }, { user: { id: adminId }, baseVersie: 0 });
	assert.equal(r.versie, 1);
	assert.equal(content.textValues('nl').hero_title, 'Een');
	r = content.writeFields(o, { en: { hero_title: 'Two' } }, { user: { id: adminId }, baseVersie: 1 });
	assert.equal(r.versie, 2);
	assert.throws(() => content.writeFields(o, { en: { hero_title: 'Three' } }, { user: { id: adminId }, baseVersie: 1 }), (e) => e.status === 409 && e.huidige_versie === 2);
	assert.equal(content.textValues('en').hero_title, 'Two');
	// a failure in the middle rolls everything back
	assert.throws(() => content.writeFields(o, { en: { hero_title: 'Broken', hero_cta: 'Broken' } }, { user: { id: adminId }, applyMeta: () => { throw new Error('boom'); } }), /boom/);
	assert.equal(content.textValues('en').hero_title, 'Two');
	assert.equal(content.objectVersion(o), 2);
	const h = content.history(o);
	assert.equal(h.length, 1);
	const old = content.historyEntry(h[0].id);
	assert.equal(old.snapshot.velden.en.hero_title, 'One');
	const d = content.diffObjects(old.snapshot.velden, content.readObject(o));
	assert.deepEqual(d.find((x) => x.veld === 'hero_title').regels.map((l) => l.t + l.tekst), ['-One', '+Two']);
	content.writeFields(o, old.snapshot.velden, { user: { id: adminId }, baseVersie: 2, reden: 'rollback' });
	assert.equal(content.textValues('en').hero_title, 'One');
	assert.equal(db.get("SELECT COUNT(*) AS n FROM audit_logs WHERE actie = 'inhoud.rollback'").n, 1);
});

test('placeholder rows from the health check never replace a default; a deliberate empty optional text does', () => {
	const r = jobs.healthCheck();
	assert.ok(r.created > 400);
	assert.equal(content.textValues('en').status_short.startsWith('Prototype phase'), true, 'default still used');
	content.writeFields('tekst:home', { en: { status_short: '' } }, { user: { id: adminId } });
	assert.equal(content.textValues('en').status_short, '', 'an editor emptied this optional text');
	assert.equal(db.get("SELECT COUNT(*) AS n FROM gezondheid WHERE sleutel LIKE 'nakijken.%'").n, 3, 'the three non-English languages are still to be reviewed');
	assert.equal(jobs.healthCheck().created, 0, 'running it again changes nothing');
});

test('auto-save drafts are separate from the live content', () => {
	content.saveDraft('tekst:hero', adminId, { velden: { en: { hero_title: 'Draft only' } } }, 3);
	assert.equal(content.getDraft('tekst:hero', adminId).data.velden.en.hero_title, 'Draft only');
	assert.notEqual(content.textValues('en').hero_title, 'Draft only');
	assert.equal(content.getDraft('tekst:hero', editorId), null, 'drafts are per user');
	content.deleteDraft('tekst:hero', adminId);
});

/* ---- compliance, sanitizer, templates ---- */
test('compliance: forbidden words block (not inside a "not an offer" sentence), numbers need a source, doubtful words warn', () => {
	const c = (velden, extra = {}) => validateAethraCompliance({ object: 'tekst:x', velden, ...extra });
	assert.equal(c({ nl: { a: 'Gegarandeerd rendement op aandelen' } }).fouten.length >= 1, true);
	assert.equal(c({ en: { a: 'Buy shares today' } }).fouten[0].regel, 'verboden_term');
	assert.equal(c({ en: { a: 'This is not an offer of shares.' } }).fouten.length, 0, 'the disclaimer itself is allowed');
	assert.equal(c({ de: { a: 'Das ist kein Angebot von Aktien.' } }).fouten.length, 0);
	assert.equal(c({ en: { fact1_value: '4.2 million', fact1_source: '' } }).fouten[0].regel, 'bron_ontbreekt');
	assert.equal(c({ en: { fact1_value: '4.2 million', fact1_source: 'WHO' } }).fouten.length, 0);
	assert.equal(c({ en: { fact1_value: 'many', fact1_source: '' } }).fouten.length, 0, 'no digit, no source needed');
	assert.equal(c({ en: { a: 'Proven results' } }).waarschuwingen[0].regel, 'twijfelachtige_claim');
	assert.equal(c({ en: { a: 'The firmware decides' } }).waarschuwingen[0].regel, 'technisch_detail');
	for (const lang of ['en', 'nl', 'de', 'fr']) {
		const { defaultsFor } = require('../lib/i18n');
		const velden = { [lang]: Object.fromEntries(Object.entries(defaultsFor(lang)).filter(([k]) => k.startsWith('aud_') || k.startsWith('fact'))) };
		assert.deepEqual(validateAethraCompliance({ object: 'tekst:aud_investors', velden }).fouten, [], `the shipped ${lang} texts pass their own rules`);
	}
	assert.equal(c({ en: { aud_investors_a1: 'We sell nothing.' } }, { object: 'tekst:aud_investors' }).fouten.some((f) => f.regel === 'disclaimer_ontbreekt'), false === false && true);
});

test('publish: hard errors 422, warnings 409 until an override with a reason, which is audited', () => {
	const params = (v) => ({ groupId: 'about', velden: { en: { about_text: v } }, baseVersie: content.objectVersion('tekst:about') });
	assert.throws(() => publish.publish('tekst', params('We guarantee a return'), { id: adminId }), (e) => e.status === 422 && e.fouten[0].regel === 'verboden_term');
	assert.throws(() => publish.publish('tekst', params('A proven approach'), { id: adminId }), (e) => e.status === 409 && e.waarschuwingen.length === 1);
	assert.throws(() => publish.publish('tekst', { ...params('A proven approach'), overrideReden: 'kort' }, { id: adminId }), (e) => e.status === 409);
	const r = publish.publish('tekst', { ...params('A proven approach'), overrideReden: 'Bewezen in de eerste pilot, bron volgt' }, { id: adminId });
	assert.ok(r.versie >= 1);
	const row = db.get("SELECT * FROM audit_logs WHERE actie = 'publicatie.override' ORDER BY id DESC");
	assert.equal(row.override_reden, 'Bewezen in de eerste pilot, bron volgt');
	assert.equal(row.gebruiker_id, adminId);
	content.writeFields('tekst:about', { en: { about_text: '' } }, { user: { id: adminId } });
});

test('sanitizer: only whitelisted tags and safe links survive', () => {
	const bad = ['<script>alert(1)</script>x', '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>', '<a href="java\tscript:alert(1)">x</a>', '<a href="data:text/html,x">x</a>', '<p onclick="x()">t</p>', '<svg onload=alert(1)></svg>', '<iframe src="//evil"></iframe>', '<style>body{}</style>y', '<<script>script>alert(1)<</script>/script>'];
	for (const b of bad) { const o = sanitizeHtml(b); assert.ok(!/<script|onerror|onclick|onload|javascript:|<img|<svg|<iframe|<style|data:/i.test(o), `${b} -> ${o}`); }
	assert.equal(sanitizeHtml('<p>Hi <b>there</b> <i>x</i></p>'), '<p>Hi <strong>there</strong> <em>x</em></p>');
	assert.equal(sanitizeHtml('<a href="https://a.b/?q=1&x=2" onmouseover=1>ok</a>'), '<a href="https://a.b/?q=1&amp;x=2" rel="noopener">ok</a>');
	assert.equal(sanitizeHtml('<a href="/contact">c</a>'), '<a href="/contact">c</a>');
	assert.equal(sanitizeHtml('<ul><li>a<li>b</ul><p>unclosed'), '<ul><li>a</li><li>b</li></ul><p>unclosed</p>');
	assert.equal(sanitizeHtml('1 < 2 & 3 > 2'), '1 &lt; 2 &amp; 3 &gt; 2');
});

test('templates: seven of them, with rules the back-end enforces', () => {
	assert.equal(Object.keys(TEMPLATES).length, 7);
	const L = (...types) => types.map((type, i) => ({ id: `s${i + 1}`, type }));
	assert.deepEqual(validateLayout('standaard', L('tekst', 'cta')), []);
	assert.match(validateLayout('standaard', L('cta', 'tekst')).join(' '), /laatste/);
	assert.match(validateLayout('standaard', L('hero', 'tekst')).join(' '), /niet toegestaan/);
	assert.match(validateLayout('standaard', L('citaat')).join(' '), /vereist/);
	assert.match(validateLayout('standaard', L('tekst', 'cta', 'cta')).join(' '), /Maximaal 1/);
	assert.deepEqual(validateLayout('investeerder', L('disclaimer', 'punten', 'faq', 'cta')), []);
	assert.match(validateLayout('investeerder', L('punten', 'faq', 'cta')).join(' '), /disclaimer/i, 'the disclaimer cannot be removed');
	assert.match(validateLayout('investeerder', L('punten', 'faq', 'tekst', 'tekst', 'disclaimer', 'cta')).join(' '), /eerste 3/, 'nor dragged too far down');
	assert.match(validateLayout('doelgroep', L('faq', 'punten', 'cta')).join(' '), /vaste volgorde/);
	assert.match(validateLayout('landing', L('tekst', 'hero', 'cta')).join(' '), /bovenaan/);
	assert.deepEqual(validateLayout('vrije_secties', L('cta', 'hero', 'disclaimer', 'cta', 'tekst')), [], 'free sections: no order rules');
	assert.match(validateLayout('vrije_secties', [{ id: 'x', type: 'tekst' }]).join(' '), /ongeldig id/);
	assert.match(validateLayout('vrije_secties', L('nope')).join(' '), /Onbekende bouwsteen/);
	assert.match(validateLayout('bestaat-niet', []).join(' '), /Onbekend sjabloon/);
});

/* ---- pages, redirects ---- */
test('pages: draft is invisible, publish shows it with hreflang, slug change redirects, unpublish hides, delete cleans up', async () => {
	const id = pages.create({ sjabloon: 'update', user: { id: adminId } });
	const save = (velden, status, base) => { const pr = pages.prepare(id, { velden, meta: { status } }); return pages.save(id, pr, { user: { id: adminId }, baseVersie: base }); };
	save({ en: { titel: 'Pilot update', slug: 'pilot-update', 's.s1.body': '<p>We started <b>a pilot</b>.</p><script>x</script>' }, nl: { titel: 'Pilot-update', slug: 'pilot-nieuws', 's.s1.body': '<p>We zijn gestart.</p>' } }, 'concept', 0);
	assert.equal((await fetch(`${base}/en/pilot-update`)).status, 404, 'a draft is not public');
	save({ en: { titel: 'Pilot update', slug: 'pilot-update', 's.s1.body': '<p>We started <b>a pilot</b>.</p><script>x</script>' }, nl: { titel: 'Pilot-update', slug: 'pilot-nieuws', 's.s1.body': '<p>We zijn gestart.</p>' } }, 'gepubliceerd', 1);
	const html = await (await fetch(`${base}/en/pilot-update`)).text();
	assert.match(html, /<h1 id="page-title">Pilot update<\/h1>/);
	assert.ok(html.includes('<strong>a pilot</strong>') && !html.includes('<script>x'));
	assert.ok(html.includes('hreflang="nl" href="http://127.0.0.1') && html.includes('/nl/pilot-nieuws'));
	assert.equal((await fetch(`${base}/de/pilot-update`)).status, 404, 'only languages that have content');
	assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), /\/nl\/pilot-nieuws/);
	assert.match(await (await fetch(`${base}/llms.txt`)).text(), /Pilot update/);
	// address change: permanent redirect from the old address
	save({ en: { titel: 'Pilot update', slug: 'pilot', 's.s1.body': '<p>x</p>' }, nl: { titel: 'Pilot-update', slug: 'pilot-nieuws', 's.s1.body': '<p>x</p>' } }, 'gepubliceerd', 2);
	const moved = await fetch(`${base}/en/pilot-update`, { redirect: 'manual' });
	assert.equal(moved.status, 301);
	assert.equal(moved.headers.get('location'), '/en/pilot');
	assert.equal((await fetch(`${base}/en/pilot`)).status, 200);
	// address rules
	assert.throws(() => pages.prepare(id, { velden: { en: { titel: 'x', slug: 'contact' } } }), /wordt door de website zelf gebruikt/);
	assert.throws(() => pages.prepare(id, { velden: { en: { titel: 'x', slug: 'Bad Slug' } } }), /kleine letters/);
	const other = pages.create({ sjabloon: 'standaard', user: { id: adminId } });
	assert.throws(() => pages.prepare(other, { velden: { en: { titel: 'x', slug: 'pilot' } } }), /al/);
	// noindex
	const pr = pages.prepare(id, { velden: { en: { titel: 'Pilot update', slug: 'pilot', 's.s1.body': '<p>x</p>' } }, meta: { status: 'gepubliceerd', indexeren: false } });
	pages.save(id, pr, { user: { id: adminId }, baseVersie: 3 });
	assert.match(await (await fetch(`${base}/en/pilot`)).text(), /<meta name="robots" content="noindex, follow">/);
	assert.ok(!(await (await fetch(`${base}/sitemap.xml`)).text()).includes('/en/pilot<'), 'noindex pages leave the sitemap');
	// rollback comes back as a draft
	const hist = content.history(pages.object(id))[0];
	pages.rollback(id, hist.id, { user: { id: adminId }, baseVersie: content.objectVersion(pages.object(id)) });
	assert.equal((await fetch(`${base}/en/pilot`)).status, 404);
	pages.remove(id, { id: adminId });
	pages.remove(other, { id: adminId });
	assert.equal(db.get('SELECT COUNT(*) AS n FROM vertalingen WHERE object LIKE ?', `pagina:${id}`).n, 0);
});

test('page sections render: facts with sources, steps, cards, faq with schema, quote, disclaimer, safe links', async () => {
	const id = pages.create({ sjabloon: 'vrije_secties', user: { id: adminId } });
	const indeling = [{ id: 's1', type: 'hero' }, { id: 's2', type: 'feiten' }, { id: 's3', type: 'stappen' }, { id: 's4', type: 'kaarten' }, { id: 's5', type: 'faq' }, { id: 's6', type: 'citaat' }, { id: 's7', type: 'disclaimer' }, { id: 's8', type: 'cta' }, { id: 's9', type: 'punten' }, { id: 's10', type: 'chips' }];
	const en = { titel: 'Everything', slug: 'everything', 's.s1.title': 'Big <b>title</b>', 's.s1.cta_label': 'Talk', 's.s1.cta_url': '/contact', 's.s2.items.1.value': '4.2 million', 's.s2.items.1.label': 'deaths', 's.s2.items.1.source': 'WHO', 's.s2.items.1.url': 'https://who.int/x', 's.s3.items.1.title': 'Detect', 's.s3.items.1.text': 'Step text', 's.s4.items.1.title': 'Card', 's.s4.items.1.text': 'Card text', 's.s4.items.1.url': 'javascript:alert(1)', 's.s5.items.1.q': 'Why?', 's.s5.items.1.a': 'Because.', 's.s6.quote': 'A quote', 's.s6.by': 'Someone', 's.s7.tekst': 'This is not an offer.', 's.s9.items.1.text': 'Point', 's.s10.items.1.label': 'Home', 's.s10.items.1.url': '/' };
	assert.throws(() => pages.prepare(id, { velden: { en }, meta: { indeling } }), /link/, 'a javascript: link is refused when saving');
	en['s.s4.items.1.url'] = '/applications';
	const pr = pages.prepare(id, { velden: { en }, meta: { indeling, status: 'gepubliceerd' } });
	pages.save(id, pr, { user: { id: adminId }, baseVersie: 0 });
	const html = await (await fetch(`${base}/en/everything`)).text();
	assert.match(html, /<h1 id="hero-title">Big &lt;b&gt;title&lt;\/b&gt;<\/h1>/);
	assert.match(html, /<p class="fact-value">4\.2 million<\/p>/);
	assert.ok(html.includes('rel="noopener noreferrer" target="_blank">WHO</a>'));
	assert.match(html, /href="\/en\/contact"/);
	assert.match(html, /href="\/en\/applications">Card/);
	assert.ok(html.includes('<details><summary>Why?</summary>'));
	assert.match(html, /"@type":"FAQPage"/);
	assert.ok(html.includes('<blockquote class="quote">') && html.includes('class="disclaimer"'));
	assert.equal((html.match(/<h1[ >]/g) || []).length, 1, 'one h1 even with a hero');
	pages.remove(id, { id: adminId });
});

/* ---- messages and the mail queue ---- */
test('messages: stored first, queue with exponential backoff, give up after 5, alarm after an hour, retry', async () => {
	Object.assign(process.env, { SMTP_HOST: '127.0.0.1', MAIL_FROM: 'a@b.nl', MAIL_TO: 't@b.nl' });
	const saved = messages.add({ lang: 'en', name: 'Ann', email: 'ann@example.org', role: 'Other', message: 'hello' });
	assert.equal(messages.get(saved.id).tekst, 'hello', 'the row exists before any mail is sent');
	const fail = async () => ({ sent: false, reason: 'ECONNREFUSED' });
	let now = Date.now();
	const waits = [];
	for (let i = 0; i < 5; i++) {
		await messages.tick(now, fail);
		const row = db.get("SELECT * FROM uitgaande_wachtrij WHERE bericht_id = ? AND soort = 'team'", saved.id);
		waits.push([row.status, row.aantal_pogingen, row.status === 'mislukt' ? Math.round((row.volgende_poging - now) / 60000) : 0]);
		now = row.status === 'mislukt' ? row.volgende_poging + 1000 : now + 1000;
	}
	assert.deepEqual(waits, [['mislukt', 1, 10], ['mislukt', 2, 20], ['mislukt', 3, 40], ['mislukt', 4, 80], ['gefaald', 5, 0]]);
	assert.equal(messages.alarmCount(now), 1, 'failing for over an hour raises the alarm');
	assert.equal(messages.alarmCount(Date.now()), 0, 'but not right away');
	messages.retry(db.get("SELECT id FROM uitgaande_wachtrij WHERE bericht_id = ?", saved.id).id, { id: adminId });
	let sent = 0;
	await messages.tick(now, async (m) => { sent += 1; assert.match(m.subject, /New website message/); return { sent: true }; });
	assert.equal(sent, 1);
	assert.equal(messages.alarmCount(now), 0);
	for (const k of ['SMTP_HOST', 'MAIL_FROM', 'MAIL_TO']) delete process.env[k];
	messages.remove(saved.id, null);
});

test('messages: search, filters, status, privacy request by e-mail, retention, CSV safety', () => {
	const a = messages.add({ lang: 'nl', name: '=HYPERLINK("x")', email: 'one@example.org', org: '+1', role: 'Investor', message: 'a "quoted"\nline', source: 'linkedin', campaign: 'launch' });
	messages.add({ lang: 'en', name: 'Two', email: 'one@example.org', role: 'Other', message: 'second' });
	messages.add({ lang: 'en', name: 'Three', email: 'three@example.org', role: 'Municipality', message: 'third message about rail' });
	assert.equal(messages.count({ q: 'rail' }), 1);
	assert.equal(messages.count({ q: '%' }), 0, 'LIKE wildcards are escaped');
	assert.equal(messages.count({ rol: 'Investor' }), 1);
	assert.equal(messages.count({ taal: 'nl', bron: 'linkedin' }), 1);
	assert.equal(messages.byEmail('one@example.org').length, 2);
	messages.setStatus(a.id, 'beantwoord', { id: adminId });
	assert.equal(messages.get(a.id).status, 'beantwoord');
	messages.markRead(a.id);
	assert.equal(messages.get(a.id).status, 'beantwoord', 'reading never moves a message back');
	messages.setNote(a.id, 'called back', { id: adminId });
	const csv = messages.csv();
	assert.ok(csv.includes('"\'=HYPERLINK') && csv.includes('"\'+1"') && csv.includes('a ""quoted"" line'));
	db.run("UPDATE berichten SET tijd = '2019-01-01T00:00:00.000Z' WHERE naam = 'Three'");
	assert.equal(messages.purge(365), 1, 'older than the retention period: gone');
	assert.equal(messages.removeByEmail('one@example.org', { id: adminId }), 2);
	assert.equal(messages.count(), 0);
});

/* ---- media ---- */
const crc32 = (buf) => { let r = 0xffffffff; for (const x of buf) { let c = (r ^ x) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; r = c ^ (r >>> 8); } return (r ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function png(w = 4, h = 3) {
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('GPS\0SECRET')), chunk('IDAT', zlib.deflateSync(Buffer.alloc(h * (1 + w * 3)))), chunk('IEND', Buffer.alloc(0))]);
}
const upload = (c, parts, headers = {}) => { const fd = new FormData(); fd.set('csrf', c.csrf); for (const [k, v] of Object.entries(parts)) fd.set(k, v); return c.req('/admin/media/upload', { method: 'POST', body: fd, headers }); };

test('media upload over HTTP: magic bytes, size cap, alt required, atomic, metadata stripped, no temp files left', async () => {
	const c = client(); await c.login();
	const bad = await upload(c, { alt_en: 'x', rechten: 'eigen', file: new Blob([Buffer.from('<?php echo 1; ?><?php echo 2; ?>')]) });
	assert.match(bad.headers.get('location'), /badimg/);
	const noAlt = await upload(c, { alt_en: '', rechten: 'eigen', file: new Blob([png()]) });
	assert.equal(noAlt.status, 422);
	assert.match(await noAlt.text(), /omschrijving/);
	const big = await upload(c, { alt_en: 'x', rechten: 'eigen', file: new Blob([Buffer.concat([png(), Buffer.alloc(6 * 1024 * 1024)])]) });
	assert.equal(big.status, 413);
	const ok = await upload(c, { alt_en: 'A test photo', alt_nl: 'Een testfoto', rechten: 'ai_sfeer', bron: 'test', file: new Blob([png()], { type: 'image/png' }) });
	assert.match(ok.headers.get('location'), /opgeslagen/);
	const item = media.list()[0];
	assert.equal(item.rechten, 'ai_sfeer');
	assert.equal(item.alt.nl, 'Een testfoto');
	assert.ok(!fs.readFileSync(path.join(media.uploadsDir(), item.bestand)).includes('SECRET'));
	assert.deepEqual(fs.readdirSync(media.tmpDir()), [], 'nothing is left in the temp folder');
	const noCsrf = new FormData(); noCsrf.set('alt_en', 'x'); noCsrf.set('rechten', 'eigen'); noCsrf.set('file', new Blob([png()]));
	assert.equal((await c.req('/admin/media/upload', { method: 'POST', body: noCsrf })).status, 403);
	assert.deepEqual(fs.readdirSync(media.tmpDir()), []);
	media.remove(item.id, { id: adminId });
});

test('media: WebP and AVIF variants (1x and 2x) are made when the encoders exist and shown through <picture>', async () => {
	const fake = path.join(os.tmpdir(), `enc-${Date.now()}.js`);
	fs.writeFileSync(fake, "#!/usr/bin/env node\nconst fs=require('fs');const a=process.argv.slice(2);if(a[0]==='-version'||a[0]==='--version'){console.log('1');process.exit(0);}\nconst out=a.includes('-o')?a[a.indexOf('-o')+1]:a[a.length-1];fs.writeFileSync(out,'FAKE');\n", { mode: 0o755 });
	process.env.CWEBP_BIN = fake; process.env.AVIFENC_BIN = fake;
	const tmp = path.join(os.tmpdir(), `big-${Date.now()}.png`);
	fs.writeFileSync(tmp, png(3000, 2));
	const id = await media.saveUpload({ tmpPath: tmp, alt: { en: 'Wide' }, user: { id: adminId }, slot: 'hero' });
	const m = media.get(id);
	delete process.env.CWEBP_BIN; delete process.env.AVIFENC_BIN;
	assert.deepEqual(m.varianten.map((v) => [v.type, v.breedte, v.dichtheid]), [['image/webp', 1200, 1], ['image/webp', 2400, 2]], 'avif is skipped above 2400 px');
	const html = await (await fetch(`${base}/en/`)).text();
	assert.match(html, /<picture><source type="image\/webp" srcset="\/uploads\/[0-9a-f]+\.webp 1x, \/uploads\/[0-9a-f]+@2x\.webp 2x"><img class="photo hero-photo"/);
	media.setSlot('hero', null, null);
	media.remove(id, { id: adminId });
});

/* ---- the admin over HTTP ---- */
test('admin: login, hardened cookie and headers, nonce CSP, CSRF, lockout', async () => {
	const anon = await fetch(`${base}/admin/paginas`, { redirect: 'manual' });
	assert.equal(anon.status, 303);
	const c = client();
	const bad = await c.req('/admin/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'pim@example.org', password: 'nope' }) });
	assert.equal(bad.status, 401);
	const ok = await c.login();
	assert.equal(ok.status, 303);
	const set = ok.headers.get('set-cookie');
	assert.match(set, /HttpOnly/); assert.match(set, /SameSite=Strict/); assert.match(set, /Path=\/admin/);
	const dash = await c.req('/admin');
	const csp = dash.headers.get('content-security-policy');
	const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)[1];
	assert.match(csp, /default-src 'self'; script-src 'self' 'nonce-/);
	assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /object-src 'none'/);
	assert.equal(dash.headers.get('x-frame-options'), 'DENY');
	assert.equal(dash.headers.get('x-content-type-options'), 'nosniff');
	assert.equal(dash.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
	const html = await dash.text();
	assert.ok(html.includes(`nonce="${nonce}"`), 'the script tag carries this request\'s nonce');
	assert.notEqual(/'nonce-([A-Za-z0-9+/=]+)'/.exec((await c.req('/admin')).headers.get('content-security-policy'))[1], nonce, 'a new nonce per request');
	assert.equal((await c.req('/admin/redirects', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'van=/nl/a&naar=/nl/b' })).status, 403, 'POST without CSRF token');
	assert.equal((await c.json('/admin/auto-save', { object: 'privacy', data: {} }, { 'x-csrf-token': 'wrong' })).status, 403);
	// lockout over HTTP: 5 wrong passwords, then even the right one is refused
	const victim = 'locked@example.org';
	users.create({ email: victim, naam: 'Locked', wachtwoord: PW });
	const l = client(victim, 'wrong password!');
	let last;
	for (let i = 0; i < 5; i++) last = await l.login();
	assert.equal(last.status, 429);
	assert.equal((await client(victim, PW).login()).status, 429);
});

test('admin: roles (reader cannot write, only administrators manage users and see the audit log)', async () => {
	const r = client('rob@example.org'); await r.login();
	assert.equal((await r.req('/admin/paginas')).status, 200);
	assert.equal((await r.json('/admin/publish', { kind: 'tekst', id: 'hero', velden: { en: { hero_title: 'x' } }, baseVersie: 0 })).status, 403);
	assert.equal((await r.post('/admin/paginas/nieuw', { sjabloon: 'standaard' })).status, 403);
	assert.equal((await r.req('/admin/gebruikers')).status, 403);
	assert.equal((await r.req('/admin/audit')).status, 403);
	const e = client('els@example.org'); await e.login();
	assert.equal((await e.req('/admin/gebruikers')).status, 403);
	assert.equal((await e.req('/admin/audit')).status, 403);
	assert.equal((await e.req('/admin/berichten')).status, 200);
	const a = client(); await a.login();
	assert.equal((await a.req('/admin/gebruikers')).status, 200);
	assert.equal((await a.req('/admin/audit')).status, 200);
});

test('admin: publish API, override endpoint, stale version and preview in a sandboxed frame', async () => {
	const c = client(); await c.login();
	const v = () => content.objectVersion('tekst:contact');
	const body = (title, extra = {}) => ({ kind: 'tekst', id: 'contact', velden: { en: { contact_title: title } }, baseVersie: v(), ...extra });
	let r = await c.json('/admin/publish', body('Talk to us'));
	assert.equal(r.status, 200);
	assert.ok((await (await fetch(`${base}/en/contact`)).text()).includes('Talk to us'));
	r = await c.json('/admin/publish', body('Guaranteed returns'));
	assert.equal(r.status, 422);
	assert.equal((await r.json()).fouten[0].regel, 'verboden_term');
	r = await c.json('/admin/publish', body('A proven way to reach us'));
	assert.equal(r.status, 409);
	assert.equal((await r.json()).waarschuwingen.length, 1);
	r = await c.json('/admin/publish/override', body('A proven way to reach us', { override_reason: 'kort' }));
	assert.equal(r.status, 400);
	r = await c.json('/admin/publish/override', body('A proven way to reach us', { override_reason: 'Redactie heeft dit besproken en akkoord' }));
	assert.equal(r.status, 200);
	r = await c.json('/admin/publish', body('Stale', { baseVersie: 0 }));
	assert.equal(r.status, 409);
	assert.ok((await r.json()).huidige_versie > 0);
	assert.equal(content.textValues('en').contact_title, 'A proven way to reach us');
	// preview: the editor state is rendered, never stored
	const payload = JSON.stringify({ kind: 'tekst', id: 'hero', lang: 'en', path: '/', velden: { en: { hero_title: 'Only in the preview' } } });
	const pv = await c.post('/admin/preview', { payload });
	assert.equal(pv.status, 200);
	const html = await pv.text();
	assert.ok(html.includes('Only in the preview') && html.includes('<base target="_blank">') && !/<script/.test(html));
	assert.match(pv.headers.get('content-security-policy'), /script-src 'none'/);
	assert.match(pv.headers.get('content-security-policy'), /frame-ancestors 'self'/);
	assert.equal(pv.headers.get('x-frame-options'), 'SAMEORIGIN');
	assert.notEqual(content.textValues('en').hero_title, 'Only in the preview');
	assert.ok(!(await (await fetch(`${base}/en/`)).text()).includes('Only in the preview'));
	// preview of a page being built
	const id = pages.create({ sjabloon: 'standaard', user: { id: adminId } });
	const pp = JSON.stringify({ kind: 'pagina', id, lang: 'en', velden: { en: { titel: 'Draft page', slug: 'draft-page', 's.s1.body': '<p>Hello <script>x</script></p>' } }, meta: { indeling: [{ id: 's1', type: 'tekst' }] } });
	const ph = await (await c.post('/admin/preview', { payload: pp })).text();
	assert.ok(ph.includes('Draft page') && ph.includes('<p>Hello </p>'));
	assert.equal((await fetch(`${base}/en/draft-page`)).status, 404);
	pages.remove(id, { id: adminId });
	// history page and one-click rollback
	const entry = content.history('tekst:contact').find((h) => h.reden !== 'rollback');
	const diff = await (await c.req(`/admin/historie/${entry.id}`)).text();
	assert.ok(diff.includes('terugzetten'));
	const back = await c.post(`/admin/historie/${entry.id}/terugzetten`, { basis: String(v()) });
	assert.equal(back.status, 303);
});

test('admin: re-authentication, password change rotates the session and ends others', async () => {
	const a = client('els@example.org'); await a.login();
	const b = client('els@example.org'); await b.login();
	assert.match((await a.post('/admin/account', { current: 'wrong', password: 'another long password' })).headers.get('location'), /foutwachtwoord/);
	const oldCookie = a.cookie;
	const r = await a.post('/admin/account', { current: PW, password: 'another long password' });
	assert.match(r.headers.get('location'), /wachtwoord/);
	const fresh = r.headers.get('set-cookie').split(';')[0];
	assert.notEqual(fresh, oldCookie, 'new session id after a critical action');
	assert.equal((await fetch(`${base}/admin/paginas`, { redirect: 'manual', headers: { cookie: oldCookie, 'user-agent': UA } })).status, 303, 'old id is dead');
	assert.equal((await fetch(`${base}/admin/paginas`, { redirect: 'manual', headers: { cookie: b.cookie, 'user-agent': UA } })).status, 303, 'other sessions are signed out');
	assert.equal((await fetch(`${base}/admin/paginas`, { redirect: 'manual', headers: { cookie: fresh, 'user-agent': UA } })).status, 200);
	users.setPassword(editorId, PW);
});

test('admin: two-step login over HTTP needs the code once, recovery code works once', async () => {
	const id = users.create({ email: 'two@example.org', naam: 'Two', rol: 'editor', wachtwoord: PW });
	const s = users.beginTwoFactor(id);
	const step = Math.floor(Date.now() / 30000);
	const codes = users.confirmTwoFactor(id, totp.codeAt(s.secret, step));
	const form = { 'content-type': 'application/x-www-form-urlencoded' };
	const first = await fetch(`${base}/admin/login`, { method: 'POST', redirect: 'manual', headers: { ...form, 'user-agent': UA }, body: new URLSearchParams({ email: 'two@example.org', password: PW }) });
	assert.equal(first.status, 200);
	assert.ok(!first.headers.get('set-cookie'), 'no session after the password alone');
	const ticket = /name="ticket" value="([a-f0-9]+)"/.exec(await first.text())[1];
	const code = (r) => fetch(`${base}/admin/login/code`, { method: 'POST', redirect: 'manual', headers: { ...form, 'user-agent': UA }, body: new URLSearchParams(r) });
	assert.equal((await code({ ticket, code: '123456' })).status, 401);
	const good = await code({ ticket, code: totp.codeAt(s.secret, step + 1) });
	assert.equal(good.status, 303);
	assert.ok(good.headers.get('set-cookie').includes('aethra_sid='));
	assert.equal((await code({ ticket, code: totp.codeAt(s.secret, step + 1) })).status, 401, 'a ticket is used once');
	const t2 = /name="ticket" value="([a-f0-9]+)"/.exec(await (await fetch(`${base}/admin/login`, { method: 'POST', redirect: 'manual', headers: { ...form, 'user-agent': UA }, body: new URLSearchParams({ email: 'two@example.org', password: PW }) })).text())[1];
	assert.equal((await code({ ticket: t2, code: codes[0] })).status, 303);
	users.disableTwoFactor(id);
});

test('admin: users page creates accounts after re-authentication and keeps one administrator', async () => {
	const a = client(); await a.login();
	let r = await a.post('/admin/gebruikers', { email: 'new@example.org', naam: 'New', rol: 'editor', wachtwoord: 'a very long password', huidig: 'wrong' });
	assert.match(r.headers.get('location'), /foutwachtwoord/);
	assert.equal(users.byEmail('new@example.org'), null);
	r = await a.post('/admin/gebruikers', { email: 'new@example.org', naam: 'New', rol: 'editor', wachtwoord: 'a very long password', huidig: PW });
	assert.equal(r.status, 303);
	a.cookie = r.headers.get('set-cookie').split(';')[0];
	assert.equal(users.byEmail('new@example.org').rol, 'editor');
	assert.throws(() => users.update(adminId, { rol: 'editor' }, adminId), /beheerder/, 'the last administrator cannot be demoted');
	users.update(users.byEmail('new@example.org').id, { actief: false }, adminId);
	assert.equal((await client('new@example.org', 'a very long password').login()).status, 401, 'deactivated users cannot log in');
});

test('admin: live alarms over SSE', async () => {
	const c = client(); await c.login();
	const res = await fetch(`${base}/admin/events`, { headers: { cookie: c.cookie, 'user-agent': UA } });
	assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
	const reader = res.body.getReader();
	let text = '';
	const until = Date.now() + 3000;
	while (Date.now() < until && !/event: mail/.test(text)) { const { value } = await reader.read(); text += Buffer.from(value).toString(); }
	assert.match(text, /event: berichten/);
	assert.match(text, /event: mail\ndata: \{"mislukt":0/);
	events.broadcast('mail', { mislukt: 2, totaal: {} });
	const more = await reader.read();
	assert.match(Buffer.from(more.value).toString(), /"mislukt":2/);
	await reader.cancel();
});

/* ---- edit locks over a raw WebSocket ---- */
function wsClient(cookie, ua = UA) {
	return new Promise((resolve, reject) => {
		const key = crypto.randomBytes(16).toString('base64');
		const sock = net.connect(server.address().port, '127.0.0.1');
		const c = { sock, msgs: [], buf: Buffer.alloc(0), open: false };
		c.waitFor = (fn, ms = 2000) => new Promise((res, rej) => { const t = Date.now(); const iv = setInterval(() => { const m = c.msgs.find(fn); if (m) { clearInterval(iv); res(m); } else if (Date.now() - t > ms) { clearInterval(iv); rej(new Error(`no message; got ${JSON.stringify(c.msgs)}`)); } }, 10); });
		c.send = (obj) => { const p = Buffer.from(JSON.stringify(obj)); const mask = crypto.randomBytes(4); const head = Buffer.from([0x81, 0x80 | p.length]); const body = Buffer.from(p.map((b, i) => b ^ mask[i & 3])); sock.write(Buffer.concat([head, mask, body])); };
		sock.on('data', (d) => {
			if (!c.open) {
				const s = d.toString();
				const i = s.indexOf('\r\n\r\n');
				if (i === -1) return;
				c.status = s.split(' ')[1];
				const expected = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
				if (c.status !== '101') return resolve(c);
				assert.ok(s.includes(`Sec-WebSocket-Accept: ${expected}`), 'handshake accept value');
				c.open = true;
				d = d.subarray(i + 4);
				resolve(c);
			}
			c.buf = Buffer.concat([c.buf, d]);
			while (c.buf.length >= 2) {
				let len = c.buf[1] & 0x7f; let off = 2;
				if (len === 126) { len = c.buf.readUInt16BE(2); off = 4; }
				if (c.buf.length < off + len) break;
				if ((c.buf[0] & 0x0f) === 1) c.msgs.push(JSON.parse(c.buf.subarray(off, off + len).toString()));
				c.buf = c.buf.subarray(off + len);
			}
		});
		sock.on('error', reject);
		sock.write(`GET /admin/ws HTTP/1.1\r\nHost: 127.0.0.1:${server.address().port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: http://127.0.0.1:${server.address().port}\r\nCookie: ${cookie}\r\nUser-Agent: ${ua}\r\n\r\n`);
	});
}

test('edit locks: exclusive per object, shown to the other editor, enforced when saving, released on disconnect', async () => {
	const pim = client(); await pim.login();
	const els = client('els@example.org'); await els.login();
	assert.equal((await wsClient('aethra_sid=bogus')).status, '401', 'no session, no socket');
	const a = await wsClient(pim.cookie);
	const b = await wsClient(els.cookie);
	assert.equal(a.status, '101');
	a.send({ t: 'lock', object: 'tekst:problem' });
	assert.equal((await a.waitFor((m) => m.t === 'lock')).ok, true);
	b.send({ t: 'lock', object: 'tekst:problem' });
	const denied = await b.waitFor((m) => m.t === 'lock');
	assert.equal(denied.ok, false);
	assert.equal(denied.door, 'Pim', 'the other editor sees who is editing');
	assert.equal((await b.waitFor((m) => m.t === 'locks' && m.locks['tekst:problem'] === 'Pim')).locks['tekst:problem'], 'Pim');
	const blocked = await els.json('/admin/publish', { kind: 'tekst', id: 'problem', velden: { en: { problem_title: 'Els writes' } }, baseVersie: content.objectVersion('tekst:problem') });
	assert.equal(blocked.status, 423, 'saving is refused server-side too');
	assert.match((await blocked.json()).melding, /Pim is deze pagina momenteel aan het bewerken/);
	assert.equal((await pim.json('/admin/publish', { kind: 'tekst', id: 'problem', velden: { en: { problem_title: 'Pim writes' } }, baseVersie: content.objectVersion('tekst:problem') })).status, 200);
	a.send({ t: 'hb', object: 'tekst:problem' });
	b.msgs.length = 0;
	a.sock.destroy();
	await b.waitFor((m) => m.t === 'locks' && !m.locks['tekst:problem']);
	b.send({ t: 'lock', object: 'tekst:problem' });
	assert.equal((await b.waitFor((m) => m.t === 'lock' && m.ok)).ok, true, 'free again after a disconnect');
	b.sock.destroy();
	// a lock expires without heartbeats
	const real = Date.now;
	ws.acquire('tekst:apps', { id: 99, naam: 'Ghost' });
	assert.equal(ws.heldByOther('tekst:apps', 1), 'Ghost');
	Date.now = () => real() + ws.LOCK_MS + 1000;
	assert.equal(ws.heldByOther('tekst:apps', 1), null, 'after 5 minutes without heartbeat the lock is gone');
	Date.now = real;
	const rd = client('rob@example.org'); await rd.login();
	const w = await wsClient(rd.cookie);
	w.send({ t: 'lock', object: 'tekst:apps' });
	assert.equal((await w.waitFor((m) => m.t === 'lock')).lezer, true, 'a reader never gets a lock');
	w.sock.destroy();
});

/* ---- survivability, compression, legacy, backup ---- */
test('responses use Brotli when the browser asks for it', async () => {
	const r = await fetch(`${base}/en/`, { headers: { 'accept-encoding': 'br' } });
	assert.equal(r.headers.get('content-encoding'), 'br');
	assert.ok((await r.text()).includes('<h1'));
	const css = await fetch(`${base}/css/site.css`, { headers: { 'accept-encoding': 'br, gzip' } });
	assert.equal(css.headers.get('content-encoding'), 'br');
	const g = await fetch(`${base}/en/`, { headers: { 'accept-encoding': 'gzip' } });
	assert.equal(g.headers.get('content-encoding'), 'gzip');
});

test('database down: public pages come from memory, /admin answers 503 and recovers', async () => {
	await fetch(`${base}/en/applications`);
	db.markDegraded();
	const page = await fetch(`${base}/en/applications`);
	assert.equal(page.status, 200, 'cached page keeps serving');
	const orig = db.ping;
	const c = client();
	const real = db.ping; db.ping = () => false;
	const adminRes = await fetch(`${base}/admin`, { redirect: 'manual' });
	db.ping = real;
	assert.equal(adminRes.status, 503);
	assert.match(await adminRes.text(), /database/i);
	assert.equal(db.ping(), true, 'the watchdog sees the database again');
	assert.equal(db.degraded(), false);
	assert.equal((await fetch(`${base}/admin`)).status, 200);
	assert.equal(orig, real);
	void c;
});

test('old JSON data is imported once (texts, privacy, messages, photos)', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aethra-legacy-'));
	fs.mkdirSync(path.join(dir, 'uploads'));
	fs.writeFileSync(path.join(dir, 'uploads', 'hero-abc.png'), png());
	fs.writeFileSync(path.join(dir, 'content.json'), JSON.stringify({ values: { nl: { hero_title: 'Oude kop' } }, privacy: { en: 'Old privacy' }, images: { hero: { file: 'hero-abc.png', alt: 'Old alt', w: 4, h: 3 } } }));
	fs.writeFileSync(path.join(dir, 'messages.json'), JSON.stringify([{ at: '2026-01-02T03:04:05.000Z', lang: 'nl', name: 'Oud', email: 'oud@example.org', role: 'Other', message: 'oud bericht', read: true }]));
	const cfg = require('../lib/config');
	const saved = cfg.DATA_DIR;
	db.reset(); cfg.DATA_DIR = dir;
	try {
		const { importLegacy } = require('../lib/cms/legacy');
		db.open();
		assert.deepEqual(importLegacy(), { fields: 1, messages: 1, photos: 1 });
		assert.equal(importLegacy().skipped, true, 'only once');
		assert.equal(content.readObject('tekst:hero').nl.hero_title, 'Oude kop');
		assert.equal(messages.list()[0].status, 'gelezen');
		assert.equal(media.slotImages('en').hero.alt, 'Old alt');
	} finally { db.reset(); cfg.DATA_DIR = saved; db.open(); }
});

test('backup: a consistent copy of the live database', () => {
	const target = path.join(os.tmpdir(), `aethra-bk-${Date.now()}.db`);
	db.backupTo(target);
	const { DatabaseSync } = require('node:sqlite');
	const copy = new DatabaseSync(target);
	assert.ok(copy.prepare('SELECT COUNT(*) AS n FROM gebruikers').get().n >= 3);
	copy.close();
});

test('messages: status "in behandeling", counts per status, bulk actions, assignee filter', () => {
	const mk = (name) => messages.add({ lang: 'en', name, email: `${name.toLowerCase()}@example.org`, role: 'Other', message: 'Hello there' });
	const a = mk('Bulka'); const b = mk('Bulkb'); const c = mk('Bulkc');
	assert.ok(messages.STATUSES.includes('in_behandeling'));
	assert.equal(messages.STATUS_LABELS.nieuw, 'Niet gelezen');
	assert.equal(messages.STATUS_LABELS.afgesloten, 'Afgerond');
	const user = { id: adminId };
	assert.equal(messages.bulk([a.id, b.id, 99999], 'status', 'in_behandeling', user), 2);
	assert.equal(messages.get(a.id).status, 'in_behandeling');
	assert.equal(messages.statusCounts({ q: 'Bulk' }).in_behandeling, 2);
	assert.equal(messages.statusCounts({ q: 'Bulk', status: 'nieuw' }).nieuw, 1, 'the status filter itself is ignored in the counts');
	messages.bulk([a.id], 'toewijzen', String(adminId), user);
	assert.deepEqual(messages.list({ q: 'Bulk', toegewezen: String(adminId) }).map((m) => m.id), [a.id]);
	assert.equal(messages.list({ q: 'Bulk', toegewezen: 'niemand' }).length, 2);
	assert.throws(() => messages.bulk([a.id], 'status', 'bestaatniet', user), (e) => e.status === 400);
	assert.equal(messages.bulk([a.id, b.id, c.id], 'verwijderen', '', user), 3);
	assert.equal(messages.count({ q: 'Bulk' }), 0);
});

test('account: sessions list, own name, sign out other devices', () => {
	const users = require('../lib/cms/users');
	const s = users.createSession(adminId, '203.0.113.5', 'ua-one');
	users.createSession(adminId, '203.0.113.5', 'ua-two');
	const list = users.sessionList(adminId, s.id);
	assert.ok(list.length >= 2 && list.filter((x) => x.huidig).length === 1);
	users.destroyOthers(adminId, s.id);
	assert.equal(users.sessionList(adminId, s.id).length, 1);
	users.setName(adminId, 'Nieuwe Naam');
	assert.equal(users.byId(adminId).naam, 'Nieuwe Naam');
	assert.throws(() => users.setName(adminId, '  '), (e) => e.status === 400);
});
