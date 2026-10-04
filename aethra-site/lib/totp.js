'use strict';
/** TOTP (RFC 6238: HMAC-SHA1, 30 s steps, 6 digits) without dependencies. Works with every authenticator app. */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

function base32(buf) {
	let bits = 0, value = 0, out = '';
	for (const byte of buf) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
	}
	if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
	return out;
}

function fromBase32(str) {
	let bits = 0, value = 0;
	const out = [];
	for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
		value = (value << 5) | ALPHABET.indexOf(ch);
		bits += 5;
		if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
	}
	return Buffer.from(out);
}

const newSecret = () => base32(crypto.randomBytes(20));

function codeAt(secret, step) {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(step));
	const h = crypto.createHmac('sha1', fromBase32(secret)).update(counter).digest();
	const o = h[h.length - 1] & 15;
	const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
	return String(n % 1000000).padStart(6, '0');
}

/** Returns the matching time step (so the caller can refuse a replay) or null. Accepts one step of clock drift either way. */
function verify(secret, code, now = Date.now()) {
	const given = String(code || '').replace(/\s+/g, '');
	if (!/^\d{6}$/.test(given)) return null;
	const current = Math.floor(now / 1000 / STEP);
	let found = null;
	for (const step of [current - 1, current, current + 1]) {
		const expected = codeAt(secret, step);
		if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) found = step;
	}
	return found;
}

const uri = (secret, account, issuer) => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;

module.exports = { newSecret, verify, codeAt, uri, base32, fromBase32, STEP };
