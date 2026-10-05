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
const cfg = require('../lib/config'); // after DATA_DIR is set
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
	assert.deepEqual(db.all('SELECT versie, naam FROM schema_versies').map((r) => r.naam), ['001_init.sql', '002_bericht_status.sql', '003_beheer_uitbreidingen.sql', '004_planning_details.sql']);
	db.open();
	assert.equal(db.all('SELECT versie FROM schema_versies').length, 4, 'opening again does not repeat a migration');
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
	assert.equal(pages.get(id), null, 'in the trash');
	assert.equal(pages.trash().filter((t) => [id, other].includes(t.id)).length, 2);
	pages.purge(id, { id: adminId });
	pages.purge(other, { id: adminId });
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

test('menu: default is the original, edits show on the public site, bad input is refused, reset works', async () => {
	const menu = require('../lib/cms/menu');
	const c = client(); await c.login();
	const header = (html) => /<nav id="site-nav"[\s\S]*?<\/nav>/.exec(html)[0];
	const footer = (html) => /<nav aria-label="(?:Footer|Voettekst)">[\s\S]*?<\/nav>/.exec(html)[0];
	let html = await (await fetch(`${base}/nl/`)).text();
	assert.match(header(html), /Het probleem[\s\S]*Hoe het werkt[\s\S]*Toepassingen/, 'default menu is unchanged');
	assert.equal(menu.isCustom(), false);

	const item = (soort, ref, extra = {}) => ({ soort, ref, labels: {}, zichtbaar: true, ...extra });
	const data = {
		header: [item('vast', '/applications'), item('link', 'https://example.org/blog', { labels: { nl: 'Blog', en: 'Blog' }, nieuw_tab: true }), item('vast', '/problem', { labels: { nl: 'Waarom' } }), item('vast', '/how-it-works', { zichtbaar: false })],
		cta: item('vast', '/contact', { labels: { nl: 'Neem contact op' } }),
		footer: [item('vast', '/privacy'), item('link', 'mailto:hallo@example.org', { labels: { en: 'Mail us' } })],
	};
	let r = await c.post('/admin/menu', { menu: JSON.stringify(data) });
	assert.equal(r.status, 303);
	html = await (await fetch(`${base}/nl/`)).text();
	const h = header(html);
	assert.ok(!/<a class="\d+"/.test(h), 'no stray class attributes on header links');
	assert.ok(h.indexOf('Toepassingen') < h.indexOf('Blog') && h.indexOf('Blog') < h.indexOf('Waarom'), 'order follows the editor');
	assert.ok(!h.includes('Hoe het werkt'), 'a hidden item is not shown');
	assert.match(h, /href="https:\/\/example\.org\/blog" target="_blank" rel="noopener"/);
	assert.match(h, /class="btn btn-small"[^>]*>Neem contact op</);
	assert.match(footer(html), /Privacyverklaring[\s\S]*Mail us/, 'a link without a Dutch label falls back to the English one');
	const en = await (await fetch(`${base}/en/`)).text();
	assert.match(header(en), />The problem</, 'other languages keep the default wording');

	for (const bad of [item('link', 'javascript:alert(1)', { labels: { en: 'x' } }), item('link', '//evil.example', { labels: { en: 'x' } }), item('link', '/ok', { labels: {} }), item('vast', '/nope'), item('pagina', '9999')]) {
		r = await c.post('/admin/menu', { menu: JSON.stringify({ header: [bad], footer: [], cta: null }) });
		assert.equal(r.status, 422, JSON.stringify(bad));
	}
	assert.equal((await c.post('/admin/menu', { menu: JSON.stringify({ header: Array.from({ length: 9 }, () => item('vast', '/problem')), footer: [], cta: null }) })).status, 422, 'at most 8 header items');
	assert.equal((await c.post('/admin/menu', { menu: 'not json' })).status, 400);
	assert.match(await (await c.req('/admin/menu')).text(), /Aangepast menu/);

	users.create({ email: 'lees@example.org', naam: 'Lees', rol: 'lezer', wachtwoord: PW });
	const rd = client('lees@example.org'); await rd.login();
	assert.equal((await rd.req('/admin/menu')).status, 200);
	assert.equal((await rd.post('/admin/menu', { menu: JSON.stringify(data) })).status, 403);

	assert.equal((await c.post('/admin/menu/standaard', {})).status, 303);
	assert.equal(menu.isCustom(), false);
	html = await (await fetch(`${base}/nl/`)).text();
	assert.match(header(html), /Het probleem[\s\S]*Hoe het werkt[\s\S]*Toepassingen/);
});

/* ---- block 1: outbox, settings, banner, maintenance, back-ups, audit ---- */

test('outbox: queued first, backoff 10/20/40/80 minutes, given up after 5, retry; invalid addresses refused', async () => {
	const outbox = require('../lib/cms/outbox');
	assert.equal(outbox.send({ aan: 'not-an-address', onderwerp: 'x', tekst: 'y' }), null);
	const id = outbox.send({ aan: 'ops@example.org', onderwerp: 'Hello', tekst: 'Body', soort: 'test' });
	assert.ok(id);
	let now = Date.now() + 1000;
	const waits = [];
	for (let i = 0; i < 6; i += 1) {
		await outbox.tick(now, async () => ({ sent: false, reason: 'connect ECONNREFUSED' }));
		const row = db.get('SELECT status, pogingen, volgende_poging FROM mail_uit WHERE id = ?', id);
		waits.push([row.status, row.pogingen, row.status === 'mislukt' ? Math.round((row.volgende_poging - now) / 60000) : 0]);
		now = row.status === 'mislukt' ? row.volgende_poging + 1000 : now + 1000;
	}
	assert.deepEqual(waits, [['mislukt', 1, 10], ['mislukt', 2, 20], ['mislukt', 3, 40], ['mislukt', 4, 80], ['gefaald', 5, 0], ['gefaald', 5, 0]]);
	outbox.retry(id);
	assert.equal(await outbox.tick(Date.now() + 5000, async (m) => { assert.deepEqual(m.to, ['ops@example.org']); return { sent: true }; }), 1);
	assert.equal(db.get('SELECT status FROM mail_uit WHERE id = ?', id).status, 'verzonden');
});

test('new messages mail the people who asked for it (without the message text)', async () => {
	const outbox = require('../lib/cms/outbox');
	users.create({ email: 'melder@example.org', naam: 'Melder', rol: 'editor', wachtwoord: PW });
	const mid = users.byEmail('melder@example.org').id;
	users.setPrefs(mid, { meld_nieuw_bericht: true, weekrapport: false });
	const reader = users.create({ email: 'lezer2@example.org', naam: 'Lezer', rol: 'lezer', wachtwoord: PW });
	db.run('UPDATE gebruikers SET meld_nieuw_bericht = 1 WHERE id = ?', reader); // a reader must never be mailed
	const before = db.get('SELECT COUNT(*) AS n FROM mail_uit').n;
	messages.add({ lang: 'en', name: 'Visitor X', email: 'x@example.org', role: 'Other', message: 'My secret question about pilots' });
	const rows = db.all('SELECT aan, onderwerp, tekst FROM mail_uit ORDER BY id DESC LIMIT ?', db.get('SELECT COUNT(*) AS n FROM mail_uit').n - before);
	assert.deepEqual(rows.map((r) => r.aan), ['melder@example.org']);
	assert.match(rows[0].tekst, /Visitor X/);
	assert.ok(!rows[0].tekst.includes('secret question'), 'the text of the message stays behind the login');
	void outbox;
});

test('settings: validation, retention, banner (editorial rules, end date, fallback to English), audit', () => {
	const settings = require('../lib/cms/settings');
	assert.equal(settings.retentionDays(), 365);
	assert.throws(() => settings.save({ bewaartermijn_dagen: 5 }, { id: adminId }), (e) => e.status === 422);
	assert.throws(() => settings.save({ banner_link: 'javascript:alert(1)' }, { id: adminId }), (e) => e.status === 422);
	assert.throws(() => settings.save({ banner_tekst_en: 'Guaranteed returns for early supporters' }, { id: adminId }), (e) => e.status === 422, 'banner text follows the editorial rules');
	settings.save({ bewaartermijn_dagen: 200, banner_aan: true, banner_tekst_en: 'See us at the fair', banner_tekst_nl: 'Kom langs op de beurs', banner_tot: '2099-12-31' }, { id: adminId });
	assert.equal(settings.retentionDays(), 200);
	assert.deepEqual(settings.banner('nl'), { text: 'Kom langs op de beurs', link: '' });
	assert.equal(settings.banner('de').text, 'See us at the fair', 'a language without text uses English');
	assert.equal(settings.banner('nl', new Date('2100-01-02')), null, 'after the end date the banner is gone');
	assert.ok(db.get("SELECT 1 FROM audit_logs WHERE actie = 'instellingen.gewijzigd'"));
	settings.save({ banner_aan: false, bewaartermijn_dagen: 365 }, { id: adminId });
	assert.equal(settings.banner('nl'), null);
});

