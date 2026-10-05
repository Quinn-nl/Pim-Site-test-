'use strict';
/**
 * Users, passwords, two-step verification, sessions and login lockout. Native crypto only.
 * - Passwords: scrypt N=16384 r=8 p=1, 16-byte random salt per user. Stored as scrypt$N$r$p$salt$hash.
 * - TOTP (RFC 6238) from lib/totp.js, secret encrypted with AES-256-GCM; recovery codes hashed (scrypt) and single use.
 * - Sessions: 32 random bytes; only a sha256 is stored. Bound to the User-Agent and the IP subnet. Rotated after critical actions.
 * - Lockout: 5 failed attempts per 15 minutes per IP + e-mail, then 15 min, 1 hour, 24 hours.
 */
const crypto = require('crypto');
const db = require('./db');
const cfg = require('../config');
const totp = require('../totp');
const store = require('../store');
const audit = require('./audit');

const ROLES = ['beheerder', 'editor', 'lezer'];
const COOKIE = 'aethra_sid';
const IDLE_MS = 60 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const N = 16384, R = 8, P = 1;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 5;
const LOCK_STEPS = [15 * 60 * 1000, 60 * 60 * 1000, 24 * 60 * 60 * 1000];

/* Passwords */
function hashPassword(password) {
	const salt = crypto.randomBytes(16).toString('hex');
	const hash = crypto.scryptSync(String(password), salt, 64, { N, r: R, p: P }).toString('hex');
	return `scrypt$${N}$${R}$${P}$${salt}$${hash}`;
}
const DUMMY = hashPassword('dummy password for constant-time checks');
function verifyPassword(password, stored) {
	const parts = String(stored || DUMMY).split('$');
	const ok = parts[0] === 'scrypt' && parts.length === 6;
	const [, n, r, p, salt, hash] = ok ? parts : String(DUMMY).split('$');
	const expected = Buffer.from(hash, 'hex');
	const actual = crypto.scryptSync(String(password), salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
	return ok && crypto.timingSafeEqual(expected, actual);
}
const strongEnough = (pw) => typeof pw === 'string' && pw.length >= 12 && pw.length <= 200;

/* Encryption of the authenticator secret */
const key = () => crypto.createHash('sha256').update(`totp:${store.getSecret()}`).digest();
function seal(text) {
	const iv = crypto.randomBytes(12);
	const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
	const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
	return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function unseal(b64) {
	const raw = Buffer.from(String(b64), 'base64');
	const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
	d.setAuthTag(raw.subarray(12, 28));
	return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

/* Users */
const publicUser = (u) => (u ? { id: u.id, email: u.email, naam: u.naam, rol: u.rol, actief: !!u.actief, tweestaps: !!u.totp_geheim, laatste_login: u.laatste_login, aangemaakt: u.aangemaakt } : null);
const byId = (id) => db.get('SELECT * FROM gebruikers WHERE id = ?', id);
const byEmail = (email) => db.get('SELECT * FROM gebruikers WHERE email = ?', String(email || '').trim().toLowerCase());
const list = () => db.all('SELECT * FROM gebruikers ORDER BY naam').map(publicUser);
const count = () => db.get('SELECT COUNT(*) AS n FROM gebruikers').n;
const EMAIL = /^[^\s@<>(),;:\\"\[\]]+@[^\s@<>(),;:\\"\[\]]+\.[^\s@<>(),;:\\"\[\]]+$/;

function create({ email, naam, rol = 'editor', wachtwoord }, by = null) {
	email = String(email || '').trim().toLowerCase();
	naam = String(naam || '').trim().slice(0, 80);
	if (!EMAIL.test(email) || email.length > 200) throw Object.assign(new Error('Vul een geldig e-mailadres in.'), { status: 400 });
	if (!naam) throw Object.assign(new Error('Vul een naam in.'), { status: 400 });
	if (!ROLES.includes(rol)) throw Object.assign(new Error('Onbekende rol.'), { status: 400 });
	if (!strongEnough(wachtwoord)) throw Object.assign(new Error('Gebruik minstens 12 tekens.'), { status: 400 });
	if (byEmail(email)) throw Object.assign(new Error('Dat e-mailadres heeft al een account.'), { status: 409 });
	const r = db.run('INSERT INTO gebruikers (email, naam, rol, wachtwoord_hash) VALUES (?, ?, ?, ?)', email, naam, rol, hashPassword(wachtwoord));
	audit.log({ user: by, actie: 'gebruiker.aangemaakt', entiteit: `gebruiker:${r.id}`, nieuw: { email, naam, rol } });
	return r.id;
}

function setPassword(id, password, by = null) {
	if (!strongEnough(password)) throw Object.assign(new Error('Gebruik minstens 12 tekens.'), { status: 400 });
	db.run('UPDATE gebruikers SET wachtwoord_hash = ? WHERE id = ?', hashPassword(password), id);
	audit.log({ user: by || id, actie: 'gebruiker.wachtwoord', entiteit: `gebruiker:${id}` });
}

function update(id, { naam, rol, actief }, by) {
	const old = byId(id);
	if (!old) throw Object.assign(new Error('Onbekende gebruiker.'), { status: 404 });
	if (rol && !ROLES.includes(rol)) throw Object.assign(new Error('Onbekende rol.'), { status: 400 });
	const next = { naam: naam != null ? String(naam).trim().slice(0, 80) || old.naam : old.naam, rol: rol || old.rol, actief: actief == null ? old.actief : (actief ? 1 : 0) };
	if (old.rol === 'beheerder' && (next.rol !== 'beheerder' || !next.actief) && db.get("SELECT COUNT(*) AS n FROM gebruikers WHERE rol = 'beheerder' AND actief = 1").n <= 1) throw Object.assign(new Error('Er moet altijd minstens één actieve beheerder zijn.'), { status: 409 });
	db.run('UPDATE gebruikers SET naam = ?, rol = ?, actief = ? WHERE id = ?', next.naam, next.rol, next.actief, id);
	if (!next.actief) db.run('DELETE FROM sessies WHERE gebruiker_id = ?', id);
	audit.log({ user: by, actie: 'gebruiker.gewijzigd', entiteit: `gebruiker:${id}`, oud: { naam: old.naam, rol: old.rol, actief: !!old.actief }, nieuw: { ...next, actief: !!next.actief } });
}

/* Two-step verification */
function beginTwoFactor(id) {
	const secret = totp.newSecret();
	db.run('UPDATE gebruikers SET totp_open_geheim = ?, totp_open_sinds = ? WHERE id = ?', seal(secret), Date.now(), id);
	return { secret, uri: totp.uri(secret, byId(id).email, 'Aethra') };
}
function pendingTwoFactor(id) {
	const u = byId(id);
	if (!u || !u.totp_open_geheim || Date.now() - (u.totp_open_sinds || 0) > 15 * 60 * 1000) return null;
	const secret = unseal(u.totp_open_geheim);
	return { secret, uri: totp.uri(secret, u.email, 'Aethra') };
}
function newRecoveryCodes() {
	const L = 'abcdefghjkmnpqrstuvwxyz'; // letters only: never confused with a 6-digit app code
	return Array.from({ length: 8 }, () => {
		const r = Array.from(crypto.randomBytes(10), (b) => L[b % L.length]).join('');
		return `${r.slice(0, 5)}-${r.slice(5)}`;
	});
}
const norm = (c) => String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
function storeRecovery(id, codes) {
	db.run('DELETE FROM herstelcodes WHERE gebruiker_id = ?', id);
	for (const c of codes) {
		const salt = crypto.randomBytes(8).toString('hex');
		db.run('INSERT INTO herstelcodes (gebruiker_id, hash, salt) VALUES (?, ?, ?)', id, crypto.scryptSync(norm(c), salt, 32).toString('hex'), salt);
	}
}
function confirmTwoFactor(id, code) {
	const p = pendingTwoFactor(id);
	if (!p) return null;
	const step = totp.verify(p.secret, code);
	if (step === null) return null;
	const codes = newRecoveryCodes();
	db.tx(() => {
		db.run('UPDATE gebruikers SET totp_geheim = ?, totp_open_geheim = NULL, totp_open_sinds = NULL, totp_laatste_stap = ? WHERE id = ?', seal(p.secret), step, id);
		storeRecovery(id, codes);
	});
	audit.log({ user: id, actie: 'gebruiker.2fa_aan', entiteit: `gebruiker:${id}` });
	return codes;
}
function regenerateRecovery(id) {
	if (!byId(id).totp_geheim) return null;
	const codes = newRecoveryCodes();
	db.tx(() => storeRecovery(id, codes));
	audit.log({ user: id, actie: 'gebruiker.herstelcodes_nieuw', entiteit: `gebruiker:${id}` });
	return codes;
}
const recoveryLeft = (id) => db.get('SELECT COUNT(*) AS n FROM herstelcodes WHERE gebruiker_id = ? AND gebruikt = 0', id).n;
function disableTwoFactor(id, by = null) {
	db.tx(() => {
		db.run('UPDATE gebruikers SET totp_geheim = NULL, totp_open_geheim = NULL, totp_open_sinds = NULL, totp_laatste_stap = 0 WHERE id = ?', id);
		db.run('DELETE FROM herstelcodes WHERE gebruiker_id = ?', id);
	});
	audit.log({ user: by || id, actie: 'gebruiker.2fa_uit', entiteit: `gebruiker:${id}` });
}
/** A 6-digit app code (once per time step) or an unused recovery code. */
function verifySecondFactor(id, input) {
	const u = byId(id);
	if (!u || !u.totp_geheim) return false;
	const text = String(input || '').trim();
	if (/^\d[\d\s]*$/.test(text)) {
		const step = totp.verify(unseal(u.totp_geheim), text);
		if (step === null || step <= u.totp_laatste_stap) return false;
		const r = db.run('UPDATE gebruikers SET totp_laatste_stap = ? WHERE id = ? AND totp_laatste_stap < ?', step, id, step);
		return r.changes === 1;
	}
	const n = norm(text);
	if (n.length < 8) return false;
	for (const row of db.all('SELECT * FROM herstelcodes WHERE gebruiker_id = ? AND gebruikt = 0', id)) {
		const h = crypto.scryptSync(n, row.salt, 32);
		if (crypto.timingSafeEqual(h, Buffer.from(row.hash, 'hex'))) return db.run('UPDATE herstelcodes SET gebruikt = 1 WHERE id = ? AND gebruikt = 0', row.id).changes === 1;
	}
	return false;
}

/* Lockout: IP + e-mail */
const lockKey = (ip, email) => `${ip}|${String(email || '').trim().toLowerCase()}`;
function lockState(ip, email, now = Date.now()) {
	const row = db.get('SELECT * FROM inlog_pogingen WHERE sleutel = ?', lockKey(ip, email));
	if (row && row.vergrendeld_tot > now) return { locked: true, until: row.vergrendeld_tot };
	return { locked: false };
}
/** Counts a failed attempt; the 5th inside the window locks for 15 min, then 1 h, then 24 h. */
function failedAttempt(ip, email, now = Date.now()) {
	const sleutel = lockKey(ip, email);
	const row = db.get('SELECT * FROM inlog_pogingen WHERE sleutel = ?', sleutel);
	if (!row) { db.run('INSERT INTO inlog_pogingen (sleutel, aantal, venster_start) VALUES (?, 1, ?)', sleutel, now); return { locked: false }; }
	const fresh = now - row.venster_start > WINDOW_MS && row.vergrendeld_tot <= now;
	const aantal = fresh ? 1 : row.aantal + 1;
	if (aantal >= MAX_TRIES) {
		const niveau = row.niveau + 1;
		const until = now + LOCK_STEPS[Math.min(niveau, LOCK_STEPS.length) - 1];
		db.run('UPDATE inlog_pogingen SET aantal = 0, venster_start = ?, niveau = ?, vergrendeld_tot = ? WHERE sleutel = ?', now, niveau, until, sleutel);
		return { locked: true, until };
	}
	db.run('UPDATE inlog_pogingen SET aantal = ?, venster_start = ? WHERE sleutel = ?', aantal, fresh ? now : row.venster_start, sleutel);
	return { locked: false };
}
const clearAttempts = (ip, email) => db.run('DELETE FROM inlog_pogingen WHERE sleutel = ?', lockKey(ip, email));

/** Step 1 of logging in. Returns { user } | { locked } | { error }. Spends the same work for unknown users. */
function checkLogin(ip, email, password, now = Date.now()) {
	const st = lockState(ip, email, now);
	if (st.locked) return { locked: true, until: st.until };
	const u = byEmail(email);
	const ok = verifyPassword(password, u && u.wachtwoord_hash) && !!u && !!u.actief;
	if (!ok) {
		const f = failedAttempt(ip, email, now);
		audit.log({ user: u && u.id, actie: 'login.mislukt', entiteit: `gebruiker:${u ? u.id : '-'}`, nieuw: { ip: subnetOf(ip) } });
		return f.locked ? { locked: true, until: f.until } : { error: true };
	}
	return { user: u };
}

/* Short-lived ticket between the password step and the code step */
const tickets = new Map();
function createTicket(userId, ip, email) {
	const id = crypto.randomBytes(24).toString('hex');
	tickets.set(id, { userId, ip, email, expires: Date.now() + 5 * 60 * 1000, tries: 0 });
	while (tickets.size > 100) tickets.delete(tickets.keys().next().value);
	return id;
}
function useTicket(id) {
	const t = tickets.get(id);
	if (!t || t.expires < Date.now() || t.tries >= 5) { tickets.delete(id); return null; }
	t.tries += 1;
	return t;
}
const endTicket = (id) => tickets.delete(id);

/* Sessions */
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function subnetOf(ip) {
	const v = String(ip || '').replace(/^::ffff:/, '');
	if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return v.split('.').slice(0, 3).join('.') + '.0/24';
	return v.split(':').slice(0, 3).join(':') + '::/48';
}
function parseCookies(header) {
	const out = {};
	for (const part of String(header || '').split(';')) {
		const i = part.indexOf('=');
		if (i <= 0) continue;
		let value = part.slice(i + 1).trim();
		try { value = decodeURIComponent(value); } catch (e) { /* keep raw */ }
		out[part.slice(0, i).trim()] = value;
	}
	return out;
}
function createSession(userId, ip, ua) {
	const id = crypto.randomBytes(32).toString('hex');
	const csrf = crypto.randomBytes(24).toString('hex');
	const now = Date.now();
	db.tx(() => {
		db.run('DELETE FROM sessies WHERE laatst_gezien < ? OR aangemaakt < ?', now - IDLE_MS, now - ABSOLUTE_MS);
		db.run('INSERT INTO sessies (id_hash, gebruiker_id, csrf, ua_hash, ip_subnet, aangemaakt, laatst_gezien) VALUES (?, ?, ?, ?, ?, ?, ?)', sha(id), userId, csrf, sha(ua || ''), subnetOf(ip), now, now);
		db.run('UPDATE gebruikers SET laatste_login = ? WHERE id = ?', db.iso(), userId);
	});
	return { id, csrf };
}
/** Returns { id, csrf, user } or null. A changed User-Agent or subnet ends the session. */
function getSession(req, ip) {
	const id = parseCookies(req.headers.cookie)[COOKIE];
	if (!/^[0-9a-f]{64}$/.test(id || '')) return null;
	const row = db.get('SELECT * FROM sessies WHERE id_hash = ?', sha(id));
	if (!row) return null;
	const now = Date.now();
	if (now - row.laatst_gezien > IDLE_MS || now - row.aangemaakt > ABSOLUTE_MS || row.ua_hash !== sha(req.headers['user-agent'] || '') || row.ip_subnet !== subnetOf(ip)) {
		db.run('DELETE FROM sessies WHERE id_hash = ?', row.id_hash);
		return null;
	}
	const user = byId(row.gebruiker_id);
	if (!user || !user.actief) { db.run('DELETE FROM sessies WHERE id_hash = ?', row.id_hash); return null; }
	if (now - row.laatst_gezien > 30000) db.run('UPDATE sessies SET laatst_gezien = ? WHERE id_hash = ?', now, row.id_hash);
	return { id, csrf: row.csrf, user: publicUser(user) };
}
const destroySession = (req) => { const id = parseCookies(req.headers.cookie)[COOKIE]; if (id) db.run('DELETE FROM sessies WHERE id_hash = ?', sha(id)); };
/** Active sessions of one user (the cookie itself is never stored, only its hash). */
function sessionList(userId, currentId) {
	return db.all('SELECT id_hash, aangemaakt, laatst_gezien FROM sessies WHERE gebruiker_id = ? ORDER BY laatst_gezien DESC', userId).map((r) => ({ aangemaakt: r.aangemaakt, laatst_gezien: r.laatst_gezien, huidig: r.id_hash === sha(currentId || '') }));
}
function setName(id, naam) {
	naam = String(naam || '').trim().slice(0, 80);
	if (!naam) throw Object.assign(new Error('Vul een naam in.'), { status: 400 });
	const old = byId(id);
	db.run('UPDATE gebruikers SET naam = ? WHERE id = ?', naam, id);
	audit.log({ user: id, actie: 'gebruiker.gewijzigd', entiteit: `gebruiker:${id}`, oud: { naam: old.naam }, nieuw: { naam } });
}
const sessionCounts = () => Object.fromEntries(db.all('SELECT gebruiker_id, COUNT(*) AS n FROM sessies GROUP BY gebruiker_id').map((r) => [r.gebruiker_id, r.n]));
function destroyOthers(userId, keepId) { db.run('DELETE FROM sessies WHERE gebruiker_id = ? AND id_hash != ?', userId, sha(keepId || '')); }
/** New session id (and csrf) for the same session: used after every critical action. */
function rotateSession(session, req, ip) {
	db.run('DELETE FROM sessies WHERE id_hash = ?', sha(session.id));
	return createSession(session.user.id, ip, req.headers['user-agent']);
}
function cookieHeader(value, maxAgeSeconds) {
	const parts = [`${COOKIE}=${value}`, 'Path=/admin', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
	if (cfg.SECURE) parts.push('Secure');
	return parts.join('; ');
}
const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

const can = (user, action) => {
	const rol = user && user.rol;
	if (action === 'lezen') return !!rol;
	if (action === 'schrijven') return rol === 'beheerder' || rol === 'editor';
	if (action === 'beheer') return rol === 'beheerder';
	return false;
};

module.exports = { sessionList, setName, sessionCounts, ROLES, COOKIE, hashPassword, verifyPassword, create, setPassword, update, byId, byEmail, list, count, publicUser, beginTwoFactor, pendingTwoFactor, confirmTwoFactor, regenerateRecovery, recoveryLeft, disableTwoFactor, verifySecondFactor, lockState, failedAttempt, clearAttempts, checkLogin, createTicket, useTicket, endTicket, createSession, getSession, destroySession, destroyOthers, rotateSession, cookieHeader, parseCookies, safeEqual, subnetOf, can, seal, unseal };
