#!/usr/bin/env node
'use strict';
/**
 * One-time preparation of the Directus trial (admin panel at /admin2):
 *   1. creates directus/.env with fresh random secrets (never overwrites an existing one),
 *   2. installs Directus into directus/ (kept apart: the site itself stays dependency-free),
 *   3. creates the database and the first administrator.
 * Then: `npm run directus` (start it), `npm run directus:setup` (build the content model). 
 *   npm run directus:init -- --email=you@yourdomain.com [--site=https://your-domain]
 *   (or the environment variables ADMIN_EMAIL and SITE_URL). Works on Windows, macOS and Linux.
 * Flags: --skip-install, --skip-bootstrap (used by the tests).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const dir = process.env.DIRECTUS_DIR ? path.resolve(process.env.DIRECTUS_DIR) : path.join(__dirname, '..', 'directus');
const envFile = path.join(dir, '.env');
const skipInstall = process.argv.includes('--skip-install');
const skipBootstrap = process.argv.includes('--skip-bootstrap');
const arg = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : ''; };
const site = (arg('site') || process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const email = arg('email') || process.env.ADMIN_EMAIL || 'admin@example.com';

fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
if (fs.existsSync(envFile)) {
	console.log('directus/.env exists: keeping it.');
} else {
	const password = crypto.randomBytes(12).toString('base64url');
	const lines = [
		'HOST=127.0.0.1', 'PORT=8055', `PUBLIC_URL=${site}/admin2`,
		`SECRET=${crypto.randomBytes(32).toString('hex')}`,
		'DB_CLIENT=sqlite3', 'DB_FILENAME=./data/directus.db',
		`ADMIN_EMAIL=${email}`, `ADMIN_PASSWORD=${password}`,
		'TELEMETRY=false', 'WEBSOCKETS_ENABLED=false', 'CORS_ENABLED=false',
		'STORAGE_LOCATIONS=local', 'STORAGE_LOCAL_ROOT=./data/uploads', 'EXTENSIONS_PATH=./extensions',
	];
	fs.writeFileSync(envFile, lines.join('\n') + '\n', { mode: 0o600 });
	console.log(`Created directus/.env. Administrator: ${email} / ${password}  (also stored in that file; change the password after the first login).`);
}
/**
 * Newer npm versions block the install scripts of packages ("allowScripts"). Directus needs the native parts
 * isolated-vm and sqlite3 (argon2 and esbuild ship ready-made binaries). Approve the scripts if npm supports it,
 * check that the parts load, and fetch the prebuilt binaries ourselves when they do not.
 */
function prepareNativeParts() {
	const loads = (mod) => spawnSync(process.execPath, ['-e', `require(${JSON.stringify(mod)})`], { cwd: dir, stdio: 'ignore' }).status === 0;
	const needed = ['isolated-vm', 'sqlite3', 'argon2'];
	if (needed.every(loads)) return;
	console.log('Preparing the native parts of Directus...');
	// 1. let npm run their install scripts (newer npm: "install-scripts approve"; older npm: rebuild)
	spawnSync('npm', ['install-scripts', 'approve', 'isolated-vm', 'sqlite3', 'argon2', 'esbuild'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
	spawnSync('npm', ['rebuild', 'isolated-vm', 'sqlite3', 'argon2'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
	if (needed.every(loads)) return;
	// 2. fetch the prebuilt binaries directly
	const bin = path.join(dir, 'node_modules', 'prebuild-install', 'bin.js');
	if (fs.existsSync(bin)) {
		for (const [mod, extra] of [['isolated-vm', []], ['sqlite3', ['-r', 'napi']]]) {
			if (loads(mod)) continue;
			console.log(`Fetching the prebuilt binary for ${mod}...`);
			spawnSync(process.execPath, [bin, ...extra], { cwd: path.join(dir, 'node_modules', mod), stdio: 'inherit' });
		}
	}
	const missing = needed.filter((m) => !loads(m));
	if (missing.length) {
		console.error(`\nThese Directus parts still do not load: ${missing.join(', ')}.\nCheck that "node -v" shows v22 and that this computer can download from github.com (a proxy or firewall can block it). As a last resort install the Visual Studio Build Tools ("Desktop development with C++") and Python, then run this command again.`);
		process.exit(1);
	}
}

// On Windows npm is a .cmd file and needs a shell.
const major = Number(process.versions.node.split('.')[0]);
if (major !== 22 && !skipInstall && !process.argv.includes('--force')) {
	console.error(`\nYou are on Node ${process.versions.node}. Directus needs Node 22 (LTS): it has native parts (isolated-vm, sqlite3, argon2) that are only prebuilt for Node 22, and newer npm versions also block their build steps.\n\n  1. Install Node 22 from https://nodejs.org (or with nvm-windows: nvm install 22, then nvm use 22)\n  2. Open a NEW terminal in aethra-site and check: node -v  (must show v22.x)\n  3. Remove a half-finished install if it exists (Windows: rmdir /s /q directus\\node_modules)\n  4. Run this command again.\n\n(Use --force to try anyway.)`);
	process.exit(1);
}
const run = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm' }); if (r.status !== 0) { console.error(`${cmd} ${args.join(' ')} failed`); process.exit(r.status || 1); } };
if (!skipInstall) {
	run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=warn']);
	prepareNativeParts();
}
if (!skipBootstrap) run('node', [path.join('node_modules', 'directus', 'cli.js'), 'bootstrap']);
console.log('Next: "npm run directus" in one terminal, "npm run directus:setup" once Directus is running, and start the site with DIRECTUS_URL=http://127.0.0.1:8055.');
