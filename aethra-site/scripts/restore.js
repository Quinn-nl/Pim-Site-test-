'use strict';
/**
 * Usage: node scripts/restore.js <back-up file | name>   (stop the site first).
 * Puts a back-up in place of the live database. The current database is kept next to it as aethra.db.before-restore-<time>.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../lib/config');

const arg = process.argv[2];
if (!arg) { console.error('Usage: node scripts/restore.js <file or name from data/backups>'); process.exit(1); }
const src = fs.existsSync(arg) ? path.resolve(arg) : path.join(cfg.DATA_DIR, 'backups', path.basename(arg));
if (!fs.existsSync(src)) { console.error(`Back-up not found: ${src}`); process.exit(1); }
const { DatabaseSync } = require('node:sqlite');
const probe = new DatabaseSync(src, { readOnly: true });
const check = probe.prepare('PRAGMA integrity_check').get();
const has = probe.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'gebruikers'").get().n;
probe.close();
if (Object.values(check)[0] !== 'ok' || !has) { console.error('This file is not a healthy Aethra database. Nothing was changed.'); process.exit(1); }
const live = path.join(cfg.DATA_DIR, 'aethra.db');
const stamp = new Date().toISOString().replace(/[:T.]/g, '-').slice(0, 19);
if (fs.existsSync(live)) fs.renameSync(live, `${live}.before-restore-${stamp}`);
for (const ext of ['-wal', '-shm']) fs.rmSync(live + ext, { force: true });
fs.copyFileSync(src, live);
fs.chmodSync(live, 0o600);
console.log(`Restored ${path.basename(src)}. The previous database is kept as aethra.db.before-restore-${stamp}. Start the site again.`);
