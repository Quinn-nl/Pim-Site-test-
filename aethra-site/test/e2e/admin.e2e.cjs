'use strict';
/**
 * Browser tests of the admin with a real Chromium (Playwright). Not part of `npm test` (which needs no browser).
 *   npm run test:e2e
 * Needs the `playwright` package (or PLAYWRIGHT_PATH) and a Chromium (PLAYWRIGHT_BROWSERS_PATH or CHROMIUM_PATH). For the QR check it also
 * uses python3 with OpenCV (cv2); that part is skipped when it is missing. Starts its own server on a free port with a temporary data folder.
 */
const { spawn, spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const assert = require('assert/strict');

const ROOT = path.resolve(__dirname, '../..');
const PW = 'correct horse battery';

function load(mod) {
	for (const p of [process.env.PLAYWRIGHT_PATH, mod, '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { return require(p); } catch (e) { /* try next */ } }
	return null;
}
const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const chromiumPath = () => process.env.CHROMIUM_PATH || [path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium')].find((p) => fs.existsSync(p));
const hasCv2 = () => spawnSync('python3', ['-c', 'import cv2'], { stdio: 'ignore' }).status === 0;

(async () => {
	const playwright = load('playwright');
	if (!playwright) { console.log('SKIP: the playwright package is not available (set PLAYWRIGHT_PATH).'); return; }
	const data = fs.mkdtempSync(path.join(os.tmpdir(), 'aethra-e2e-'));
	const port = await freePort();
	const env = { ...process.env, DATA_DIR: data, PORT: String(port), HOST: '127.0.0.1' };
	const mk = (email, naam, rol) => execFileSync(process.execPath, ['scripts/user.js', 'create', `--email=${email}`, `--naam=${naam}`, `--rol=${rol}`], { cwd: ROOT, env: { ...env, ADMIN_PASSWORD: PW }, stdio: 'pipe' });
	mk('pim@example.org', 'Pim Test', 'beheerder'); mk('els@example.org', 'Els Test', 'editor'); mk('rik@example.org', 'Rik Redacteur', 'redacteur');
	const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'pipe' });
	let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
	const base = `http://127.0.0.1:${port}`;
	for (let i = 0; i < 50; i += 1) { try { if ((await fetch(`${base}/healthz`)).ok) break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
	const browser = await playwright.chromium.launch({ executablePath: chromiumPath() });
	const errors = [];
	const watch = (page, who) => { page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); }); };
	const ok = (name) => console.log(`ok - ${name}`);
	const login = async (page, email, code) => {
		await page.goto(`${base}/admin`);
		await page.fill('#em', email); await page.fill('#pw', PW); await page.click('button[type=submit]');
		if (code) { await page.fill('#code', code); await page.click('button[type=submit]'); }
		await page.waitForURL(`${base}/admin`);
	};
	let failed = false;
	try {
		/* ---- 1. two-step verification with a real QR code ---- */
		const a = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); watch(a, 'A');
		await login(a, 'pim@example.org');
		await a.goto(`${base}/admin/account`);
		await a.fill('#sp', PW); await a.click('form[action="/admin/2fa/start"] button');
		await a.waitForSelector('.qr-wrap svg');
		if (hasCv2()) {
			const png = path.join(data, 'qr.png');
			await a.locator('.qr-wrap').screenshot({ path: png });
			const decoded = execFileSync('python3', ['-c', `import cv2,sys\nimg=cv2.imread(sys.argv[1]);img=cv2.copyMakeBorder(img,40,40,40,40,cv2.BORDER_CONSTANT,value=(255,255,255));d=cv2.QRCodeDetector();v,_,_=d.detectAndDecode(img);print(v)`, png]).toString().trim();
			assert.match(decoded, /^otpauth:\/\/totp\/Aethra:pim%40example\.org\?secret=[A-Z2-7]+/, 'the QR code decodes to an otpauth address');
			const secret = /secret=([A-Z2-7]+)/.exec(decoded)[1];
			const totp = require(path.join(ROOT, 'lib/totp'));
			await a.fill('#c2', totp.codeAt(secret, Math.floor(Date.now() / 1000 / totp.STEP)));
			await a.click('form[action="/admin/2fa/confirm"] button');
			await a.waitForSelector('.codes');
			ok('the QR code decodes and the code made from it is accepted');
			await a.click('main form button[type=submit]').catch(() => {});
			// sign out and in again with a code
			await a.goto(`${base}/admin`);
			await a.click('form[action="/admin/logout"] button');
			await login(a, 'pim@example.org', totp.codeAt(secret, Math.floor(Date.now() / 1000 / totp.STEP) + 1));
			ok('signing in with the second step works');
		} else console.log('SKIP - QR decoding (python3 with cv2 not available)');

		/* ---- 2. edit locks with two real browsers ---- */
		const b = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); watch(b, 'B');
		await login(b, 'els@example.org');
		await a.goto(`${base}/admin/tekst/hero`);
		await a.waitForFunction(() => document.querySelector('#editor'));
		await new Promise((r) => setTimeout(r, 800));
		await b.goto(`${base}/admin/tekst/hero`);
		await b.waitForSelector('#lockbanner:not([hidden])', { timeout: 5000 });
		assert.match(await b.textContent('#lockbanner'), /Pim Test/);
		assert.equal(await b.isDisabled('#btn-save'), true, 'the second editor cannot save');
		const forced = await b.evaluate(async () => { const r = await fetch('/admin/publish', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': document.body.dataset.csrf }, body: JSON.stringify({ kind: 'tekst', id: 'hero', velden: { en: { hero_title: 'Sneaky' } }, baseVersie: 0 }) }); return r.status; });
		assert.equal(forced, 423, 'the server enforces the lock, not only the page');
		ok('the second editor sees who is editing and cannot save (also not around the page)');
		await a.goto(`${base}/admin`);                       // A leaves: the lock is released
		await new Promise((r) => setTimeout(r, 1200));
		await b.reload();
		await b.waitForSelector('#editor');
		await new Promise((r) => setTimeout(r, 600));
		assert.equal(await b.isDisabled('#btn-save'), false, 'after A leaves, B can edit');
		ok('the lock is released when the first editor leaves');

		/* ---- 3. publish, palette, theme, shortcuts, menu editor ---- */
		await b.goto(`${base}/admin`);                       // B now holds the lock after the reload: let it go
		await new Promise((r) => setTimeout(r, 1200));
		await a.goto(`${base}/admin/tekst/hero`);
		await a.waitForSelector('#editor');
		await a.click('[data-lang-tab="en"]');
		const field = a.locator('input[data-lang="en"][data-key="hero_title"]');
		await field.fill('Cleaner air, where traffic is heaviest');
		await a.click('#btn-save');
		await a.waitForSelector('#savestate[data-state="saved"]');
		assert.match(await (await fetch(`${base}/en/`)).text(), /Cleaner air, where traffic is heaviest/);
		ok('publishing from the editor changes the public page');
		await a.goto(`${base}/admin`);
		await a.keyboard.press('Control+k');
		await a.keyboard.type('hero');
		await a.waitForSelector('.palette [role=option]');
		await a.keyboard.press('Enter');
		await a.waitForURL(/\/admin\/tekst\/hero/);
		ok('Ctrl+K finds a text and opens it');
		await a.goto(`${base}/admin`);
		await a.click('#themebtn'); await a.click('#themebtn');
		assert.equal(await a.evaluate(() => document.documentElement.dataset.theme), 'dark');
		await a.reload();
		assert.equal(await a.evaluate(() => document.documentElement.dataset.theme), 'dark', 'the theme survives a reload');
		ok('the theme can be chosen and is remembered');
		await a.goto(`${base}/admin/menu`);
		await a.selectOption('[data-list=header] [data-add-select]', 'link:');
		await a.click('[data-list=header] [data-add]');
		await a.fill('input[id^="u-"]', 'https://example.org/blog');
		await a.fill('input[id$="-en"]', 'Blog');
		await a.click('[data-list=header] li:last-child [data-up]');
		await a.click('#menusave');
		await a.waitForURL(/menu\?f=opgeslagen/);
		const home = await (await fetch(`${base}/en/`)).text();
		assert.ok(/<a href="https:\/\/example\.org\/blog"[^>]*>Blog<\/a>/.test(home), 'menu: ' + (/<nav id="site-nav"[\s\S]*?<\/nav>/.exec(home) || [''])[0].slice(0, 400));
		ok('the menu editor adds a link, moves it and shows it on the site');
		await a.goto(`${base}/admin/berichten`);
		assert.equal(await a.locator('.msglist').count(), 0, 'no messages yet: empty state');
		ok('the empty state of the inbox');

		/* ---- 4. invitation: an administrator makes a link, the new person chooses a password and gets in ---- */
		await a.goto(`${base}/admin/gebruikers`);
		await a.click('details.adduser summary');
		await a.fill('#ue', 'nieuw@example.org'); await a.fill('#un', 'Nieuw Persoon');
		await a.selectOption('#ur', 'lezer');
		await a.fill('#uh', PW);
		await a.click('details.adduser button[type=submit]');
		const inviteLink = await a.inputValue('input[aria-label="Link"]');
		assert.match(inviteLink, /\/admin\/herstel\?token=[0-9a-f]{64}/);
		const n = await (await browser.newContext()).newPage(); watch(n, 'N');
		await n.goto(inviteLink.replace(/^https?:\/\/[^/]+/, base));
		await n.fill('#rp', 'Welkom123'); await n.fill('#rp2', 'Welkom123'); await n.click('form[action="/admin/herstel"] button[type=submit]');
		assert.match(await n.textContent('body'), /veelgebruikt|wachtwoord/i, 'an easy password is refused with a reason');
		await n.fill('#rp', 'vlinders-paardenbloem-kachel'); await n.fill('#rp2', 'vlinders-paardenbloem-kachel');
		await n.click('form[action="/admin/herstel"] button[type=submit]');
		await n.goto(`${base}/admin`);
		await n.fill('#em', 'nieuw@example.org'); await n.fill('#pw', 'vlinders-paardenbloem-kachel'); await n.click('button[type=submit]');
		await n.waitForURL(`${base}/admin`);
		assert.equal(await n.locator('a[href="/admin/gebruikers"]').count(), 0, 'a reader sees no user management');
		ok('an invitation link lets a new person choose a password (an easy one is refused) and sign in');

		/* ---- 5. review flow: an editor-in-training proposes, the administrator approves and the site changes ---- */
		const r = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); watch(r, 'R');
		await login(r, 'rik@example.org');
		await r.goto(`${base}/admin/tekst/hero`);
		await r.waitForSelector('#editor');
		await r.click('[data-lang-tab="en"]');
		await r.locator('input[data-lang="en"][data-key="hero_title"]').fill('Calmer roads, one trip at a time');
		await r.click('#btn-save');
		await r.waitForSelector('#savestate[data-state="saved"], #savestate[data-state="review"]', { timeout: 8000 }).catch(() => {});
		assert.doesNotMatch(await (await fetch(`${base}/en/`)).text(), /Calmer roads, one trip at a time/, 'a proposal is not live');
		await a.goto(`${base}/admin/reviews`);
		const pending = await a.locator('.msglist a.msg-main').count();
		assert.ok(pending >= 1, 'the proposal waits for judgement');
		await a.click('.msglist a.msg-main');
		await a.click('form[action$="/goedkeuren"] button[type=submit]');
		await a.waitForURL(/reviews\?f=goedgekeurd/);
		assert.match(await (await fetch(`${base}/en/`)).text(), /Calmer roads, one trip at a time/);
		ok('a proposal from a redacteur stays hidden until it is approved, then goes live');

		/* ---- 6. password reset by an administrator's link ---- */
		await a.goto(`${base}/admin/gebruikers`);
		const card = a.locator('article.ucard', { hasText: 'els@example.org' });
		await card.locator('summary').click();
		await card.locator('form[action$="/herstellink"] input[name=huidig]').fill(PW);
		await card.locator('form[action$="/herstellink"] button').click();
		const resetLink = await a.inputValue('input[aria-label="Link"]');
		const e1 = await (await browser.newContext()).newPage(); watch(e1, 'E1');
		await e1.goto(resetLink.replace(/^https?:\/\/[^/]+/, base));
		await e1.fill('#rp', PW); await e1.fill('#rp2', PW);
		await e1.click('form[action="/admin/herstel"] button[type=submit]');
		assert.equal((await fetch(resetLink.replace(/^https?:\/\/[^/]+/, base))).status >= 200, true);
		await e1.goto(resetLink.replace(/^https?:\/\/[^/]+/, base));
		assert.match(await e1.textContent('body'), /werkt niet meer/, 'a reset link works once');
		ok('a reset link chooses a new password and works only once');

		/* ---- 7. passkey with a virtual authenticator (Chrome DevTools): add, sign out, sign in ---- */
		const local = `http://localhost:${port}`;
		const pkCtx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
		const pk = await pkCtx.newPage(); watch(pk, 'PK');
		const cdp = await pkCtx.newCDPSession(pk);
		await cdp.send('WebAuthn.enable');
		await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
		await pk.goto(`${local}/admin`);
		await pk.fill('#em', 'els@example.org'); await pk.fill('#pw', PW); await pk.click('button[type=submit]');
		await pk.waitForURL(`${local}/admin`);
		await pk.goto(`${local}/admin/account`);
		await pk.fill('[data-passkey-add] [name=huidig]', PW); await pk.fill('[data-passkey-add] [name=naam]', 'Virtuele sleutel');
		await pk.click('[data-passkey-add] button');
		await pk.waitForFunction(() => /Virtuele sleutel/.test(document.body.textContent), null, { timeout: 8000 });
		await pk.goto(`${local}/admin`);
		await pk.click('form[action="/admin/logout"] button');
		await pk.fill('#em', 'els@example.org'); await pk.fill('#pw', PW); await pk.click('button[type=submit]');
		await pk.waitForSelector('#pk-go');
		await pk.click('#pk-go');
		await pk.waitForURL(`${local}/admin`, { timeout: 8000 });
		ok('a passkey can be added and used as the second step (Chromium virtual authenticator)');

		/* ---- 8. accessibility (axe-core) on the main admin screens ---- */
		const axeFile = [process.env.AXE_PATH, path.join(ROOT, 'node_modules/axe-core/axe.min.js'), '/tmp/axetest/node_modules/axe-core/axe.min.js'].filter(Boolean).find((f) => fs.existsSync(f));
		if (axeFile) {
			const axeSrc = fs.readFileSync(axeFile, 'utf8');
			const bad = [];
			for (const url of ['/admin', '/admin/paginas', '/admin/tekst/hero', '/admin/media', '/admin/berichten', '/admin/gebruikers', '/admin/account', '/admin/instellingen', '/admin/systeem', '/admin/beveiligingsrapport', '/admin/menu', '/admin/seo', '/admin/audit']) {
				await a.goto(`${base}${url}`);
				await a.evaluate(axeSrc);
				for (const theme of ['dark', 'light']) {                  // contrast has to hold in both themes
					await a.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
					await a.waitForTimeout(400);                               // let the colour transitions finish
					const res = await a.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] }));
					assert.ok(res.passes.length > 15, 'axe really ran');
					for (const v of res.violations) bad.push(`${url} (${theme}): ${v.id} (${v.impact}) ${v.nodes.slice(0, 2).map((x) => x.target.join(' ')).join(' | ')}`);
				}
			}
			assert.deepEqual(bad, [], 'accessibility violations:\n' + bad.join('\n'));
			ok('axe-core finds no WCAG A/AA violations on the main admin screens');
		} else console.log('SKIP - axe-core not found (set AXE_PATH or npm i --no-save axe-core)');
	} catch (e) {
		failed = true;
		console.log(`not ok - ${e.message}`);
		console.log(String(e.stack || '').split('\n').slice(1, 4).join('\n'));
	} finally {
		await browser.close();
		server.kill('SIGTERM');
		fs.rmSync(data, { recursive: true, force: true });
	}
	const real = errors.filter((e) => !/Failed to load resource|favicon/.test(e));
	if (real.length) { failed = true; console.log(`not ok - browser errors:\n${real.join('\n')}`); } else console.log('ok - no JavaScript errors in the browser');
	if (failed) { console.log(log.split('\n').slice(-8).join('\n')); process.exit(1); }
})();
