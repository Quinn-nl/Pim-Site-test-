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
	mk('pim@example.org', 'Pim Test', 'beheerder'); mk('els@example.org', 'Els Test', 'editor');
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