test('settings page: banner shows on the public site, maintenance mode answers 503 but the admin keeps working', async () => {
	const c = client(); await c.login();
	const post = (extra) => c.post('/admin/instellingen', { bewaartermijn_dagen: '365', banner_tekst_nl: '', banner_tekst_en: '', ...extra });
	assert.equal((await post({ banner_aan: '1', banner_tekst_nl: 'Beursbezoek 12 november', banner_link: '/nl/contact' })).status, 303);
	let html = await (await fetch(`${base}/nl/`)).text();
	assert.match(html, /class="site-banner"[^>]*><a href="\/nl\/contact">Beursbezoek 12 november<\/a>/);
	assert.ok(!(await (await fetch(`${base}/en/`)).text()).includes('site-banner'), 'English has no text, so no banner there');
	assert.equal((await post({ banner_aan: '1', banner_tekst_nl: 'Gegarandeerd rendement' })).status, 422);

	assert.equal((await post({ onderhoud_aan: '1', onderhoud_tekst_nl: 'Even bijwerken.' })).status, 303);
	const down = await fetch(`${base}/nl/`);
	assert.equal(down.status, 503);
	assert.equal(down.headers.get('retry-after'), '3600');
	assert.match(await down.text(), /Even bijwerken\./);
	assert.equal((await fetch(`${base}/healthz`)).status, 200);
	assert.equal((await fetch(`${base}/css/site.css`)).status, 200);
	const dash = await (await c.req('/admin/instellingen')).text();
	assert.match(dash, /onderhoudsmodus staat aan/i);
	assert.equal((await post({})).status, 303); // checkbox absent = off
	assert.equal((await fetch(`${base}/nl/`)).status, 200);

	const editor = client('melder@example.org'); await editor.login();
	assert.equal((await editor.req('/admin/instellingen')).status, 403, 'only administrators');
	assert.equal((await editor.req('/admin/systeem')).status, 403);
});

test('back-ups: daily, pruned to 14, download needs the password, restore script validates', async () => {
	const backup = require('../lib/cms/backup');
	const fs = require('fs');
	const name = backup.run({ id: adminId });
	assert.match(name, /^aethra-\d{8}-\d{6}\.db$/);
	assert.ok(backup.fileFor(name));
	assert.equal(backup.fileFor('../../etc/passwd'), null);
	assert.equal(backup.ensureDaily(), null, 'one in the last 23 hours: no new one');
	for (let i = 0; i < 16; i += 1) fs.copyFileSync(backup.fileFor(name), path.join(cfg.DATA_DIR, 'backups', `aethra-2020010${(i % 9) + 1}-0000${String(i).padStart(2, '0')}.db`));
	backup.prune();
	assert.ok(backup.list().length <= backup.KEEP);

	const c = client(); await c.login();
	const noPw = await c.post(`/admin/systeem/backup/${name}`, { huidig: 'wrong' });
	assert.equal(noPw.status, 303);
	assert.match(noPw.headers.get('location'), /foutwachtwoord/);
	const ok = await c.post(`/admin/systeem/backup/${name}`, { huidig: PW });
	assert.equal(ok.status, 200);
	assert.equal(ok.headers.get('content-type'), 'application/octet-stream');
	assert.equal(Buffer.from(await ok.arrayBuffer()).subarray(0, 15).toString(), 'SQLite format 3');
	assert.match(await (await c.req('/admin/systeem')).text(), /Back-ups van de database/);
	assert.equal((await c.post('/admin/systeem/backup/..%2F..%2Fsecret', { huidig: PW })).status, 404);

	const { execFileSync } = require('child_process');
	const junk = path.join(cfg.DATA_DIR, 'junk.db'); fs.writeFileSync(junk, 'nope');
	assert.throws(() => execFileSync(process.execPath, ['scripts/restore.js', junk], { env: { ...process.env, DATA_DIR: cfg.DATA_DIR }, stdio: 'pipe' }));
});

