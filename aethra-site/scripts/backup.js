'use strict';
/** Usage: npm run backup. Copies the data folder to backups/<timestamp> (the database as a consistent snapshot) and keeps the newest 14. */
const fs = require('fs');
const path = require('path');
const cfg = require('../lib/config');
const db = require('../lib/cms/db');

const root = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(cfg.ROOT, 'backups');
if (!fs.existsSync(cfg.DATA_DIR)) { console.error(`No data folder at ${cfg.DATA_DIR}`); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const target = path.join(root, stamp);
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
fs.cpSync(cfg.DATA_DIR, target, { recursive: true, filter: (src) => !/aethra\.db(-wal|-shm)?$/.test(src) && !/[\\/]tmp$/.test(src) });
if (fs.existsSync(path.join(cfg.DATA_DIR, 'aethra.db'))) { db.backupTo(path.join(target, 'aethra.db')); db.close(); }
const all = fs.readdirSync(root).filter((d) => /^\d{4}-\d\d-\d\d-\d\d-\d\d$/.test(d)).sort();
for (const old of all.slice(0, Math.max(0, all.length - 14))) fs.rmSync(path.join(root, old), { recursive: true, force: true });
console.log(`Backup written to ${target}`);
