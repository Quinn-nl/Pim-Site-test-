'use strict';
/**
 * Database back-ups made by the app itself: a consistent copy (VACUUM INTO) in DATA_DIR/backups, daily, the newest 14 are kept.
 * Photos are not copied (they live in DATA_DIR/uploads; `npm run backup` copies everything). Restoring is a deliberate, offline step: scripts/restore.js.
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');
const audit = require('./audit');
const cfg = require('../config');

const KEEP = 14;
const dir = () => path.join(cfg.DATA_DIR, 'backups');
const NAME = /^aethra-\d{8}-\d{6}\.db$/;

function run(user = null) {
	fs.mkdirSync(dir(), { recursive: true, mode: 0o700 });
	const t = new Date();
	const p2 = (n) => String(n).padStart(2, '0');
	const name = `aethra-${t.getUTCFullYear()}${p2(t.getUTCMonth() + 1)}${p2(t.getUTCDate())}-${p2(t.getUTCHours())}${p2(t.getUTCMinutes())}${p2(t.getUTCSeconds())}.db`;
	const target = path.join(dir(), name);
	db.backupTo(target);
	fs.chmodSync(target, 0o600);
	prune();
	audit.log({ user, actie: 'backup.gemaakt', entiteit: 'systeem', nieuw: { bestand: name } });
	return name;
}
function list() {
	if (!fs.existsSync(dir())) return [];
	return fs.readdirSync(dir()).filter((f) => NAME.test(f)).sort().reverse().map((f) => { const st = fs.statSync(path.join(dir(), f)); return { naam: f, grootte: st.size, tijd: st.mtime.toISOString() }; });
}
function prune() { for (const old of list().slice(KEEP)) fs.rmSync(path.join(dir(), old.naam), { force: true }); }
/** Absolute path of a back-up by name, or null (names are checked against a strict pattern: no path tricks). */
const fileFor = (name) => (NAME.test(String(name)) && fs.existsSync(path.join(dir(), name)) ? path.join(dir(), name) : null);
/** Called by the daily job: make one if the newest is older than 23 hours. */
function ensureDaily(now = Date.now()) {
	const last = list()[0];
	if (last && now - Date.parse(last.tijd) < 23 * 3600 * 1000) return null;
	return run(null);
}
module.exports = { run, list, fileFor, prune, ensureDaily, KEEP };