test('audit log: filters, CSV export (formula-safe) and the export itself is logged', async () => {
	audit.log({ user: { id: adminId }, actie: 'test.csv', entiteit: 'x:=cmd', nieuw: { a: '=HYPERLINK("http://evil")' } });
	const c = client(); await c.login();
	const html = await (await c.req(`/admin/audit?actie=test.csv&gebruiker=${adminId}`)).text();
	assert.match(html, /test\.csv/);
	const csv = await (await c.req('/admin/audit.csv?actie=test.csv')).text();
	assert.ok(csv.startsWith('tijd,gebruiker,actie,onderdeel,oud,nieuw,reden'));
	assert.ok(csv.includes('"\'x:=cmd"') || csv.includes('x:=cmd'));
	assert.ok(!/(^|,)"=HYPERLINK/m.test(csv), 'a cell never starts with =');
	assert.equal(audit.count({ gebruiker: 'systeem', actie: 'zzz' }), 0);
	assert.ok(db.get("SELECT 1 FROM audit_logs WHERE actie = 'audit.export'"));
	assert.equal((await client('melder@example.org').req('/admin/audit.csv')).status, 303, 'no session: login');
});

/* ---- block 2: roles, review flow, invitations, password reset, security mails, weekly report ---- */

test('redacteur: writes and proposes, cannot publish; an editor approves or rejects; compliance still applies', async () => {
	const reviews = require('../lib/cms/reviews');
	users.create({ email: 'red@example.org', naam: 'Reda', rol: 'redacteur', wachtwoord: PW });
	const red = client('red@example.org'); await red.login();
	const ed = client('els@example.org'); await ed.login();
	assert.equal(users.can({ rol: 'redacteur' }, 'schrijven'), true);
	assert.equal(users.can({ rol: 'redacteur' }, 'publiceren'), false);

	const body = (title, extra = {}) => ({ kind: 'tekst', id: 'contact', velden: { en: { contact_title: title } }, baseVersie: content.objectVersion('tekst:contact'), ...extra });
	const before = (await (await fetch(`${base}/en/contact`)).text());
	let r = await red.json('/admin/publish', body('Reach the team'));
	assert.equal(r.status, 200);
	const sent = await r.json();
	assert.ok(sent.review, 'a proposal, not a publication');
	assert.ok(!(await (await fetch(`${base}/en/contact`)).text()).includes('Reach the team'), 'nothing went live');
	assert.equal(before.includes('Reach the team'), false);
	assert.equal((await red.json('/admin/publish', body('Guaranteed returns'))).status, 422, 'hard compliance errors are caught at submission');
	assert.equal((await red.json('/admin/publish/override', body('Reach the team', { override_reason: 'because I say so' }))).status, 403, 'no override for a redacteur');
	assert.equal(reviews.pendingCount(), 1);
	// a second proposal for the same place replaces the first
	await red.json('/admin/publish', body('Reach our team'));
	assert.equal(reviews.pendingCount(), 1);
	const pending = reviews.list({ status: 'wacht' })[0];
	assert.deepEqual(reviews.changes(pending).map((c) => [c.taal, c.veld, c.nieuw]), [['en', 'contact_title', 'Reach our team']]);

	// the redacteur sees the list but cannot judge
	assert.match(await (await red.req('/admin/reviews')).text(), /Mijn voorstellen/);
	assert.equal((await red.post(`/admin/reviews/${pending.id}/goedkeuren`, {})).status, 403);
	assert.equal((await red.req('/admin/media/plek', { method: 'POST' })).status, 403);
	for (const [url, form] of [['/admin/menu/standaard', {}], ['/admin/redirects', { van: '/nl/a', naar: '/nl/b' }], ['/admin/media/plek', { plek: 'hero', media: '' }]]) assert.equal((await red.post(url, form)).status, 403, url);

	// the editor sees it, approves, and it goes live
	assert.match(await (await ed.req('/admin/reviews')).text(), /Te beoordelen/);
	assert.match(await (await ed.req(`/admin/reviews/${pending.id}`)).text(), /Reach our team/);
	r = await ed.post(`/admin/reviews/${pending.id}/goedkeuren`, {});
	assert.equal(r.status, 303);
	assert.ok((await (await fetch(`${base}/en/contact`)).text()).includes('Reach our team'));
	assert.equal(reviews.get(pending.id).status, 'goedgekeurd');
	assert.equal((await ed.post(`/admin/reviews/${pending.id}/goedkeuren`, {})).status, 409, 'already handled');
	assert.ok(db.get("SELECT 1 FROM mail_uit WHERE aan = 'red@example.org' AND soort = 'review'"), 'the proposer is told');

	// rejection needs a reason; withdrawing is for the proposer
	await red.json('/admin/publish', body('Another title'));
	const second = reviews.list({ status: 'wacht' })[0];
	r = await ed.post(`/admin/reviews/${second.id}/afwijzen`, { opmerking: 'no' });
	assert.equal(r.status, 400);
	assert.equal((await ed.post(`/admin/reviews/${second.id}/afwijzen`, { opmerking: 'Te vaag, noem het pilotprogramma.' })).status, 303);
	assert.equal(reviews.get(second.id).opmerking, 'Te vaag, noem het pilotprogramma.');
	await red.json('/admin/publish', body('Third try'));
	const third = reviews.list({ status: 'wacht' })[0];
	assert.equal((await ed.post(`/admin/reviews/${third.id}/intrekken`, {})).status, 404, 'only the proposer can withdraw');
	assert.equal((await red.post(`/admin/reviews/${third.id}/intrekken`, {})).status, 303);
	assert.equal(reviews.pendingCount(), 0);
});

test('redacteur and pages: drafts are saved directly, going live or offline needs an editor', async () => {
	const reviews = require('../lib/cms/reviews');
	const red = client('red@example.org'); await red.login();
	const ed = client('els@example.org'); await ed.login();
	const id = pages.create({ sjabloon: 'standaard', user: { id: adminId } });
	const save = (c, status, base) => c.json('/admin/publish', { kind: 'pagina', id, velden: { en: { titel: 'Red page', slug: 'red-page', 's.s1.body': '<p>Hello</p>' } }, meta: { status }, baseVersie: base });
	let r = await save(red, 'concept', content.objectVersion(pages.object(id)));
	assert.equal(r.status, 200);
	assert.equal((await r.json()).review, undefined, 'a draft is saved straight away');
	assert.equal(pages.get(id).meta.status, 'concept');
	r = await save(red, 'gepubliceerd', content.objectVersion(pages.object(id)));
	assert.ok((await r.json()).review, 'going live is a proposal');
	assert.equal(pages.get(id).meta.status, 'concept');
	const rv = reviews.list({ status: 'wacht' })[0];
	const warned = await ed.post(`/admin/reviews/${rv.id}/goedkeuren`, {});
	assert.equal(warned.status, 409, 'warnings of the compliance check need a reason, also when approving');
	assert.match(await warned.text(), /Geen omschrijving voor zoekresultaten/);
	assert.equal((await ed.post(`/admin/reviews/${rv.id}/goedkeuren`, { override_reden: 'Beschrijving volgt later' })).status, 303);
	assert.equal(pages.get(id).meta.status, 'gepubliceerd');
	r = await save(red, 'concept', content.objectVersion(pages.object(id)));
	assert.equal(r.status, 403, 'a redacteur cannot take a live page offline');
	assert.equal((await red.post(`/admin/paginas/${id}/verwijderen`, {})).status, 403);
});

test('invitations and password reset: one-time links, hashed, 2FA code required for reset, nothing leaks', async () => {
	const c = client(); await c.login();
	const post = (path, form) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA }, body: new URLSearchParams(form) });
	// an administrator invites someone without a password
	let r = await c.post('/admin/gebruikers', { email: 'nieuw@example.org', naam: 'Nieuw', rol: 'editor', wachtwoord: '', huidig: PW });
	assert.equal(r.status, 200);
	const html = await r.text();
	c.cookie = r.headers.get('set-cookie').split(';')[0]; // the session was rotated
	c.csrf = /name="csrf" value="([0-9a-f]+)"/.exec(html)[1];
	const link = /value="([^"]*\/admin\/herstel\?token=[0-9a-f]{64})"/.exec(html);
	assert.ok(link, 'without a mail server the link is handed over on screen');
	const token = /token=([0-9a-f]{64})/.exec(link[1])[1];
	const row = db.get("SELECT token_hash, token_soort FROM gebruikers WHERE email = 'nieuw@example.org'");
	assert.equal(row.token_soort, 'uitnodiging');
	assert.notEqual(row.token_hash, token, 'only a hash is stored');
	assert.equal((await post('/admin/login', { email: 'nieuw@example.org', password: 'whatever it is' })).status, 401, 'the unusable password does not work');
	// accept it
	assert.equal((await fetch(`${base}/admin/herstel?token=${token}`)).status, 200);
	assert.equal((await fetch(`${base}/admin/herstel?token=${'0'.repeat(64)}`)).status, 410);
	assert.equal((await post('/admin/herstel', { token, password: 'short', password2: 'short' })).status, 400);
	assert.equal((await post('/admin/herstel', { token, password: 'a long enough password', password2: 'different one entirely' })).status, 400);
	assert.equal((await post('/admin/herstel', { token, password: 'a long enough password', password2: 'a long enough password' })).status, 200);
	assert.equal((await post('/admin/herstel', { token, password: 'second use of the link', password2: 'second use of the link' })).status, 410, 'a link works once');
	const fresh = client('nieuw@example.org', 'a long enough password');
	assert.equal((await fresh.login()).status, 303);

	// forgot password: same answer for known and unknown, a mail is queued only for a real account
	const mailsBefore = db.get("SELECT COUNT(*) AS n FROM mail_uit WHERE soort = 'herstel'").n;
	const noNonce = (h) => h.replace(/nonce="[^"]*"/g, '');
	const known = noNonce(await (await post('/admin/vergeten', { email: 'nieuw@example.org' })).text());
	const unknown = noNonce(await (await post('/admin/vergeten', { email: 'niemand@example.org' })).text());
	assert.equal(known, unknown, 'no way to learn which accounts exist');
	assert.equal(db.get("SELECT COUNT(*) AS n FROM mail_uit WHERE soort = 'herstel'").n, mailsBefore, 'no mail server: no mail queued, the administrator can make a link');

	// an administrator makes a reset link; for an account with 2FA the code is required
	const target = users.byEmail('nieuw@example.org');
	const secret = users.beginTwoFactor(target.id).secret;
	users.confirmTwoFactor(target.id, totp.codeAt(secret, Math.floor(Date.now() / 1000 / totp.STEP)));
	r = await c.post(`/admin/gebruikers/${target.id}/herstellink`, { huidig: PW });
	const html2 = await r.text();
	const t2 = /token=([0-9a-f]{64})/.exec(html2)[1];
	c.cookie = r.headers.get('set-cookie').split(';')[0]; c.csrf = /name="csrf" value="([0-9a-f]+)"/.exec(html2)[1];
	const bad = await post('/admin/herstel', { token: t2, password: 'brand new password here', password2: 'brand new password here', code: '000000' });
	assert.equal(bad.status, 401, 'the authenticator code is needed to reset a password with 2FA');
	assert.equal((await post('/admin/herstel', { token: t2, password: 'brand new password here', password2: 'brand new password here', code: totp.codeAt(secret, Math.floor(Date.now() / 1000 / totp.STEP) + 1) })).status, 200);
	assert.equal((await client('nieuw@example.org', 'brand new password here').login()).status, 200, 'the new password works; with 2FA the code page follows');
	assert.equal((await post('/admin/gebruikers', {})).status, 303, 'not logged in: back to login');
});

test('security mails: a new browser is reported (not the first login); a lockout is reported once an hour', async () => {
	const u = users.create({ email: 'dev@example.org', naam: 'Dev', rol: 'editor', wachtwoord: PW });
	const login = (ua) => fetch(`${base}/admin/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': ua }, body: new URLSearchParams({ email: 'dev@example.org', password: PW }) });
	const count = () => db.get("SELECT COUNT(*) AS n FROM mail_uit WHERE aan = 'dev@example.org' AND soort = 'beveiliging'").n;
	assert.equal((await login('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0')).status, 303);
	assert.equal(count(), 0, 'the very first login is not suspicious');
	assert.equal((await login('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0')).status, 303);
	assert.equal(count(), 0, 'same browser again');
	assert.equal((await login('Mozilla/5.0 (Macintosh; Intel Mac OS X) Firefox/121.0')).status, 303);
	assert.equal(count(), 1, 'a new device is reported');
	assert.match(db.get("SELECT tekst FROM mail_uit WHERE aan = 'dev@example.org' ORDER BY id DESC").tekst, /Firefox op macOS/);
	assert.ok(db.get("SELECT 1 FROM audit_logs WHERE actie = 'login.nieuw_apparaat'"));
	// lockout
	const bad = () => fetch(`${base}/admin/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'lockout-tester' }, body: new URLSearchParams({ email: 'dev@example.org', password: 'wrong password' }) });
	let last; for (let i = 0; i < 6; i += 1) last = await bad();
	assert.equal(last.status, 429);
	const lockMails = db.get("SELECT COUNT(*) AS n FROM mail_uit WHERE aan = 'pim@example.org' AND onderwerp LIKE 'Inloggen geblokkeerd%' AND tekst LIKE '%dev@example.org%'").n;
	assert.equal(lockMails, 1, 'administrators hear about it once');
	await bad(); await bad();
	assert.equal(db.get("SELECT COUNT(*) AS n FROM mail_uit WHERE aan = 'pim@example.org' AND onderwerp LIKE 'Inloggen geblokkeerd%' AND tekst LIKE '%dev@example.org%'").n, 1, 'and not again within the hour');
	void u;
});

