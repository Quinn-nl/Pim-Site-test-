'use strict';
/** Background jobs: health check (self-healing), message retention, audit rotation, mail worker, database watchdog. */
const db = require('./db');
const audit = require('./audit');
const messages = require('./messages');
const events = require('./events');
const cfg = require('../config');
const settings = require('./settings');
const backup = require('./backup');
const outbox = require('./outbox');
const report = require('./report');
const planning = require('./planning');
const sharelinks = require('./sharelinks');
const { GROUPS, OPTIONAL } = require('../fields');
const { LANGS, defaultsFor } = require('../i18n');

const timers = [];
const DAY = 24 * 3600 * 1000;

/**
 * Compares the database with lib/fields.js: a missing field gets an empty row (status leeg), a required text that is empty everywhere
 * becomes a dashboard warning, and every language that is not fully reviewed is mentioned.
 */
function healthCheck() {
	const warnings = new Map();
	const created = db.tx(() => {
		let n = 0;
		for (const g of GROUPS) for (const f of g.fields) for (const taal of LANGS) {
			const r = db.run("INSERT OR IGNORE INTO vertalingen (object, veld, taal, waarde, status, versie_nummer) VALUES (?, ?, ?, '', 'leeg', 0)", `tekst:${g.id}`, f.key, taal);
			n += r.changes;
		}
		return n;
	});
	const rows = db.all("SELECT taal, veld, waarde, status FROM vertalingen WHERE object LIKE 'tekst:%'");
	const have = new Map(rows.map((r) => [`${r.taal}|${r.veld}`, r]));
	for (const taal of LANGS) {
		const defaults = defaultsFor(taal);
		const missing = [];
		let unreviewed = 0, total = 0;
		for (const g of GROUPS) for (const f of g.fields) {
			total += 1;
			const r = have.get(`${taal}|${f.key}`);
			const effective = (r && r.waarde) || defaults[f.key] || '';
			if (!effective && !OPTIONAL.test(f.key)) missing.push(f.key);
			if (!r || r.status !== 'nagekeken') unreviewed += 1;
		}
		if (missing.length) warnings.set(`ontbreekt.${taal}`, { bericht: `${taal.toUpperCase()}: ${missing.length} verplichte tekst${missing.length > 1 ? 'en' : ''} ontbreek${missing.length > 1 ? 'en' : 't'} (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', …' : ''}).`, ernst: 'waarschuwing' });
		if (taal !== 'en' && unreviewed) warnings.set(`nakijken.${taal}`, { bericht: `${taal.toUpperCase()}: ${unreviewed} van de ${total} teksten zijn nog niet nagekeken door een moedertaalspreker.`, ernst: 'info' });
	}
	db.tx(() => {
		db.run('DELETE FROM gezondheid');
		for (const [sleutel, w] of warnings) db.run('INSERT INTO gezondheid (sleutel, bericht, ernst, tijdstip) VALUES (?, ?, ?, ?)', sleutel, w.bericht, w.ernst, db.iso());
	});
	events.broadcast('gezondheid', { aantal: warnings.size });
	return { created, warnings: warnings.size };
}

function dailyChores() {
	try {
		messages.purge(settings.retentionDays());
		outbox.purge();
		sharelinks.purgeExpired();
		require('./pages').purgeOld();
		require('./media').purgeOld();
		backup.ensureDaily();
		db.run('DELETE FROM sessies WHERE laatst_gezien < ?', Date.now() - 2 * 3600 * 1000);
		db.run('DELETE FROM inlog_pogingen WHERE vergrendeld_tot < ? AND venster_start < ?', Date.now(), Date.now() - DAY);
		const last = db.get("SELECT waarde FROM instellingen WHERE sleutel = 'audit_rotatie'");
		if (!last || Date.now() - Date.parse(last.waarde) > 30 * DAY) { // monthly
			audit.rotate();
			db.run("INSERT INTO instellingen (sleutel, waarde) VALUES ('audit_rotatie', ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde", db.iso());
		}
		healthCheck();
	} catch (e) { console.error(`Daily job failed: ${e.message}`); }
}

function start() {
	if (timers.length) return;
	setTimeout(() => { try { healthCheck(); } catch (e) { console.error(`Health check failed: ${e.message}`); } }, 500).unref();
	timers.push(setInterval(dailyChores, DAY));
	timers.push(setInterval(() => { try { planning.run(); } catch (e) { console.error(`Planning failed: ${e.message}`); } }, 60000));
	timers.push(setInterval(() => { try { report.sendWeekly(); } catch (e) { console.error(`Weekly report failed: ${e.message}`); } }, 3600 * 1000));
	timers.push(setInterval(() => { if (db.degraded()) db.ping(); }, 30000)); // watchdog: leaves read-only survivability as soon as the database answers again
	for (const t of timers) t.unref();
	messages.start();
	outbox.start();
}
function stop() { for (const t of timers) clearInterval(t); timers.length = 0; messages.stop(); outbox.stop(); }

module.exports = { start, stop, healthCheck, dailyChores };
