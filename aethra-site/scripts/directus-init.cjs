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
// On Windows npm is a .cmd file and needs a shell.
const run = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm' }); if (r.status !== 0) { console.error(`${cmd} ${args.join(' ')} failed`); process.exit(r.status || 1); } };
if (!skipInstall) run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error']);
if (!skipBootstrap) run('node', [path.join('node_modules', 'directus', 'cli.js'), 'bootstrap']);
console.log('Next: "npm run directus" in one terminal, "npm run directus:setup" once Directus is running, and start the site with DIRECTUS_URL=http://127.0.0.1:8055.');