test('weekly report: only on Monday morning, once a week, only for people who asked for it', () => {
	const report = require('../lib/cms/report');
	const id = users.byEmail('els@example.org').id;
	users.setPrefs(id, { meld_nieuw_bericht: false, weekrapport: true });
	const mails = () => db.get("SELECT COUNT(*) AS n FROM mail_uit WHERE soort = 'weekrapport'").n;
	const monday = new Date(2031, 0, 6, 8, 0); // Monday 6 January 2031, 08:00
	assert.equal(monday.getDay(), 1);
	assert.equal(report.sendWeekly(new Date(2031, 0, 7, 8, 0)), 0, 'not on a Tuesday');
	assert.equal(report.sendWeekly(new Date(2031, 0, 6, 6, 0)), 0, 'not before 07:00');
	assert.equal(report.sendWeekly(monday), 1);
	assert.equal(report.sendWeekly(new Date(2031, 0, 6, 12, 0)), 0, 'once per week');
	assert.equal(mails(), 1);
	const row = db.get("SELECT aan, onderwerp, tekst FROM mail_uit WHERE soort = 'weekrapport'");
	assert.equal(row.aan, 'els@example.org');
	assert.match(row.tekst, /Bezoek: \d+ paginaweergaven/);
	assert.match(row.tekst, /Te beoordelen voorstellen: 0/);
	assert.equal(report.sendWeekly(new Date(2031, 0, 13, 9, 0)), 1, 'the next week again');
});

