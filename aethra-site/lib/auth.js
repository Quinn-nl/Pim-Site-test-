'use strict';
/** Public-side helpers: cookies and the signed token of the contact form. Logging in to the admin is in lib/cms/users.js. */
const crypto = require('crypto');
const store = require('./store');

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

module.exports = { parseCookies, safeEqual, formToken, inspectFormToken, checkFormToken };
