#!/usr/bin/env node
'use strict';
/**
 * Starts the website with /admin2 pointing at the Payload CMS and the website texts, photos and pages coming from
 * it. The same on Windows, macOS and Linux.   npm run start:cms
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const envFile = path.join(__dirname, '..', 'payload', '.env');
const cfg = Object.fromEntries(fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]) : []);
if (!cfg.PAYLOAD_SECRET) { console.error('payload/.env not found. Run "npm run cms:init" first.'); process.exit(1); }
const env = { ...process.env };
env.CMS_URL = env.CMS_URL || 'http://127.0.0.1:3001';
env.SITE_URL = env.SITE_URL || cfg.PAYLOAD_PUBLIC_SERVER_URL || '';
env.CONTENT_SOURCE = 'payload';
if (cfg.CMS_API_KEY) env.CMS_API_KEY = cfg.CMS_API_KEY;
else console.warn('No CMS_API_KEY in payload/.env yet: contact messages will not be copied into the CMS inbox. Run "npm run cms:setup" first.');
const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