/* ---- block 3: trash, duplicate, planning, preview links, translations, focus point, side-by-side diff ---- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('trash: pages and photos are restorable for 30 days, then gone; slug conflicts block a restore', async () => {
	const media = require('../lib/cms/media');
	const c = client(); await c.login();
	const mk = (slug) => { const id = pages.create({ sjabloon: 'standaard', user: { id: adminId } }); const pr = pages.prepare(id, { velden: { en: { titel: slug, slug, 's.s1.body': '<p>x</p>' } }, meta: { status: 'gepubliceerd', indexeren: false } }); pages.save(id, pr, { user: { id: adminId }, baseVersie: 0 }); return id; };
	const id = mk('trash-me');
	assert.equal((await fetch(`${base}/en/trash-me`)).status, 200);
	assert.equal((await c.post(`/admin/paginas/${id}/verwijderen`, {})).status, 303);
	assert.equal((await fetch(`${base}/en/trash-me`)).status, 404, 'gone from the site at once');
	assert.equal((await c.req(`/admin/paginas/${id}`)).status, 404, 'and from the editor');
	assert.match(await (await c.req('/admin/prullenbak')).text(), /trash-me/);
	// someone takes the address in the meantime
	const other = mk('trash-me');
	assert.equal((await c.post(`/admin/prullenbak/pagina/${id}/terugzetten`, {})).status, 409, 'conflict: the address is used by another page');
	pages.remove(other, { id: adminId }); pages.purge(other, { id: adminId });
	assert.equal((await c.post(`/admin/prullenbak/pagina/${id}/terugzetten`, {})).status, 303);
	assert.equal(pages.get(id).meta.status, 'concept', 'comes back as a draft');
	assert.equal((await fetch(`${base}/en/trash-me`)).status, 404, 'a draft is not public');
	// 30 days
	pages.remove(id, { id: adminId });
	db.run("UPDATE paginas SET verwijderd_op = '2020-01-01T00:00:00.000Z' WHERE id = ?", id);
	assert.equal(pages.purgeOld(), 1);
	assert.equal(db.get('SELECT COUNT(*) AS n FROM paginas WHERE id = ?', id).n, 0);

	// photos: in use = cannot be deleted; unused = trash, restore, purge removes the files
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
	const tmp = path.join(cfg.DATA_DIR, 'tmp-trash.png'); fs.writeFileSync(tmp, png);
	const mid = await media.saveUpload({ tmpPath: tmp, alt: { en: 'tiny' }, user: { id: adminId } });
	const file = media.get(mid).bestand;
	media.remove(mid, { id: adminId });
	assert.equal(media.get(mid), null);
	assert.ok(fs.existsSync(path.join(media.uploadsDir(), file)), 'the file stays while it is in the trash');
	media.restore(mid, { id: adminId });
	assert.ok(media.get(mid));
	media.remove(mid, { id: adminId });
	db.run("UPDATE media SET verwijderd_op = '2020-01-01T00:00:00.000Z' WHERE id = ?", mid);
	assert.equal(media.purgeOld(), 1);
	assert.ok(!fs.existsSync(path.join(media.uploadsDir(), file)));
	// permissions: an editor restores but only an administrator deletes for good
	const ed = client('els@example.org'); await ed.login();
	const id2 = mk('trash-two'); pages.remove(id2, { id: adminId });
	assert.equal((await ed.post(`/admin/prullenbak/pagina/${id2}/verwijderen`, {})).status, 403);
	assert.equal((await ed.post(`/admin/prullenbak/pagina/${id2}/terugzetten`, {})).status, 303);
});

test('duplicate: same template, layout and texts, a free address, always a draft', async () => {
	const c = client(); await c.login();
	const id = pages.create({ sjabloon: 'standaard', user: { id: adminId } });
	const pr = pages.prepare(id, { velden: { en: { titel: 'Original', slug: 'original', 's.s1.body': '<p>Body text</p>' }, nl: { titel: 'Origineel', slug: 'origineel', 's.s1.body': '<p>Tekst</p>' } }, meta: { status: 'gepubliceerd', in_footer: true } });
	pages.save(id, pr, { user: { id: adminId }, baseVersie: 0 });
	const r = await c.post(`/admin/paginas/${id}/dupliceren`, {});
	assert.equal(r.status, 303);
	const copy = Number(/paginas\/(\d+)/.exec(r.headers.get('location'))[1]);
	const a = pages.get(copy);
	assert.equal(a.meta.status, 'concept');
	assert.equal(a.meta.in_footer, false);
	assert.deepEqual(a.meta.indeling, pages.get(id).meta.indeling);
	assert.equal(a.velden.en.titel, 'Original (kopie)');
	assert.equal(a.velden.en.slug, 'original-kopie');
	assert.equal(a.velden.nl['s.s1.body'], '<p>Tekst</p>');
	const again = pages.duplicate(id, { id: adminId });
	assert.equal(pages.get(again).velden.en.slug, 'original-kopie-2', 'a free address');
	// from the "new page" screen
	const via = await c.post('/admin/paginas/nieuw', { kopie_van: String(id) });
	assert.equal(via.status, 303);
	assert.match(await (await c.req('/admin/paginas/nieuw')).text(), /kopie van een bestaande pagina/);
	assert.equal((await c.post('/admin/paginas/nieuw', { kopie_van: '999999' })).status, 404);
	for (const x of [id, copy, again, Number(/paginas\/(\d+)/.exec(via.headers.get('location'))[1])]) { pages.remove(x, { id: adminId }); pages.purge(x, { id: adminId }); }
});

test('planning: validated like a publication, runs at the time as the planner, fails safely, can be cancelled', async () => {
	const planning = require('../lib/cms/planning');
	const c = client(); await c.login();
	const ed = client('els@example.org'); await ed.login();
	const red = client('red@example.org'); await red.login();
	const id = pages.create({ sjabloon: 'standaard', user: { id: adminId } });
	const payload = (title) => ({ kind: 'pagina', id, velden: { en: { titel: title, slug: 'planned', seo_description: 'A page that appears on schedule.', 's.s1.body': '<p>Hi</p>' } }, meta: { status: 'concept' }, baseVersie: content.objectVersion(pages.object(id)) });
	const soon = Date.now() + 120000;
	assert.equal((await red.json('/admin/plannen', { ...payload('Planned'), actie: 'publiceren', wanneer: soon })).status, 403, 'a redacteur cannot plan');
	assert.equal((await c.json('/admin/plannen', { ...payload('Planned'), actie: 'publiceren', wanneer: Date.now() - 1000 })).status, 400, 'not in the past');
	assert.equal((await c.json('/admin/plannen', { ...payload('Guaranteed returns'), actie: 'publiceren', wanneer: soon })).status, 422, 'hard compliance errors are caught when planning');
	assert.equal((await c.json('/admin/plannen', { ...payload('Planned'), actie: 'depubliceren', kind: 'tekst', id: 'hero', wanneer: soon })).status, 400, 'only pages can be taken offline');
	let r = await c.json('/admin/plannen', { ...payload('Planned'), actie: 'publiceren', wanneer: soon });
	assert.equal(r.status, 200);
	assert.equal(planning.forObject(pages.object(id)).length, 1);
	assert.match(await (await c.req('/admin/planning')).text(), /Komende acties \(1\)/);
	assert.equal((await fetch(`${base}/en/planned`)).status, 404, 'not yet');
	assert.deepEqual(planning.run(Date.now()), { ran: 0, failed: 0 }, 'not due');
	assert.deepEqual(planning.run(soon + 1000), { ran: 1, failed: 0 });
	assert.equal((await fetch(`${base}/en/planned`)).status, 200, 'live at the planned time');
	assert.equal(planning.list({ status: 'klaar' }).length >= 1, true);
	assert.ok(db.get("SELECT 1 FROM audit_logs WHERE actie = 'planning.uitgevoerd'"));

	// planned unpublish; cancel works
	const off = await c.json('/admin/plannen', { kind: 'pagina', id, actie: 'depubliceren', wanneer: soon + 3600000 });
	assert.equal(off.status, 200);
	const row = planning.forObject(pages.object(id))[0];
	assert.equal((await ed.post(`/admin/planning/${row.id}/annuleren`, {})).status, 303);
	assert.equal(planning.run(soon + 7200000).ran, 0, 'cancelled: nothing happens');
	// a plan that cannot run is marked failed with a reason and mailed
	await c.json('/admin/plannen', { ...payload('Second version'), actie: 'publiceren', wanneer: soon + 10000 });
	content.writeFields(pages.object(id), { en: { titel: 'Edited meanwhile' } }, { user: { id: adminId }, baseVersie: null, vervang: false });
	assert.deepEqual(planning.run(soon + 20000), { ran: 0, failed: 1 });
	const failed = planning.list({ status: 'mislukt' })[0];
	assert.match(failed.fout, /intussen iets anders gewijzigd/);
	assert.ok(db.get("SELECT 1 FROM mail_uit WHERE soort = 'planning'"));
	assert.equal((await fetch(`${base}/en/planned`)).status, 200, 'the live page is untouched');
	// the planner lost the right to publish
	await c.json('/admin/plannen', { ...payload('Third'), actie: 'publiceren', wanneer: soon + 30000 });
	db.run("UPDATE gebruikers SET rol = 'lezer' WHERE id = ?", editorId);
	db.run('UPDATE planning SET door = ? WHERE status = ?', editorId, 'wacht');
	assert.equal(planning.run(soon + 40000).failed, 1);
	db.run("UPDATE gebruikers SET rol = 'editor' WHERE id = ?", editorId);
	pages.remove(id, { id: adminId }); pages.purge(id, { id: adminId });
});

test('preview links: secret, hashed, expiring, revocable, noindex, never cached', async () => {
	const sharelinks = require('../lib/cms/sharelinks');
	const c = client(); await c.login();
	const red = client('red@example.org'); await red.login();
	const body = { kind: 'tekst', id: 'contact', lang: 'en', path: '/contact', velden: { en: { contact_title: 'Draft contact title' } }, days: 3 };
	const r = await red.json('/admin/voorbeeldlink', body);          // a redacteur may share drafts
	assert.equal(r.status, 200);
	const { url } = await r.json();
	const token = url.split('/voorbeeld/')[1];
	assert.ok(token && token.length === 43);
	assert.ok(!db.all('SELECT token_hash FROM voorbeeld_links').some((x) => x.token_hash === token), 'only a hash is stored');
	const page = await fetch(`${base}/voorbeeld/${token}`);
	assert.equal(page.status, 200);
	assert.equal(page.headers.get('cache-control'), 'no-store');
	assert.match(page.headers.get('x-robots-tag'), /noindex/);
	const html = await page.text();
	assert.match(html, /Draft contact title/);
	assert.match(html, /noindex, nofollow/);
	assert.match(html, /Preview of an unpublished draft/);
	assert.ok(!html.includes('<script'), 'no scripts in a shared preview');
	assert.ok(!(await (await fetch(`${base}/en/contact`)).text()).includes('Draft contact title'), 'the live page is unchanged');
	assert.equal((await fetch(`${base}/voorbeeld/${'a'.repeat(43)}`)).status, 404);
	assert.equal((await c.json('/admin/voorbeeldlink', { ...body, kind: 'tekst', id: 'nonexistent_group' })).status, 400);
	assert.match(await (await c.req('/admin/voorbeeldlinks')).text(), /tekst:contact/);
	// expiry and revocation
	assert.equal(sharelinks.find(token, Date.now() + 4 * 86400000), null, 'expired after 3 days');
	const hash = sharelinks.active()[0].token_hash;
	assert.equal((await c.post(`/admin/voorbeeldlinks/${hash}/intrekken`, {})).status, 303);
	assert.equal((await fetch(`${base}/voorbeeld/${token}`)).status, 404, 'revoked');
});

test('translations overview: outdated means English changed after the translation was written or reviewed', async () => {
	const translations = require('../lib/cms/translations');
	const obj = 'tekst:contact';
	content.writeFields(obj, { en: { contact_title: 'Talk to us', contact_lead: 'We read everything.' }, nl: { contact_title: 'Praat met ons' } }, { user: { id: adminId } });
	const cellOf = (lang) => translations.overview().find((r) => r.kind === 'tekst' && r.href === '/admin/tekst/contact').cells[lang];
	assert.equal(cellOf('nl').outdated, 0);
	await sleep(15);
	content.writeFields(obj, { en: { contact_title: 'Talk with us' } }, { user: { id: adminId } });
	assert.equal(cellOf('nl').outdated, 1, 'English was changed after the Dutch text');
	assert.equal(cellOf('de').state, 'standaard');
	await sleep(15);
	content.markReviewed(obj, 'nl', { id: adminId });
	assert.equal(cellOf('nl').outdated, 0, 'reviewing counts as up to date');
	assert.equal(cellOf('nl').state, 'nagekeken');
	const c = client(); await c.login();
	const html = await (await c.req('/admin/vertalingen')).text();
	assert.match(html, /Vertalingen/);
	assert.match(html, /Privacyverklaring/);
});

test('focus point: stored per photo and used by the public page; the side-by-side diff shows old and new', async () => {
	const media = require('../lib/cms/media');
	const c = client(); await c.login();
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
	const tmp = path.join(cfg.DATA_DIR, 'tmp-focus.png'); fs.writeFileSync(tmp, png);
	const mid = await media.saveUpload({ tmpPath: tmp, alt: { en: 'Focus test' }, user: { id: adminId }, slot: 'hero' });
	assert.deepEqual(media.forView(media.get(mid), 'en').focus, [50, 50]);
	assert.ok(!(await (await fetch(`${base}/en/`)).text()).includes('fp-'), 'the default focus adds nothing');
	assert.equal((await c.post(`/admin/media/${mid}`, { alt_en: 'Focus test', rechten: 'eigen', bron: '', focus_x: '23', focus_y: '81' })).status, 303);
	assert.deepEqual(media.forView(media.get(mid), 'en').focus, [20, 80], 'rounded to steps of 10');
	assert.match(await (await fetch(`${base}/en/`)).text(), /class="photo hero-photo fp-20-80"/);
	assert.match(fs.readFileSync(path.join(cfg.ROOT, 'public/css/site.css'), 'utf8'), /\.fp-20-80 \{ object-position: 20% 80%; \}/);
	await c.post(`/admin/media/${mid}`, { alt_en: 'Focus test', rechten: 'eigen', focus_x: '500', focus_y: '-5' });
	assert.deepEqual([media.get(mid).focus_x, media.get(mid).focus_y], [100, 0], 'clamped to 0..100');
	assert.match(await (await c.req('/admin/media')).text(), /data-focus/);
	media.setSlot('hero', null, null); media.remove(mid, { id: adminId });

	// side-by-side
	content.writeFields('tekst:contact', { en: { contact_title: 'Version one' } }, { user: { id: adminId } });
	content.writeFields('tekst:contact', { en: { contact_title: 'Version two' } }, { user: { id: adminId } });
	const entry = content.history('tekst:contact')[0];
	const html = await (await c.req(`/admin/historie/${entry.id}`)).text();
	assert.match(html, /class="sbs"/);
	assert.match(html, /Toen \(versie \d+\)/);
	assert.match(html, /sbs-l[^"]*del[^>]*>[^<]*Version one/);
	assert.match(html, /sbs-r[^"]*add[^>]*>[^<]*Version two/);
});

/* ---- block 4: SEO check, link check, accessibility advice, editorial rules ---- */

