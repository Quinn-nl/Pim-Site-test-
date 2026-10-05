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

function where({ actie = '', gebruiker = '', entiteit = '', van = '', tot = '' } = {}) {
	const w = [];
	const p = [];
	if (actie) { w.push('a.actie LIKE ?'); p.push(`%${actie}%`); }
	if (/^\d+$/.test(String(gebruiker))) { w.push('a.gebruiker_id = ?'); p.push(Number(gebruiker)); } else if (gebruiker === 'systeem') w.push('a.gebruiker_id IS NULL');
	if (entiteit) { w.push('a.entiteit LIKE ?'); p.push(`%${entiteit}%`); }
	if (/^\d{4}-\d{2}-\d{2}$/.test(van)) { w.push('a.timestamp >= ?'); p.push(`${van}T00:00:00.000Z`); }
	if (/^\d{4}-\d{2}-\d{2}$/.test(tot)) { w.push('a.timestamp <= ?'); p.push(`${tot}T23:59:59.999Z`); }
	return { sql: w.length ? `WHERE ${w.join(' AND ')}` : '', p };
}
/** list({ limit, offset, actie, gebruiker, entiteit, van, tot }). A plain string as `actie` still works. */
function list(opts = {}) {
	const { limit = 100, offset = 0, ...f } = opts;
	const { sql, p } = where(f);
	return db.all(`SELECT a.*, g.email AS gebruiker, g.naam AS naam FROM audit_logs a LEFT JOIN gebruikers g ON g.id = a.gebruiker_id ${sql} ORDER BY a.id DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
}
const count = (f = {}) => { const { sql, p } = where(typeof f === 'string' ? { actie: f } : f); return db.get(`SELECT COUNT(*) AS n FROM audit_logs a ${sql}`, ...p).n; };
/** CSV for an export. Cells that start with = + - @ are neutralised (spreadsheet formula injection). */
function csv(f = {}) {
	const cell = (v) => { let t = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
	const rows = list({ ...f, limit: 50000, offset: 0 }).map((r) => [r.timestamp, r.gebruiker || 'systeem', r.actie, r.entiteit, r.oude_waarde, r.nieuwe_waarde, r.override_reden].map(cell).join(','));
	return ['tijd,gebruiker,actie,onderdeel,oud,nieuw,reden', ...rows].join('\r\n') + '\r\n';
}
const byUser = (userId, limit = 10) => db.all('SELECT actie, entiteit, timestamp FROM audit_logs WHERE gebruiker_id = ? ORDER BY id DESC LIMIT ?', userId, limit);

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

module.exports = { csv, byUser, log, list, count, rotate };
