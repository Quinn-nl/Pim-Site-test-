'use strict';
/**
 * Messages from the contact form. Database first: the row is written before any network activity (mail) happens.
 * Mail goes through the table uitgaande_wachtrij: a worker tries every minute, doubles the wait after each failure
 * (2^poging x 5 minutes), gives up after 5 attempts, and raises an alarm in the admin when a mail has been failing for over an hour.
 */
const db = require('./db');
const audit = require('./audit');
const events = require('./events');
const mail = require('../mail');
const cfg = require('../config');
const { UI, LANGS } = require('../i18n');

const STATUSES = ['nieuw', 'gelezen', 'beantwoord', 'afgesloten'];
const MAX_ATTEMPTS = 5;
const BASE_WAIT_MS = 5 * 60 * 1000;
const ALARM_AFTER_MS = 60 * 60 * 1000;
const MAX_STORED = 5000;

function add(msg) {
	if (db.get('SELECT COUNT(*) AS n FROM berichten').n >= MAX_STORED) return null;
	const r = db.run('INSERT INTO berichten (tijd, taal, naam, email, organisatie, rol, tekst, bron, campagne) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', db.iso(), msg.lang, msg.name, msg.email, msg.org || '', msg.role, msg.message, msg.source || 'direct', msg.campaign || '');
	const saved = get(r.id);
	if (mail.configured()) enqueue(saved.id, 'team');
	events.broadcast('berichten', { nieuw: unreadCount() });
	return saved;
}
function enqueue(berichtId, soort) {
	db.run('INSERT INTO uitgaande_wachtrij (bericht_id, soort, status, aantal_pogingen, volgende_poging, aangemaakt) VALUES (?, ?, ?, 0, 0, ?)', berichtId, soort, 'wacht', Date.now());
	kick();
}

const shape = (r) => (r ? { id: r.id, tijd: r.tijd, taal: r.taal, naam: r.naam, email: r.email, organisatie: r.organisatie, rol: r.rol, tekst: r.tekst, bron: r.bron, campagne: r.campagne, status: r.status, notitie: r.notitie, toegewezen_aan: r.toegewezen_aan } : null);
const get = (id) => shape(db.get('SELECT * FROM berichten WHERE id = ?', id));

function filterSql({ q = '', status = '', rol = '', taal = '', bron = '', van = '', tot = '' } = {}) {
	const where = [];
	const params = [];
	if (q) { where.push('(naam LIKE ? ESCAPE \'\\\' OR email LIKE ? ESCAPE \'\\\' OR organisatie LIKE ? ESCAPE \'\\\' OR tekst LIKE ? ESCAPE \'\\\')'); const like = `%${String(q).replace(/[\\%_]/g, '\\$&')}%`; params.push(like, like, like, like); }
	if (STATUSES.includes(status)) { where.push('status = ?'); params.push(status); }
	if (rol) { where.push('rol = ?'); params.push(rol); }
	if (LANGS.includes(taal)) { where.push('taal = ?'); params.push(taal); }
	if (bron) { where.push('bron = ?'); params.push(bron); }
	if (/^\d{4}-\d{2}-\d{2}$/.test(van)) { where.push('tijd >= ?'); params.push(`${van}T00:00:00.000Z`); }
	if (/^\d{4}-\d{2}-\d{2}$/.test(tot)) { where.push('tijd <= ?'); params.push(`${tot}T23:59:59.999Z`); }
	return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}
function list(filter = {}, { limit = 50, offset = 0 } = {}) {
	const { sql, params } = filterSql(filter);
	return db.all(`SELECT * FROM berichten ${sql} ORDER BY tijd DESC, id DESC LIMIT ? OFFSET ?`, ...params, limit, offset).map(shape);
}
const count = (filter = {}) => { const { sql, params } = filterSql(filter); return db.get(`SELECT COUNT(*) AS n FROM berichten ${sql}`, ...params).n; };
const unreadCount = () => db.get("SELECT COUNT(*) AS n FROM berichten WHERE status = 'nieuw'").n;
const sources = () => db.all('SELECT DISTINCT bron FROM berichten ORDER BY bron').map((r) => r.bron);
const roles = () => db.all('SELECT DISTINCT rol FROM berichten ORDER BY rol').map((r) => r.rol);