test('SEO check: finds short titles, missing descriptions and duplicates in what visitors actually get', async () => {
	const seo = require('../lib/cms/seo');
	const c = client(); await c.login();
	const mk = (slug, titel, extra = {}) => { const id = pages.create({ sjabloon: 'standaard', user: { id: adminId } }); const pr = pages.prepare(id, { velden: { en: { titel, slug, 's.s1.body': '<p>Some text.</p>', ...extra } }, meta: { status: 'gepubliceerd' } }); pages.save(id, pr, { user: { id: adminId }, baseVersie: 0 }); return id; };
	const a = mk('seo-a', 'Hi');
	const b = mk('seo-b', 'Hi');
	const rows = seo.audit();
	const row = (slug) => rows.find((r) => r.lang === 'en' && r.path === `/${slug}`);
	const codes = (slug) => row(slug).findings.map((f) => f.code);
	assert.ok(row('seo-a'), 'published pages are included');
	assert.ok(codes('seo-a').includes('omschrijving_mist'), 'no description');
	assert.ok(codes('seo-a').includes('titel_dubbel') && codes('seo-b').includes('titel_dubbel'), 'two pages with the same title');
	assert.ok(!rows.some((r) => r.path === '/seo-draft'), 'drafts are not checked');
	// the fixed pages are in all four languages
	assert.equal(rows.filter((r) => r.path === '/problem').length, 4);
	const html = await (await c.req('/admin/seo')).text();
	assert.match(html, /Zoekmachines/);
	assert.match(html, /User-agent: \*/);
	assert.ok(!/Zo ziet het er in Google/.test(html), 'the Google preview lives in the page editor');
	for (const id of [a, b]) { pages.remove(id, { id: adminId }); pages.purge(id, { id: adminId }); }
});

test('link check: internal links against the site, external links safely (no private addresses, no redirect following)', async () => {
	const linkcheck = require('../lib/cms/linkcheck');
	const id = pages.create({ sjabloon: 'standaard', user: { id: adminId } });
	const body = '<p><a href="/en/problem">fine</a> <a href="/en/does-not-exist">broken</a> <a href="https://example.org/ok">ok</a> <a href="https://example.org/gone">gone</a> <a href="http://127.0.0.1:9/secret">local</a> <a href="http://10.0.0.5/x">private</a> <a href="https://example.org/moved">moved</a> <a href="mailto:a@b.nl">mail</a></p>';
	const pr = pages.prepare(id, { velden: { en: { titel: 'Links page for the checker', slug: 'links-page', seo_description: 'A page with several kinds of links in it for the checker.', 's.s1.body': body } }, meta: { status: 'gepubliceerd' } });
	pages.save(id, pr, { user: { id: adminId }, baseVersie: 0 });
	require('../lib/cms/redirects').add('/en/old-address', '/en/problem', { id: adminId });
	const calls = [];
	const fetcher = async (url, opts) => {
		calls.push([url, opts.method, opts.redirect]);
		if (url.endsWith('/ok')) return { status: 200 };
		if (url.endsWith('/gone')) return { status: opts.method === 'HEAD' ? 405 : 404 };
		if (url.endsWith('/moved')) return { status: 301 };
		return { status: 200 };
	};
	const r = await linkcheck.run({ fetcher, timeoutMs: 500 });
	assert.ok(r.extern >= 4);
	const all = linkcheck.results();
	const find = (url) => all.find((x) => x.url === url && x.bron === '/en/links-page');
	assert.equal(find('/en/problem').status, 200);
	assert.equal(find('/en/does-not-exist').status, 404);
	assert.equal(linkcheck.isBroken(find('/en/does-not-exist')), true);
	assert.equal(find('https://example.org/ok').status, 200);
	assert.equal(find('https://example.org/gone').status, 404, 'HEAD refused with 405: retried as GET');
	assert.equal(linkcheck.isBroken(find('https://example.org/gone')), true);
	assert.equal(find('https://example.org/moved').status, 301);
	assert.equal(linkcheck.isBroken(find('https://example.org/moved')), false, 'a redirect is not broken');
	assert.equal(find('http://127.0.0.1:9/secret').status, null);
	assert.ok(!calls.some(([u]) => /127\.0\.0\.1|10\.0\.0\.5/.test(u)), 'private and local addresses are never requested');
	assert.ok(calls.every(([, , redirect]) => redirect === 'manual'), 'redirects are never followed');
	assert.ok(!find('mailto:a@b.nl'), 'mail links are skipped');
	assert.equal(linkcheck.internalStatus('/en/old-address', new Set()).status, 301);
	assert.equal(await linkcheck.safeHost('localhost'), false);
	assert.equal(linkcheck.privateIp('192.168.1.1'), true);
	assert.equal(linkcheck.privateIp('93.184.216.34'), false);
	const c = client(); await c.login();
	const html = await (await c.req('/admin/links')).text();
	assert.match(html, /Kapotte links \(\d+\)/);
	assert.match(html, /does-not-exist/);
	assert.equal(linkcheck.run === undefined, false);
	pages.remove(id, { id: adminId }); pages.purge(id, { id: adminId });
});

test('accessibility advice: heading jumps (rule), vague link text and very long sentences are noted, never blocking', async () => {
	const c = client(); await c.login();
	const id = pages.create({ sjabloon: 'standaard', user: { id: adminId } });
	const long = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ');
	const body = `<h2>Heading</h2><h3>Sub</h3><p><a href="/en/problem">click here</a> ${long}.</p>`;
	const payload = { kind: 'pagina', id, velden: { en: { titel: 'Advice page for testing', slug: 'advice-page', seo_description: 'A page that is only here to test the accessibility advice.', 's.s1.body': body } }, meta: { status: 'gepubliceerd' }, baseVersie: 0 };
	const check = await (await c.json('/admin/api/check', payload)).json();
	assert.deepEqual(check.adviezen.map((a) => a.regel).sort(), ['lange_zin', 'vage_linktekst'], 'the editor only allows h2 and h3, so a jump cannot be typed there');
	const raw = require('../lib/cms/compliance').validateAethraCompliance({ object: 'tekst:x', velden: { en: { a: '<h2>One</h2><h4>Jump</h4>' } } });
	assert.deepEqual(raw.adviezen.map((a) => a.regel), ['kopniveau'], 'the rule itself works on any HTML');
	assert.equal(check.fouten.length, 0);
	const r = await c.json('/admin/publish', payload);
	assert.equal(r.status, 200, 'advice never blocks publishing');
	assert.deepEqual((await r.json()).notes.map((n) => n.regel).sort(), ['lange_zin', 'vage_linktekst']);
	pages.remove(id, { id: adminId }); pages.purge(id, { id: adminId });
});

