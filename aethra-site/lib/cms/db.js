'use strict';
/**
 * SQLite through the Node.js built-in node:sqlite (Node 22.13+), so there is still no npm dependency.
 * - Migrations: every .sql file in database/migrations runs once, in order, inside a transaction (table schema_versies).
 * - tx(fn): BEGIN IMMEDIATE ... COMMIT, ROLLBACK on any error.
 * - degraded: set when the database stops answering; the site then serves cached pages and /admin refuses changes with 503.
 */
const fs = require('fs');
const path = require('path');

// node:sqlite still prints an "experimental" warning; it is stable enough for this use and the warning is noise in the logs.
const emit = process.emitWarning;
process.emitWarning = (w, ...a) => (/SQLite/i.test(String(w && w.message ? w.message : w)) ? undefined : emit.call(process, w, ...a));
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = emit;

const cfg = require('../config');

const MIGRATIONS_DIR = path.join(cfg.ROOT, 'database', 'migrations');
let db = null;
let degradedSince = 0;
let inTx = false;

const file = () => path.join(cfg.DATA_DIR, 'aethra.db');
const clean = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

function open() {
	if (db) return db;
	fs.mkdirSync(cfg.DATA_DIR, { recursive: true, mode: 0o700 });
	db = new DatabaseSync(file());
	db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
	try { fs.chmodSync(file(), 0o600); } catch (e) { /* not supported everywhere */ }
	migrate();
	degradedSince = 0;
	return db;
}

function migrate() {
	db.exec('CREATE TABLE IF NOT EXISTS schema_versies (versie INTEGER PRIMARY KEY, naam TEXT NOT NULL, toegepast TEXT NOT NULL)');
	const done = new Set(db.prepare('SELECT versie FROM schema_versies').all().map((r) => r.versie));
	const files = fs.existsSync(MIGRATIONS_DIR) ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort() : [];
	for (const name of files) {
		const version = parseInt(name, 10);
		if (done.has(version)) continue;
		db.exec('BEGIN IMMEDIATE');
		try {
			db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'));
			db.prepare('INSERT INTO schema_versies (versie, naam, toegepast) VALUES (?, ?, ?)').run(version, name, new Date().toISOString());
			db.exec('COMMIT');
		} catch (e) {
			try { db.exec('ROLLBACK'); } catch (err) { /* already rolled back */ }
			throw new Error(`Migration ${name} failed: ${e.message}`);
		}
	}
}

function guard(fn) {
	try {
		return fn(open());
	} catch (e) {
		// Real I/O trouble (not a constraint or SQL mistake) flips the switch to read-only survivability.
		if (/SQLITE_(IOERR|CANTOPEN|CORRUPT|NOTADB|FULL|READONLY)|disk I\/O|unable to open|database is locked/i.test(String(e.code || '') + String(e.message || ''))) degradedSince = degradedSince || Date.now();
		throw e;
	}
}

const run = (sql, ...params) => guard((d) => { const r = d.prepare(sql).run(...clean(params)); return { changes: Number(r.changes), id: Number(r.lastInsertRowid) }; });
const get = (sql, ...params) => guard((d) => d.prepare(sql).get(...clean(params)) || null);
const all = (sql, ...params) => guard((d) => d.prepare(sql).all(...clean(params)));

function tx(fn) {
	return guard((d) => {
		if (inTx) return fn(); // already inside a transaction: join it
		d.exec('BEGIN IMMEDIATE');
		inTx = true;
		try {
			const out = fn();
			d.exec('COMMIT');
			return out;
		} catch (e) {
			try { d.exec('ROLLBACK'); } catch (err) { /* nothing open */ }
			throw e;
		} finally {
			inTx = false;
		}
	});
}

/** Health probe used by the background job: true when the database answers (and clears the degraded flag). */
function ping() {
	try {
		open().prepare('SELECT 1').get();
		degradedSince = 0;
		return true;
	} catch (e) {
		degradedSince = degradedSince || Date.now();
		return false;
	}
}

const degraded = () => degradedSince > 0;
const markDegraded = () => { degradedSince = degradedSince || Date.now(); };
const iso = () => new Date().toISOString();

function close() {
	if (db) { try { db.close(); } catch (e) { /* closing twice */ } }
	db = null;
}

/** A consistent copy of the live database (also while it is being written to). */
function backupTo(target) {
	open().exec(`VACUUM INTO '${String(target).replace(/'/g, "''")}'`);
}

/** For tests: forget the connection so a new DATA_DIR can be used. */
function reset() { close(); degradedSince = 0; inTx = false; }

module.exports = { backupTo, open, run, get, all, tx, ping, degraded, markDegraded, close, reset, iso, file };
