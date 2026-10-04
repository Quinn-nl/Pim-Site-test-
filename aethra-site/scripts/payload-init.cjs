#!/usr/bin/env node
'use strict';
/**
 * One-time preparation of the Payload CMS (admin at /admin2). Works on Windows, macOS and Linux.
 *   npm run cms:init -- --email=you@yourdomain.com [--site=https://your-domain]
 * 1. creates payload/.env with fresh random secrets (never overwrites an existing one),
 * 2. generates the editable fields from lib/fields.js,
 * 3. installs the CMS into payload/ (kept apart: the website itself stays dependency-free),
 * 4. generates the admin import map.
 * Then: `npm run cms` (terminal 1), `npm run cms:setup` (terminal 2, once), `npm run start:cms` (terminal 2).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const dir = process.env.PAYLOAD_DIR ? path.resolve(process.env.PAYLOAD_DIR) : path.join(__dirname, '..', 'payload');
const envFile = path.join(dir, '.env');
const arg = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : ''; };
const skipInstall = process.argv.includes('--skip-install');
const site = (arg('site') || process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const email = arg('email') || process.env.CMS_ADMIN_EMAIL || '';

const [major, minor] = process.versions.node.split('.').map(Number);
if (!skipInstall && (major < 20 || (major === 20 && minor < 9))) {
	console.error(`Node ${process.versions.node} is too old for the CMS (needs 20.9 or newer; Node 22 LTS is recommended). Install it from https://nodejs.org and run this again.`);
	process.exit(1);
}
if (!email && !fs.existsSync(envFile)) {
	console.error('Give the administrator e-mail address: npm run cms:init -- --email=you@yourdomain.com');
	process.exit(1);
}

fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
if (fs.existsSync(envFile)) {
	console.log('payload/.env exists: keeping it.');
} else {
	const password = crypto.randomBytes(12).toString('base64url') + 'aA1!';
	fs.writeFileSync(envFile, [
		`PAYLOAD_SECRET=${crypto.randomBytes(32).toString('hex')}`,
		'DATABASE_URL=file:./data/payload.db',
		`PAYLOAD_PUBLIC_SERVER_URL=${site}`,
		`CMS_ADMIN_EMAIL=${email}`,
		`CMS_ADMIN_PASSWORD=${password}`,
	].join('\n') + '\n', { mode: 0o600 });
	console.log(`Created payload/.env. Administrator: ${email} / ${password}  (also stored in that file; change the password after the first login).`);
}

// npm is a .cmd file on Windows and needs a shell there.
const run = (cmd, args, cwd) => { const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm' }); if (r.status !== 0) { console.error(`${cmd} ${args.join(' ')} failed`); process.exit(r.status || 1); } };
run(process.execPath, [path.join(__dirname, 'payload-fields.cjs')], process.cwd());
if (!skipInstall) {
	run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=warn'], dir);
	run('npm', ['run', 'importmap'], dir);
}
console.log('\nNext: "npm run cms" in one terminal; when it is up, "npm run cms:setup" once and then "npm run start:cms" in a second terminal.');