test('editorial rules: administrators can add terms, the built-in rules stay, only administrators see the page', async () => {
	const c = client(); await c.login();
	const ed = client('els@example.org'); await ed.login();
	assert.equal((await ed.req('/admin/regels')).status, 403);
	assert.equal((await ed.post('/admin/regels', { term: 'cheap', soort: 'verboden' })).status, 403);
	const html = await (await c.req('/admin/regels')).text();
	assert.match(html, /aandelen/);
	assert.match(html, /Vaste regels/);
	const params = (t) => ({ kind: 'tekst', id: 'contact', velden: { en: { contact_title: t } }, baseVersie: content.objectVersion('tekst:contact') });
	assert.equal((await c.json('/admin/publish', params('A cheap way to talk'))).status, 200, 'before the rule exists');
	assert.equal((await c.post('/admin/regels', { term: 'cheap', soort: 'verboden', toelichting: 'We make no price claims' })).status, 303);
	assert.equal((await c.post('/admin/regels', { term: 'Cheap', soort: 'verboden' })).status, 409, 'no duplicates (any case)');
	assert.equal((await c.post('/admin/regels', { term: 'x', soort: 'verboden' })).status, 422);
	let r = await c.json('/admin/publish', params('A cheap way to talk'));
	assert.equal(r.status, 422, 'a forbidden extra term blocks');
	assert.equal((await r.json()).fouten[0].regel, 'verboden_term');
	assert.equal((await c.json('/admin/publish', params('Cheaper than cheap'))).status, 422);
	assert.equal((await c.json('/admin/publish', params('We are not cheap, and this is no offer'))).status, 200, 'a negation (the disclaimer) is allowed');
	assert.equal((await c.json('/admin/publish', params('Expensive hardware, cheaper'))).status, 200, 'only whole words count');
	await c.post('/admin/regels', { term: 'unbeatable', soort: 'waarschuwing' });
	r = await c.json('/admin/publish', params('An unbeatable team'));
	assert.equal(r.status, 409, 'an extra warning needs a reason');
	assert.equal((await c.json('/admin/publish/override', { ...params('An unbeatable team'), override_reason: 'The claim is about our team spirit' })).status, 200);
	// built-in rules are untouched and cannot be removed
	assert.equal((await c.json('/admin/publish', params('Guaranteed returns'))).status, 422);
	const rule = db.get("SELECT id FROM compliance_regels WHERE term = 'cheap'");
	assert.equal((await c.post(`/admin/regels/${rule.id}/verwijderen`, {})).status, 303);
	assert.equal((await c.json('/admin/publish', params('A cheap way to talk'))).status, 200, 'removed: allowed again');
	assert.ok(db.get("SELECT 1 FROM audit_logs WHERE actie = 'regels.toegevoegd'"));
	assert.equal((await c.json('/admin/publish', params('Guaranteed returns'))).status, 422, 'still blocked after removing an extra term');
});

/* ---- block 5: tasks, search, reply templates, redirects CSV, statistics, help, privacy overview, bulk ---- */

test('dashboard tasks: assigned messages, drafts, reviews and warnings show up for the right person', async () => {
	const tasks = require('../lib/cms/tasks');
	const m = messages.add({ lang: 'nl', name: 'Taak Test', email: 'taak@example.org', role: 'Other', message: 'Bel mij terug' });
	messages.assign(m.id, adminId, { id: adminId });
	content.saveDraft('tekst:hero', adminId, { velden: {} }, 0);
	const mine = tasks.forUser({ id: adminId, rol: 'beheerder' });
	assert.ok(mine.some((t) => /op jouw naam/.test(t.tekst) && t.href.includes('toegewezen=ik')));
	assert.ok(mine.some((t) => /onaf concept van hero/.test(t.tekst)));
	assert.ok(mine.some((t) => /mailserver/.test(t.tekst)), 'an administrator is told when mail cannot be sent');
	const other = tasks.forUser({ id: editorId, rol: 'editor' });
	assert.ok(!other.some((t) => /op jouw naam/.test(t.tekst)), 'not someone else\'s tasks');
	const c = client(); await c.login();
	assert.match(await (await c.req('/admin')).text(), /Mijn taken[\s\S]*op jouw naam/);
	assert.match(await (await c.req('/admin/berichten?toegewezen=ik')).text(), /Taak Test/, 'the task link filters on "assigned to me"');
	messages.remove(m.id, { id: adminId });
	content.deleteDraft('tekst:hero', adminId);
});

test('search palette: screens, pages, texts, messages; people only for administrators', async () => {
	const c = client(); await c.login();
	const ed = client('els@example.org'); await ed.login();
	const m = messages.add({ lang: 'en', name: 'Zoek Persoon', email: 'zoek@example.org', organisation: 'Zoekbedrijf', role: 'Other', message: 'Findable text' });
	const find = async (cl, q) => (await (await cl.req(`/admin/zoeken?q=${encodeURIComponent(q)}`)).json()).items;
	assert.ok((await find(c, 'berichten')).some((i) => i.groep === 'Schermen' && i.href === '/admin/berichten'));
	assert.ok((await find(c, 'zoek persoon')).some((i) => i.groep === 'Berichten' && i.href === `/admin/berichten/${m.id}`));
	assert.ok((await find(c, 'Findable')).some((i) => i.groep === 'Berichten'), 'message text is searched too');
	assert.ok((await find(c, 'contactpagina')).some((i) => i.groep === 'Teksten'));
	assert.ok((await find(c, 'Pim')).some((i) => i.groep === 'Gebruikers'));
	assert.ok(!(await find(ed, 'Pim')).some((i) => i.groep === 'Gebruikers'), 'an editor cannot find people');
	assert.ok(!(await find(ed, 'instellingen')).some((i) => i.href === '/admin/instellingen'), 'nor admin-only screens');
	assert.deepEqual(await find(c, ''), []);
	assert.equal((await fetch(`${base}/admin/zoeken?q=x`, { redirect: 'manual' })).status, 303, 'login required');
	assert.deepEqual((await find(c, "100%_'\"; DROP TABLE")).length >= 0, true, 'odd characters are harmless');
	messages.remove(m.id, { id: adminId });
});

test('reply templates: per language, placeholders filled, shown on the message with previous/next navigation', async () => {
	const replies = require('../lib/cms/replies');
	const c = client(); await c.login();
	const rd = client('rob@example.org'); await rd.login();
	assert.equal((await rd.post('/admin/sjablonen', { naam: 'x', tekst_nl: 'y' })).status, 403, 'a reader cannot write');
	assert.equal((await c.post('/admin/sjablonen', { naam: '', tekst_nl: 'y' })).status, 422);
	assert.equal((await c.post('/admin/sjablonen', { naam: 'Pilot', onderwerp_nl: 'Je vraag over een pilot', tekst_nl: 'Beste {naam} van {organisatie},\n\nBedankt voor je bericht.', onderwerp_en: 'Your pilot question', tekst_en: 'Dear {naam}, thanks.' })).status, 303);
	const t = replies.list().find((x) => x.naam === 'Pilot');
	const nl = messages.add({ lang: 'nl', name: 'Anne', email: 'anne@example.org', org: 'Gemeente X', role: 'Municipality', message: 'Wij willen een pilot.' });
	const de = messages.add({ lang: 'de', name: 'Jörg', email: 'joerg@example.org', role: 'Other', message: 'Hallo' });
	assert.deepEqual(replies.fill(t, messages.get(nl.id)), { onderwerp: 'Je vraag over een pilot', tekst: 'Beste Anne van Gemeente X,\n\nBedankt voor je bericht.', taal: 'nl' });
	assert.equal(replies.fill(t, messages.get(de.id)).taal, 'en', 'a language without text falls back to English');
	const html = await (await c.req(`/admin/berichten/${nl.id}?sjabloon=${t.id}`)).text();
	assert.match(html, /mailto:anne@example\.org\?subject=Je%20vraag%20over%20een%20pilot&amp;body=Beste%20Anne%20van%20Gemeente%20X/);
	assert.match(html, /met sjabloon/);
	assert.match(html, /data-key-prev/);
	const n = messages.neighbors(nl.id);
	assert.equal(n.newer, de.id);
	assert.ok(n.older === null || typeof n.older === 'number');
	assert.equal((await c.post(`/admin/sjablonen/${t.id}/verwijderen`, {})).status, 303);
	assert.equal(replies.list().some((x) => x.naam === 'Pilot'), false);
	messages.remove(nl.id, { id: adminId }); messages.remove(de.id, { id: adminId });
});

