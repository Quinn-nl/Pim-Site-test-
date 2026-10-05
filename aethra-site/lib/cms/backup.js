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
/**
 * The daily job's way in: a failing back-up is never silent. It is logged, the administrators get one mail per day, and the health check
 * (and so "Mijn taken") keeps warning while the newest back-up is too old.
 */
function ensureDailySafe(now = Date.now(), attempt = () => ensureDaily(now)) {
	try { return { ok: true, name: attempt() }; } catch (e) {
		const reason = String(e.message || e).replace(/[\r\n]+/g, ' ').slice(0, 200);
		audit.log({ user: null, actie: 'backup.mislukt', entiteit: 'systeem', nieuw: { reden: reason } });
		const key = 'backupmail';
		const last = db.get('SELECT waarde FROM instellingen WHERE sleutel = ?', key);
		if (!last || now - Number(last.waarde) > 20 * 3600 * 1000) {
			db.run('INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde', key, String(now));
			const outbox = require('./outbox');
			for (const a of db.all("SELECT email, naam FROM gebruikers WHERE rol = 'beheerder' AND actief = 1")) outbox.send({ aan: a.email, soort: 'beveiliging', onderwerp: 'De back-up van de website is mislukt', tekst: `Hallo ${a.naam},\n\nDe automatische back-up van de database is niet gelukt (${reason}).\n\nControleer de schijfruimte en maak daarna handmatig een back-up onder Systeem: ${require('../config').SITE_URL ? require('../config').SITE_URL + '/admin/systeem' : '/admin/systeem'}\n` });
		}
		return { ok: false, error: reason };
	}
}
module.exports = { ensureDailySafe, run, list, fileFor, prune, ensureDaily, KEEP };
