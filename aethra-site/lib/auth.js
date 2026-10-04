'use strict';
const crypto = require('crypto');
const store = require('./store');
const cfg = require('./config');

const COOKIE = 'aethra_sid';
const IDLE_MS = 60 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

function hashPassword(password) {
	const salt = crypto.randomBytes(16).toString('hex');
	const hash = crypto.scryptSync(password, salt, 64).toString('hex');
	return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
	const [alg, salt, hash] = String(stored || '').split('$');
	// Always spend the same work, even when no password is set.
	const expected = Buffer.from(hash || '00', 'hex');
	const actual = crypto.scryptSync(String(password), salt || 'x', expected.length || 1);
	return alg === 'scrypt' && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function setPassword(password) {
	if (typeof password !== 'string' || password.length < 12) throw new Error('Use at least 12 characters.');
	store.writeJson('admin.json', { hash: hashPassword(password), updated: new Date().toISOString() });
}

function checkPassword(password) {
	const admin = store.readJson('admin.json', null);
	return verifyPassword(password, admin && admin.hash) && !!admin;
}

function hasAdmin() {
	return !!store.readJson('admin.json', null);
}

function parseCookies(header) {
	const out = {};
	for (const part of String(header || '').split(';')) {
		const i = part.indexOf('=');
		if (i <= 0) continue;
		let value = part.slice(i + 1).trim();
		try { value = decodeURIComponent(value); } catch (e) { /* keep the raw value: a malformed cookie must not break the request */ }
		out[part.slice(0, i).trim()] = value;
	}
	return out;
}

function createSession() {
	const id = crypto.randomBytes(32).toString('hex');
	const now = Date.now();
	const session = { id, csrf: crypto.randomBytes(24).toString('hex'), created: now, seen: now };
	sessions.set(id, session);
	while (sessions.size > 20) sessions.delete(sessions.keys().next().value); // oldest first
	return session;
}

function getSession(req) {
	const id = parseCookies(req.headers.cookie)[COOKIE];
	const s = id && sessions.get(id);
	if (!s) return null;
	const now = Date.now();
	if (now - s.seen > IDLE_MS || now - s.created > ABSOLUTE_MS) {
		sessions.delete(id);
		return null;
	}
	s.seen = now;
	return s;
}

function destroySession(req) {
	const id = parseCookies(req.headers.cookie)[COOKIE];
	if (id) sessions.delete(id);
}

/** After a password change every other session is signed out. */
function destroyOtherSessions(req) {
	const keep = parseCookies(req.headers.cookie)[COOKIE];
	for (const id of sessions.keys()) if (id !== keep) sessions.delete(id);
}

function cookieHeader(value, maxAgeSeconds) {
	const parts = [`${COOKIE}=${value}`, 'Path=/admin', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
	if (cfg.SECURE) parts.push('Secure');
	return parts.join('; ');
}

function safeEqual(a, b) {
	const x = Buffer.from(String(a));
	const y = Buffer.from(String(b));
	return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* Stateless signed token for the public contact form. */
function formToken() {
	const ts = String(Math.floor(Date.now() / 1000));
	const sig = crypto.createHmac('sha256', store.getSecret()).update(ts).digest('hex');
	return `${ts}.${sig}`;
}

/** 'ok' | 'fast' (sent within 2 s) | 'old' (over 24 h) | 'bad' (missing or forged). */
function inspectFormToken(token) {
	const [ts, sig] = String(token || '').split('.');
	if (!ts || !sig) return 'bad';
	const good = crypto.createHmac('sha256', store.getSecret()).update(ts).digest('hex');
	if (!safeEqual(sig, good)) return 'bad';
	const age = Math.floor(Date.now() / 1000) - Number(ts);
	if (age < 2) return 'fast';
	if (age > 24 * 3600) return 'old';
	return 'ok';
}

const checkFormToken = (token) => inspectFormToken(token) === 'ok';

module.exports = { COOKIE, hashPassword, verifyPassword, setPassword, checkPassword, hasAdmin, parseCookies, createSession, getSession, destroySession, destroyOtherSessions, cookieHeader, safeEqual, formToken, inspectFormToken, checkFormToken };