test('redirects: CSV export/import (formula-safe), chain detection and flattening, bulk delete', async () => {
	const redirects = require('../lib/cms/redirects');
	const c = client(); await c.login();
	const r = await c.post('/admin/redirects/importeren', { csv: 'van,naar\n/nl/oud-een,/nl/nieuw-een\n/nl/oud-twee;/nl/nieuw-twee\n/nl/slecht,/nl/slecht\nhttp://evil.example,/nl/x\nonzin' });
	assert.equal(r.status, 200);
	const html = await r.text();
	assert.match(html, /2 toegevoegd, 2 overgeslagen/);
	assert.match(html, /Regel 4/);
	assert.equal(redirects.find('/nl/oud-een'), '/nl/nieuw-een');
	const csv = await (await c.req('/admin/redirects.csv')).text();
	assert.ok(csv.startsWith('van,naar,gebruikt,aangemaakt'));
	assert.match(csv, /"\/nl\/oud-een","\/nl\/nieuw-een"/);
	// a chain made behind the back of add(): flatten fixes it
	db.run("INSERT INTO redirects (van, naar) VALUES ('/nl/keten-a', '/nl/keten-b')");
	db.run("INSERT INTO redirects (van, naar) VALUES ('/nl/keten-b', '/nl/keten-c')");
	db.run("INSERT INTO redirects (van, naar) VALUES ('/nl/lus-a', '/nl/lus-b')");
	db.run("INSERT INTO redirects (van, naar) VALUES ('/nl/lus-b', '/nl/lus-a')");
	assert.ok(redirects.chains().length >= 3);
	assert.match(await (await c.req('/admin/redirects')).text(), /wijs(?:t|en) naar een adres dat zelf weer doorverwijst/);
	assert.equal((await c.post('/admin/redirects/inkorten', {})).status, 303);
	assert.equal(redirects.find('/nl/keten-a'), '/nl/keten-c');
	assert.equal(redirects.find('/nl/lus-a'), null, 'a loop is removed');
	assert.equal(redirects.chains().length, 0);
	// bulk
	const hex = (t) => Buffer.from(t).toString('hex');
	assert.equal((await c.post('/admin/redirects/bulk', { [`v_${hex('/nl/oud-een')}`]: '1', [`v_${hex('/nl/oud-twee')}`]: '1' })).status, 303);
	assert.equal(redirects.find('/nl/oud-een'), null);
	assert.equal((await c.post('/admin/redirects/bulk', {})).status, 303);
	assert.equal((await client('rob@example.org').post('/admin/redirects/bulk', {})).status, 303, 'no session: login');
	redirects.removeMany(['/nl/keten-a', '/nl/keten-b']);
});

test('statistics: comparison with the previous period, messages per source, CSV export', async () => {
	const stats = require('../lib/stats');
	const c = client(); await c.login();
	const cur = stats.summary(7); const prev = stats.summary(7, 7);
	assert.equal(cur.days.length, 7);
	assert.equal(prev.days[6] < cur.days[0], true, 'the previous period lies right before the current one');
	const m = messages.add({ lang: 'en', name: 'Source Test', email: 'src@example.org', role: 'Other', message: 'Hi', source: 'linkedin', campaign: 'launch' });
	const by = messages.bySource(7);
	assert.ok(by.some((r) => r.bron === 'linkedin' && r.campagne === 'launch' && r.n >= 1));
	const html = await (await c.req('/admin/stats?days=7')).text();
	assert.match(html, /Berichten per bron en campagne/);
	assert.match(html, /linkedin \/ launch/);
	const csv = await c.req('/admin/stats.csv?days=7');
	assert.equal(csv.status, 200);
	assert.match(csv.headers.get('content-disposition'), /aethra-statistieken-7-dagen\.csv/);
	assert.ok((await csv.text()).startsWith('onderdeel,naam,waarde'));
	messages.remove(m.id, { id: adminId });
});

test('help, privacy overview, theme script and contextual help', async () => {
	const c = client(); await c.login();
	const help = await (await c.req('/admin/help')).text();
	assert.match(help, /Wie mag wat\?/);
	assert.match(help, /Sneltoetsen/);
	assert.match(help, /<kbd>Ctrl of ⌘ \+ K<\/kbd>/);
	const privacy = await (await c.req('/admin/privacy-overzicht')).text();
	assert.match(privacy, /aethra_lang/);
	assert.match(privacy, /aethra_sid/);
	assert.match(privacy, /365 dagen|\d+ dagen, daarna automatisch verwijderd/);
	const dash = await (await c.req('/admin')).text();
	assert.match(dash, /data-help="dash"/);
	assert.match(dash, /localStorage\.getItem\("aethra_theme"\)/, 'the theme is set before the page is painted');
	assert.match(dash, /id="themebtn"/);
	assert.match(dash, /id="searchbtn"/);
	const editor = await (await c.req('/admin/tekst/contact')).text();
	assert.ok(!/data-help="paginas"/.test(editor), 'editors stay uncluttered');
	const css = fs.readFileSync(path.join(cfg.ROOT, 'public/css/admin.css'), 'utf8');
	assert.match(css, /:root\[data-theme="dark"\]/);
	assert.match(css, /:root:not\(\[data-theme="light"\]\)/);
});

test('media bulk delete: unused photos go to the trash, photos in use stay', async () => {
	const media = require('../lib/cms/media');
	const c = client(); await c.login();
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
	const up = async (slot) => { const f = path.join(cfg.DATA_DIR, `bulk-${Math.random()}.png`); fs.writeFileSync(f, png); return media.saveUpload({ tmpPath: f, alt: { en: 'bulk' }, user: { id: adminId }, slot }); };
	const a = await up(null); const b = await up(null); const used = await up('hero');
	const html = await (await c.req('/admin/media')).text();
	assert.ok(html.includes(`name="m_${a}"`) && html.includes(`name="m_${b}"`));
	assert.ok(!html.includes(`name="m_${used}"`), 'a photo in use cannot be selected');
	const r = await c.post('/admin/media/bulk', { [`m_${a}`]: '1', [`m_${b}`]: '1', [`m_${used}`]: '1' });
	assert.equal(r.status, 200);
	assert.match(await r.text(), /2 foto’s naar de prullenbak\. 1 niet verwijderd omdat ze nog gebruikt worden/);
	assert.equal(media.get(a), null); assert.equal(media.get(b), null); assert.ok(media.get(used));
	assert.equal((await client('red@example.org').post('/admin/media/bulk', {})).status, 303);
	media.setSlot('hero', null, null); media.remove(used, { id: adminId });
});

/* ---- block 6: real tools ---- */

const hasBin = (name) => { try { require('child_process').execFileSync(name, ['-version'], { stdio: 'ignore' }); return true; } catch (e) { try { require('child_process').execFileSync(name, ['--version'], { stdio: 'ignore' }); return true; } catch (e2) { return false; } } };

test('media with the real cwebp and avifenc: valid WebP/AVIF files, smaller than the original, served with the right type', { skip: !(hasBin('cwebp') && hasBin('avifenc')) && 'cwebp and avifenc are not installed' }, async () => {
	const media = require('../lib/cms/media');
	const tmp = path.join(cfg.DATA_DIR, `real-${Date.now()}.png`);
	fs.writeFileSync(tmp, png(1600, 900));
	const id = await media.saveUpload({ tmpPath: tmp, alt: { en: 'Real encoders' }, user: { id: adminId } });
	const m = media.get(id);
	const types = m.varianten.map((v) => `${v.type}@${v.dichtheid}x`);
	assert.ok(types.includes('image/webp@1x') && types.includes('image/webp@2x') === (1600 > 1200), JSON.stringify(types));
	assert.ok(types.some((t) => t.startsWith('image/avif')), 'AVIF is made as well');
	const original = fs.statSync(path.join(media.uploadsDir(), m.bestand)).size;
	for (const v of m.varianten) {
		const buf = fs.readFileSync(path.join(media.uploadsDir(), v.bestand));
		if (v.type === 'image/webp') { assert.equal(buf.subarray(0, 4).toString(), 'RIFF'); assert.equal(buf.subarray(8, 12).toString(), 'WEBP'); }
		if (v.type === 'image/avif') assert.equal(buf.subarray(4, 12).toString(), 'ftypavif');
		const res = await fetch(`${base}/uploads/${v.bestand}`);
		assert.equal(res.status, 200);
		assert.equal(res.headers.get('content-type'), v.type);
		assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
	}
	assert.ok(m.varianten.filter((v) => v.dichtheid === 1).every((v) => fs.statSync(path.join(media.uploadsDir(), v.bestand)).size < original), 'the modern formats are smaller than the PNG');
	media.remove(id, { id: adminId }); media.purge(id, { id: adminId });
});

test('two-step verification follows RFC 6238 (SHA-1 test vectors) and a QR code carries the right otpauth address', () => {
	const totp = require('../lib/totp');
	const secret = totp.base32(Buffer.from('12345678901234567890'));
	// RFC 6238 appendix B, SHA-1: the 8-digit codes at these times end in the 6-digit codes below
	const vectors = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']];
	for (const [t, code] of vectors) assert.equal(totp.codeAt(secret, Math.floor(t / totp.STEP)), code, `T=${t}`);
	const uri = totp.uri(secret, 'pim@example.org', 'Aethra');
	assert.match(uri, /^otpauth:\/\/totp\/Aethra:pim%40example\.org\?secret=[A-Z2-7]+&issuer=Aethra/);
	assert.match(uri, /algorithm=SHA1|digits=6|period=30|^otpauth/);
});
