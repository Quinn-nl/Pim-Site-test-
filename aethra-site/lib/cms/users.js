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

const ROLES = ['beheerder', 'editor', 'redacteur', 'lezer'];
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
const publicUser = (u) => (u ? { id: u.id, email: u.email, naam: u.naam, rol: u.rol, actief: !!u.actief, tweestaps: !!u.totp_geheim || passkeyCount(u.id) > 0, totp: !!u.totp_geheim, laatste_login: u.laatste_login, aangemaakt: u.aangemaakt, meld_nieuw_bericht: !!u.meld_nieuw_bericht, weekrapport: !!u.weekrapport, meld_toewijzing: !!u.meld_toewijzing, meld_werkdagen: !!u.meld_werkdagen } : null);
const byId = (id) => db.get('SELECT * FROM gebruikers WHERE id = ?', id);
const byEmail = (email) => db.get('SELECT * FROM gebruikers WHERE email = ?', String(email || '').trim().toLowerCase());
const list = () => db.all('SELECT * FROM gebruikers ORDER BY naam').map(publicUser);
const count = () => db.get('SELECT COUNT(*) AS n FROM gebruikers').n;
const EMAIL = /^[^\s@<>(),;:\\"\[\]]+@[^\s@<>(),;:\\"\[\]]+\.[^\s@<>(),;:\\"\[\]]+$/;

/** Too easy to guess: refused with a reason. A random password made for an invitation is exempt (nobody ever types it). */
function checkQuality(password, who) {
	if (unusable.has(password)) return;
	const reason = require('./passwords').weakReason(password, who);
	if (reason) throw Object.assign(new Error(reason), { status: 400 });
}
const unusable = new Set();
function create({ email, naam, rol = 'editor', wachtwoord }, by = null) {
	email = String(email || '').trim().toLowerCase();
	naam = String(naam || '').trim().slice(0, 80);
	if (!EMAIL.test(email) || email.length > 200) throw Object.assign(new Error('Vul een geldig e-mailadres in.'), { status: 400 });
	if (!naam) throw Object.assign(new Error('Vul een naam in.'), { status: 400 });
	if (!ROLES.includes(rol)) throw Object.assign(new Error('Onbekende rol.'), { status: 400 });
	if (!strongEnough(wachtwoord)) throw Object.assign(new Error('Gebruik minstens 12 tekens.'), { status: 400 });
	checkQuality(wachtwoord, { email, naam });
	if (byEmail(email)) throw Object.assign(new Error('Dat e-mailadres heeft al een account.'), { status: 409 });
	const r = db.run('INSERT INTO gebruikers (email, naam, rol, wachtwoord_hash) VALUES (?, ?, ?, ?)', email, naam, rol, hashPassword(wachtwoord));
	audit.log({ user: by, actie: 'gebruiker.aangemaakt', entiteit: `gebruiker:${r.id}`, nieuw: { email, naam, rol } });
	return r.id;
}

function setPassword(id, password, by = null) {
	if (!strongEnough(password)) throw Object.assign(new Error('Gebruik minstens 12 tekens.'), { status: 400 });
	const who = byId(id);
	checkQuality(password, who ? { email: who.email, naam: who.naam } : {});
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
		db.run('DELETE FROM passkeys WHERE gebruiker_id = ?', id);
	});
	audit.log({ user: by || id, actie: 'gebruiker.2fa_uit', entiteit: `gebruiker:${id}` });
}
/* Passkeys (WebAuthn): the checks themselves are in webauthn.js */
const passkeyList = (userId) => db.all('SELECT id, naam, aangemaakt, laatst_gebruikt, alg FROM passkeys WHERE gebruiker_id = ? ORDER BY id', userId);
const has2fa = (userId) => { const u = byId(userId); return !!(u && u.totp_geheim) || passkeyCount(userId) > 0; };
const passkeyCount = (userId) => db.get('SELECT COUNT(*) AS n FROM passkeys WHERE gebruiker_id = ?', userId).n;
const passkeyCredentials = (userId) => db.all('SELECT credential_id FROM passkeys WHERE gebruiker_id = ?', userId).map((r) => r.credential_id);
function addPasskey(userId, { credentialId, jwk, alg, counter }, naam) {
	if (passkeyCount(userId) >= 10) throw Object.assign(new Error('Maximaal 10 beveiligingssleutels per account.'), { status: 422 });
	if (db.get('SELECT 1 FROM passkeys WHERE credential_id = ?', credentialId)) throw Object.assign(new Error('Deze beveiligingssleutel is al in gebruik.'), { status: 409 });
	const label = String(naam || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Beveiligingssleutel';
	db.run('INSERT INTO passkeys (gebruiker_id, credential_id, publieke_sleutel, alg, teller, naam) VALUES (?, ?, ?, ?, ?, ?)', userId, credentialId, JSON.stringify(jwk), alg, counter, label);
	audit.log({ user: userId, actie: 'gebruiker.passkey_toegevoegd', entiteit: `gebruiker:${userId}`, nieuw: { naam: label } });
}
function removePasskey(userId, id) {
	const r = db.run('DELETE FROM passkeys WHERE gebruiker_id = ? AND id = ?', userId, id);
	if (r.changes) audit.log({ user: userId, actie: 'gebruiker.passkey_verwijderd', entiteit: `gebruiker:${userId}` });
	return r.changes > 0;
}
const passkeyFor = (userId, credentialId) => { const r = db.get('SELECT * FROM passkeys WHERE gebruiker_id = ? AND credential_id = ?', userId, credentialId); return r ? { id: r.id, jwk: JSON.parse(r.publieke_sleutel), alg: r.alg, teller: r.teller } : null; };
const touchPasskey = (id, counter) => db.run('UPDATE passkeys SET teller = ?, laatst_gebruikt = ? WHERE id = ?', counter, db.iso(), id);
/** Short-lived challenges for registering (bound to the person) and for the reset page (bound to the link). */
const challenges = new Map();
function newChallenge(owner) {
	const challenge = require('./webauthn').newChallenge();
	challenges.set(owner, { challenge, expires: Date.now() + 5 * 60 * 1000 });
	while (challenges.size > 200) challenges.delete(challenges.keys().next().value);
	return challenge;
}
function takeChallenge(owner) {
	const c = challenges.get(owner);
	challenges.delete(owner);
	return c && c.expires > Date.now() ? c.challenge : null;
}

/**
 * Is two-step verification required for this person (Instellingen: nobody / administrators / administrators and editors / everyone)?
 * New accounts and a newly switched-on rule get 7 days. After that someone without a second step can only reach their account page to set it up.
 */
function mfaPolicy(user, now = Date.now()) {
	let rule = 'niemand'; let since = '';
	try { const st = require('./settings'); rule = st.get('tweestaps_verplicht'); since = st.get('tweestaps_sinds'); } catch (e) { return { required: false, enforced: false }; }
	const required = rule === 'iedereen' || (rule === 'beheer_editor' && ['beheerder', 'editor'].includes(user.rol)) || (rule !== 'niemand' && rule !== 'iedereen' && user.rol === 'beheerder');
	if (!required || has2fa(user.id)) return { required, has: has2fa(user.id), enforced: false };
	const row = byId(user.id);
	const start = Math.max(Date.parse(row.aangemaakt) || 0, Date.parse(since) || 0);
	const deadline = start + 7 * 86400000;
	return { required, has: false, deadline, daysLeft: Math.max(0, Math.ceil((deadline - now) / 86400000)), enforced: now > deadline };
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
/** Looks at a ticket without using up one of its tries (the passkey options request). */
const peekTicket = (id) => { const t = tickets.get(id); return t && t.expires > Date.now() && t.tries < 5 ? t : null; };

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
		db.run('INSERT INTO sessies (id_hash, gebruiker_id, csrf, ua_hash, ip_subnet, aangemaakt, laatst_gezien, apparaat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', sha(id), userId, csrf, sha(ua || ''), subnetOf(ip), now, now, describeDevice(ua));
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
	return db.all('SELECT id_hash, aangemaakt, laatst_gezien, apparaat, ip_subnet FROM sessies WHERE gebruiker_id = ? ORDER BY laatst_gezien DESC', userId).map((r) => ({ hash: r.id_hash, apparaat: r.apparaat || 'onbekend apparaat', netwerk: r.ip_subnet, aangemaakt: r.aangemaakt, laatst_gezien: r.laatst_gezien, huidig: r.id_hash === sha(currentId || '') }));
}
/** Ends one other session of this person (never the one in use: that is what signing out is for). */
function endSession(userId, hash, currentId) {
	if (!/^[0-9a-f]{64}$/.test(String(hash)) || hash === sha(currentId || '')) return false;
	return db.run('DELETE FROM sessies WHERE gebruiker_id = ? AND id_hash = ?', userId, hash).changes > 0;
}
function setPrefs(id, { meld_nieuw_bericht, weekrapport, meld_toewijzing = false, meld_werkdagen = false }) {
	db.run('UPDATE gebruikers SET meld_nieuw_bericht = ?, weekrapport = ?, meld_toewijzing = ?, meld_werkdagen = ? WHERE id = ?', meld_nieuw_bericht ? 1 : 0, weekrapport ? 1 : 0, meld_toewijzing ? 1 : 0, meld_werkdagen ? 1 : 0, id);
}
/** Active people who want mail about new messages / the weekly report (never readers: they have no access to messages). */
const subscribers = (pref) => db.all(`SELECT id, email, naam, rol, meld_werkdagen FROM gebruikers WHERE actief = 1 AND ${pref === 'weekrapport' ? 'weekrapport' : pref === 'toewijzing' ? 'meld_toewijzing' : 'meld_nieuw_bericht'} = 1 AND rol != 'lezer'`);
/* One-time links: invitation (72 hours) and password reset (1 hour). Only the hash of the token is stored; a new link replaces the old one. */
const TOKEN_TTL = { uitnodiging: 72 * 3600 * 1000, herstel: 3600 * 1000 };
function createToken(userId, soort, ttl = TOKEN_TTL[soort]) {
	const token = crypto.randomBytes(32).toString('hex');
	db.run('UPDATE gebruikers SET token_hash = ?, token_soort = ?, token_tot = ? WHERE id = ?', sha(token), soort, Date.now() + ttl, userId);
	return token;
}
function findByToken(token) {
	if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return null;
	const u = db.get('SELECT * FROM gebruikers WHERE token_hash = ?', sha(token));
	if (!u || !u.actief || !u.token_tot || u.token_tot < Date.now()) return null;
	return u;
}
const clearToken = (userId) => db.run('UPDATE gebruikers SET token_hash = NULL, token_soort = NULL, token_tot = NULL WHERE id = ?', userId);
/** A password nobody knows, for accounts that are created by invitation. */
const unusablePassword = () => { const p = crypto.randomBytes(24).toString('base64url'); unusable.add(p); if (unusable.size > 50) unusable.delete(unusable.values().next().value); return p; };

/** First time this browser signs in for this person? Returns true only when other devices were already known (not on the very first login). */
function noteDevice(userId, ua) {
	const h = sha(ua || '');
	const known = db.get('SELECT COUNT(*) AS n FROM bekende_apparaten WHERE gebruiker_id = ?', userId).n;
	const r = db.run('INSERT OR IGNORE INTO bekende_apparaten (gebruiker_id, ua_hash) VALUES (?, ?)', userId, h);
	return r.changes > 0 && known > 0;
}
/** Short, human description of a browser for the "new device" mail (never stored). */
function describeDevice(ua) {
	const s = String(ua || '');
	const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'een browser';
	const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS' : /Mac OS X/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : 'onbekend systeem';
	return `${browser} op ${os}`;
}
/** Tell the administrators once an hour per account that logging in was blocked (only for accounts that exist). */
function notifyLock(email) {
	const u = byEmail(email);
	if (!u) return false;
	const key = `lockmail.${sha(u.email).slice(0, 16)}`;
	const last = db.get('SELECT waarde FROM instellingen WHERE sleutel = ?', key);
	if (last && Date.now() - Number(last.waarde) < 3600 * 1000) return false;
	db.run('INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde', key, String(Date.now()));
	const outbox = require('./outbox');
	for (const a of db.all("SELECT email, naam FROM gebruikers WHERE rol = 'beheerder' AND actief = 1")) outbox.send({ aan: a.email, soort: 'beveiliging', onderwerp: 'Inloggen geblokkeerd na meerdere mislukte pogingen', tekst: `Hallo ${a.naam},\n\nHet account ${u.email} is tijdelijk geblokkeerd voor inloggen na meerdere mislukte pogingen. Dat kan een typfout zijn, maar ook iemand die wachtwoorden probeert.\n\nControleer het auditlog in het beheer als je twijfelt.\n` });
	audit.log({ user: null, actie: 'login.geblokkeerd', entiteit: `gebruiker:${u.id}` });
	return true;
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
	if (action === 'schrijven') return rol === 'beheerder' || rol === 'editor' || rol === 'redacteur';
	if (action === 'publiceren') return rol === 'beheerder' || rol === 'editor';
	if (action === 'beheer') return rol === 'beheerder';
	return false;
};

module.exports = { mfaPolicy, has2fa, peekTicket, passkeyList, passkeyCount, passkeyCredentials, addPasskey, removePasskey, passkeyFor, touchPasskey, newChallenge, takeChallenge, endSession, createToken, findByToken, clearToken, unusablePassword, noteDevice, describeDevice, notifyLock, TOKEN_TTL, setPrefs, subscribers, sessionList, setName, sessionCounts, ROLES, COOKIE, hashPassword, verifyPassword, create, setPassword, update, byId, byEmail, list, count, publicUser, beginTwoFactor, pendingTwoFactor, confirmTwoFactor, regenerateRecovery, recoveryLeft, disableTwoFactor, verifySecondFactor, lockState, failedAttempt, clearAttempts, checkLogin, createTicket, useTicket, endTicket, createSession, getSession, destroySession, destroyOthers, rotateSession, cookieHeader, parseCookies, safeEqual, subnetOf, can, seal, unseal };
