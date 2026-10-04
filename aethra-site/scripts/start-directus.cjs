#!/usr/bin/env node
'use strict';
/**
 * Starts the website with /admin2 pointing at Directus, the same on Windows, macOS and Linux (no shell-specific
 * environment syntax needed).
 *   npm run start:directus         website + /admin2
 *   npm run start:directus:live    ...and the website reads its texts from Directus (CONTENT_SOURCE=directus)
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const envFile = path.join(__dirname, '..', 'directus', '.env');
const cfg = Object.fromEntries(fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]) : []);
if (!cfg.PORT) { console.error('directus/.env not found. Run "npm run directus:init" first.'); process.exit(1); }
const env = { ...process.env };
env.DIRECTUS_URL = env.DIRECTUS_URL || `http://127.0.0.1:${cfg.PORT}`;
env.SITE_URL = env.SITE_URL || (cfg.PUBLIC_URL || '').replace(/\/admin2\/?$/, '');
if (process.argv.includes('--content')) {
	if (!cfg.SITE_READER_TOKEN) { console.error('No SITE_READER_TOKEN in directus/.env. Run "npm run directus:setup" first (Directus must be running).'); process.exit(1); }
	env.CONTENT_SOURCE = 'directus';
	env.DIRECTUS_TOKEN = cfg.SITE_READER_TOKEN;
}
const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