function setStatus(id, status, user) {
	if (!STATUSES.includes(status)) throw Object.assign(new Error('Onbekende status.'), { status: 400 });
	const old = get(id);
	if (!old) throw Object.assign(new Error('Bericht niet gevonden.'), { status: 404 });
	db.run('UPDATE berichten SET status = ? WHERE id = ?', status, id);
	if (old.status !== status && status !== 'gelezen') audit.log({ user, actie: 'bericht.status', entiteit: `bericht:${id}`, oud: old.status, nieuw: status });
	events.broadcast('berichten', { nieuw: unreadCount() });
}
/** Opening a new message marks it as read; later statuses are never moved back. */
function markRead(id) { db.run("UPDATE berichten SET status = 'gelezen' WHERE id = ? AND status = 'nieuw'", id); events.broadcast('berichten', { nieuw: unreadCount() }); }
function setNote(id, notitie, user) {
	db.run('UPDATE berichten SET notitie = ? WHERE id = ?', String(notitie || '').slice(0, 5000), id);
	audit.log({ user, actie: 'bericht.notitie', entiteit: `bericht:${id}` });
}
function assign(id, userId, user) {
	db.run('UPDATE berichten SET toegewezen_aan = ? WHERE id = ?', userId || null, id);
	audit.log({ user, actie: 'bericht.toegewezen', entiteit: `bericht:${id}`, nieuw: userId || null });
}
function remove(id, user) {
	const r = db.run('DELETE FROM berichten WHERE id = ?', id);
	if (r.changes) audit.log({ user, actie: 'bericht.verwijderd', entiteit: `bericht:${id}` });
	events.broadcast('berichten', { nieuw: unreadCount() });
	return r.changes > 0;
}

/* Privacy requests: everything one person sent. */
const byEmail = (email) => db.all('SELECT * FROM berichten WHERE email = ? ORDER BY tijd', String(email || '').trim()).map(shape);
function removeByEmail(email, user) {
	const r = db.run('DELETE FROM berichten WHERE email = ?', String(email || '').trim());
	audit.log({ user, actie: 'bericht.verwijderd_per_email', entiteit: 'bericht', nieuw: { aantal: r.changes } });
	return r.changes;
}
function purge(days = cfg.RETENTION_DAYS) {
	const cutoff = new Date(Date.now() - days * 86400000).toISOString();
	const r = db.run('DELETE FROM berichten WHERE tijd < ?', cutoff);
	if (r.changes) audit.log({ user: null, actie: 'bericht.bewaartermijn', entiteit: 'bericht', nieuw: { aantal: r.changes, dagen: days } });
	return r.changes;
}

