'use strict';
/** Append-only audit trail (the table itself refuses UPDATE, and DELETE of rows younger than 180 days). */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const db = require('./db');
const cfg = require('../config');

const short = (v) => (v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 20000));

function log({ user, actie, entiteit, oud = null, nieuw = null, reden = null }) {
	return db.run('INSERT INTO audit_logs (gebruiker_id, actie, entiteit, oude_waarde, nieuwe_waarde, override_reden, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)', user ? (user.id || user) : null, actie, String(entiteit), short(oud), short(nieuw), reden, db.iso());
}

function list({ limit = 100, offset = 0, actie = '' } = {}) {
	const where = actie ? 'WHERE a.actie LIKE ?' : '';
	const params = actie ? [`%${actie}%`] : [];
	return db.all(`SELECT a.*, g.email AS gebruiker FROM audit_logs a LEFT JOIN gebruikers g ON g.id = a.gebruiker_id ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
}
const byUser = (userId, limit = 10) => db.all('SELECT actie, entiteit, timestamp FROM audit_logs WHERE gebruiker_id = ? ORDER BY id DESC LIMIT ?', userId, limit);
const count = (actie = '') => db.get(`SELECT COUNT(*) AS n FROM audit_logs ${actie ? 'WHERE actie LIKE ?' : ''}`, ...(actie ? [`%${actie}%`] : [])).n;

/** Monthly job: rows older than 180 days go to a gzipped text file, then leave the table. */
function rotate(now = new Date()) {
	const cutoff = new Date(now.getTime() - 180 * 86400000).toISOString();
	const rows = db.all('SELECT * FROM audit_logs WHERE timestamp < ? ORDER BY id', cutoff);
	if (!rows.length) return { archived: 0 };
	const dir = path.join(cfg.DATA_DIR, 'archief');
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	const target = path.join(dir, `audit-${now.toISOString().slice(0, 10)}-${rows[0].id}-${rows[rows.length - 1].id}.jsonl.gz`);
	const tmp = `${target}.tmp`;
	fs.writeFileSync(tmp, zlib.gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'), { mode: 0o600 });
	fs.renameSync(tmp, target); // the archive exists before anything is deleted
	db.run('DELETE FROM audit_logs WHERE timestamp < ?', cutoff);
	return { archived: rows.length, file: target };
}

module.exports = { byUser, log, list, count, rotate };
