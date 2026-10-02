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
		if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
	}
	return out;
}

function createSession() {
	const id = crypto.randomBytes(32).toString('hex');
	const now = Date.now();
	const session = { id, csrf: crypto.randomBytes(24).toString('hex'), created: now, seen: now };
	sessions.set(id, session);
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

function checkFormToken(token, { minAge = 3, maxAge = 6 * 3600 } = {}) {
	const [ts, sig] = String(token || '').split('.');
	if (!ts || !sig) return false;
	const good = crypto.createHmac('sha256', store.getSecret()).update(ts).digest('hex');
	if (!safeEqual(sig, good)) return false;
	const age = Math.floor(Date.now() / 1000) - Number(ts);
	return age >= minAge && age <= maxAge;
}

module.exports = { COOKIE, hashPassword, verifyPassword, setPassword, checkPassword, hasAdmin, parseCookies, createSession, getSession, destroySession, cookieHeader, safeEqual, formToken, checkFormToken };