/** CSV for the export. Cells that start like a formula are neutralised (CSV injection). */
function csv(filter = {}) {
	const cell = (v) => { let t = String(v == null ? '' : v).replace(/\r?\n/g, ' '); if (/^[=+\-@\t]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
	const rows = list(filter, { limit: MAX_STORED, offset: 0 }).map((m) => [m.tijd, m.taal, m.rol, m.bron, m.campagne, m.status, m.naam, m.email, m.organisatie, m.tekst].map(cell).join(','));
	return '﻿' + ['Received,Language,Role,Source,Campaign,Status,Name,Email,Organisation,Message', ...rows].join('\r\n') + '\r\n';
}

/* ---- mail queue ---- */
const waitAfter = (attempts) => (2 ** attempts) * BASE_WAIT_MS; // 10, 20, 40, 80 minutes after the 1st..4th failure
function bodyFor(row, m) {
	const content = require('./content');
	if (row.soort === 'bezoeker') {
		const t = UI[m.taal] || UI.en;
		const v = content.textValues(m.taal);
		return { to: [m.email], subject: t.ar_subject, text: t.ar_body.replace('{name}', v.site_name).replace('{reply}', v.contact_reply) };
	}
	return { subject: `New website message (${m.rol}, ${String(m.taal).toUpperCase()})`, text: `From: ${m.naam} <${m.email}>\nOrganisation: ${m.organisatie || '-'}\nRole: ${m.rol}\nLanguage: ${m.taal}\n\n${m.tekst}\n`, replyTo: m.email };
}
let ticking = false;
let timer = null;
let kicked = null;

/** One round: every mail that is due. Returns how many were handled. */
async function tick(now = Date.now(), send = mail.sendMail) {
	if (ticking || db.degraded()) return 0;
	ticking = true;
	let handled = 0;
	try {
		if (!mail.configured() && send === mail.sendMail) return 0;
		const due = db.all("SELECT * FROM uitgaande_wachtrij WHERE status = 'wacht' OR (status = 'mislukt' AND volgende_poging <= ?) ORDER BY id LIMIT 20", now);
		for (const row of due) {
			const m = get(row.bericht_id);
			if (!m) { db.run("UPDATE uitgaande_wachtrij SET status = 'gefaald', foutmelding = 'message deleted' WHERE id = ?", row.id); continue; }
			let result;
			try { result = await send(bodyFor(row, m)); } catch (e) { result = { sent: false, reason: e.message }; }
			handled += 1;
			if (result && result.sent) { db.run("UPDATE uitgaande_wachtrij SET status = 'verzonden', foutmelding = NULL WHERE id = ?", row.id); continue; }
			const attempts = row.aantal_pogingen + 1;
			const reason = String((result && result.reason) || 'unknown error').slice(0, 200); // never contains personal data
			if (attempts >= MAX_ATTEMPTS) db.run("UPDATE uitgaande_wachtrij SET status = 'gefaald', aantal_pogingen = ?, foutmelding = ?, eerste_fout = COALESCE(eerste_fout, ?) WHERE id = ?", attempts, reason, now, row.id);
			else db.run("UPDATE uitgaande_wachtrij SET status = 'mislukt', aantal_pogingen = ?, volgende_poging = ?, foutmelding = ?, eerste_fout = COALESCE(eerste_fout, ?) WHERE id = ?", attempts, now + waitAfter(attempts), reason, now, row.id);
		}
		alarm(now);
	} finally {
		ticking = false;
	}
	return handled;
}
/** Mails that have been failing for over an hour: shown in the admin (SSE) until they are sent or given up on. */
function alarmCount(now = Date.now()) {
	return db.get("SELECT COUNT(*) AS n FROM uitgaande_wachtrij WHERE status IN ('mislukt', 'gefaald') AND eerste_fout IS NOT NULL AND eerste_fout < ?", now - ALARM_AFTER_MS).n;
}
function alarm(now = Date.now()) { events.broadcast('mail', { mislukt: alarmCount(now), totaal: queueStats() }); }
const queueStats = () => Object.fromEntries(db.all('SELECT status, COUNT(*) AS n FROM uitgaande_wachtrij GROUP BY status').map((r) => [r.status, r.n]));
const queueList = (limit = 50) => db.all('SELECT w.*, b.naam, b.rol FROM uitgaande_wachtrij w LEFT JOIN berichten b ON b.id = w.bericht_id ORDER BY w.id DESC LIMIT ?', limit);
/** An administrator can put a given-up mail back in the queue. */
function retry(id, user) {
	db.run("UPDATE uitgaande_wachtrij SET status = 'wacht', aantal_pogingen = 0, volgende_poging = 0, eerste_fout = NULL WHERE id = ? AND status IN ('mislukt', 'gefaald')", id);
	audit.log({ user, actie: 'wachtrij.opnieuw', entiteit: `wachtrij:${id}` });
	kick();
}

function kick() {
	if (kicked) return;
	kicked = setTimeout(() => { kicked = null; tick().catch(() => {}); }, 50);
	kicked.unref();
}
function start() {
	if (timer) return;
	timer = setInterval(() => tick().catch(() => {}), 60000);
	timer.unref();
	setTimeout(() => tick().catch(() => {}), 2000).unref();
}
const stop = () => { if (timer) clearInterval(timer); timer = null; if (kicked) clearTimeout(kicked); kicked = null; };
const busy = () => ticking;

module.exports = { STATUSES, MAX_ATTEMPTS, add, enqueue, get, list, count, unreadCount, sources, roles, setStatus, markRead, setNote, assign, remove, byEmail, removeByEmail, purge, csv, tick, waitAfter, alarmCount, alarm, queueStats, queueList, retry, kick, start, stop, busy };
