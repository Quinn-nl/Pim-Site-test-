'use strict';
const crypto = require('crypto');
const store = require('./store');
const cfg = require('./config');
const totp = require('./totp');

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
	const admin = store.readJson('admin.json', {}) || {};
	store.writeJson('admin.json', { ...admin, hash: hashPassword(password), updated: new Date().toISOString() }); // keeps the two-step settings
}

function checkPassword(password) {
	const admin = store.readJson('admin.json', null);
	return verifyPassword(password, admin && admin.hash) && !!admin;
}

/* Two-step verification. The authenticator secret is stored encrypted with the server's secret.key. */
const seal = (text) => {
	const key = crypto.createHash('sha256').update(`totp:${store.getSecret()}`).digest();
	const iv = crypto.randomBytes(12);
	const c = crypto.createCipheriv('aes-256-gcm', key, iv);
	const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
	return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
};
const unseal = (b64) => {
	const raw = Buffer.from(String(b64), 'base64');
	const key = crypto.createHash('sha256').update(`totp:${store.getSecret()}`).digest();
	const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
	d.setAuthTag(raw.subarray(12, 28));
	return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
};
const readAdmin = () => store.readJson('admin.json', {}) || {};
const saveTotp = (t) => { const a = readAdmin(); if (t) a.totp = t; else delete a.totp; store.writeJson('admin.json', a); };
const hashRecovery = (code) => crypto.createHash('sha256').update(String(code).toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');

const twoFactorEnabled = () => !!(readAdmin().totp && readAdmin().totp.secret);

/** Starts setup: a fresh secret that only counts once the user proves it works with a code. */
function beginTwoFactor() {
	const secret = totp.newSecret();
	saveTotp({ pending: seal(secret) });
	return { secret, uri: totp.uri(secret, 'admin', 'Aethra') };
}

function pendingTwoFactor() {
	const t = readAdmin().totp;
	if (!t || !t.pending) return null;
	const secret = unseal(t.pending);
	return { secret, uri: totp.uri(secret, 'admin', 'Aethra') };
}

/** Returns 8 one-time recovery codes (shown once) or null when the code is wrong. */
function confirmTwoFactor(code) {
	const t = readAdmin().totp;
	if (!t || !t.pending) return null;
	const secret = unseal(t.pending);
	const step = totp.verify(secret, code);
	if (step === null) return null;
	const L = 'abcdefghjkmnpqrstuvwxyz'; // letters only, so a recovery code can never be mistaken for a 6-digit app code
	const codes = Array.from({ length: 8 }, () => { const r = Array.from(crypto.randomBytes(10), (b) => L[b % L.length]).join(''); return `${r.slice(0, 5)}-${r.slice(5)}`; });
	saveTotp({ secret: seal(secret), lastStep: step, recovery: codes.map(hashRecovery) });
	return codes;
}

/** Accepts a 6-digit app code (once per time step) or an unused recovery code. */
function verifySecondFactor(input) {
	const t = readAdmin().totp;
	if (!t || !t.secret) return false;
	const text = String(input || '').trim();
	if (/^\d[\d\s]*$/.test(text)) {
		const step = totp.verify(unseal(t.secret), text);
		if (step === null || step <= (t.lastStep || 0)) return false;
		saveTotp({ ...t, lastStep: step });
		return true;
	}
	const h = hashRecovery(text);
	const left = (t.recovery || []).filter((r) => !safeEqual(r, h));
	if (left.length === (t.recovery || []).length) return false;
	saveTotp({ ...t, recovery: left });
	return true;
}

const recoveryLeft = () => ((readAdmin().totp || {}).recovery || []).length;
const disableTwoFactor = () => saveTotp(null);

/* Short-lived ticket between the password step and the code step. */
const tickets = new Map();
function createTicket() {
	const id = crypto.randomBytes(24).toString('hex');
	tickets.set(id, { expires: Date.now() + 5 * 60 * 1000, tries: 0 });
	while (tickets.size > 50) tickets.delete(tickets.keys().next().value);
	return id;
}
/** 'ok' while the ticket is valid and under 5 wrong tries; counts the attempt. */
function useTicket(id) {
	const t = tickets.get(id);
	if (!t || t.expires < Date.now() || t.tries >= 5) { tickets.delete(id); return false; }
	t.tries += 1;
	return true;
}
const endTicket = (id) => tickets.delete(id);

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

module.exports = { twoFactorEnabled, beginTwoFactor, pendingTwoFactor, confirmTwoFactor, verifySecondFactor, recoveryLeft, disableTwoFactor, createTicket, useTicket, endTicket, COOKIE, hashPassword, verifyPassword, setPassword, checkPassword, hasAdmin, parseCookies, createSession, getSession, destroySession, destroyOtherSessions, cookieHeader, safeEqual, formToken, inspectFormToken, checkFormToken };
