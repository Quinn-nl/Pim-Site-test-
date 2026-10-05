'use strict';
/**
 * WebAuthn (passkeys and security keys) as a second step, without dependencies: a small CBOR reader, the authenticator data layout and the
 * signature checks with node:crypto. Attestation is not used ("none": we trust the key on first use, as most sites do); what we check is that
 * the browser signed OUR challenge for OUR origin and relying-party id, that the user was present, and that the signature counter never goes back.
 * Algorithms: ES256 (-7, the common one) and RS256 (-257, some Windows Hello setups).
 */
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();
const fail = (message) => Object.assign(new Error(message), { status: 400 });

/* ---- CBOR: just enough (unsigned/negative integers, byte and text strings, arrays, maps, simple values) ---- */
function cbor(buf) {
	let i = 0;
	const need = (n) => { if (i + n > buf.length) throw fail('Ongeldige gegevens van de beveiligingssleutel.'); };
	const num = (info) => {
		if (info < 24) return info;
		if (info === 24) { need(1); return buf[i++]; }
		if (info === 25) { need(2); const v = buf.readUInt16BE(i); i += 2; return v; }
		if (info === 26) { need(4); const v = buf.readUInt32BE(i); i += 4; return v; }
		throw fail('Niet ondersteunde gegevens van de beveiligingssleutel.');
	};
	function item(depth = 0) {
		if (depth > 8) throw fail('Te diep geneste gegevens.');
		need(1);
		const first = buf[i++];
		const major = first >> 5; const info = first & 31;
		if (major === 0) return num(info);
		if (major === 1) return -1 - num(info);
		if (major === 2 || major === 3) { const n = num(info); need(n); const v = buf.subarray(i, i + n); i += n; return major === 2 ? Buffer.from(v) : v.toString('utf8'); }
		if (major === 4) { const n = num(info); if (n > 64) throw fail('Te grote lijst.'); return Array.from({ length: n }, () => item(depth + 1)); }
		if (major === 5) { const n = num(info); if (n > 64) throw fail('Te grote tabel.'); const m = new Map(); for (let k = 0; k < n; k += 1) { const key = item(depth + 1); m.set(key, item(depth + 1)); } return m; }
		if (major === 7) { if (info === 20) return false; if (info === 21) return true; if (info === 22) return null; }
		throw fail('Niet ondersteunde gegevens van de beveiligingssleutel.');
	}
	const value = item();
	return { value, rest: buf.subarray(i) };
}

/* ---- authenticator data ---- */
function parseAuthData(buf) {
	if (buf.length < 37) throw fail('De gegevens van de beveiligingssleutel zijn te kort.');
	const flags = buf[32];
	const out = { rpIdHash: buf.subarray(0, 32), flags, up: !!(flags & 1), uv: !!(flags & 4), at: !!(flags & 64), counter: buf.readUInt32BE(33) };
	if (out.at) {
		if (buf.length < 55) throw fail('De gegevens van de beveiligingssleutel zijn te kort.');
		const idLen = buf.readUInt16BE(53);
		if (idLen < 1 || idLen > 1023 || buf.length < 55 + idLen) throw fail('Ongeldig sleutelnummer.');
		out.credentialId = Buffer.from(buf.subarray(55, 55 + idLen));
		out.coseKey = cbor(buf.subarray(55 + idLen)).value;
	}
	return out;
}

/** COSE key -> { jwk, alg } for ES256 and RS256, checked by loading it. */
function coseToJwk(m) {
	if (!(m instanceof Map)) throw fail('Ongeldige publieke sleutel.');
	const kty = m.get(1); const alg = m.get(3);
	if (kty === 2 && alg === -7 && m.get(-1) === 1 && Buffer.isBuffer(m.get(-2)) && Buffer.isBuffer(m.get(-3))) {
		const jwk = { kty: 'EC', crv: 'P-256', x: b64u(m.get(-2)), y: b64u(m.get(-3)) };
		crypto.createPublicKey({ key: jwk, format: 'jwk' });
		return { jwk, alg: -7 };
	}
	if (kty === 3 && alg === -257 && Buffer.isBuffer(m.get(-1)) && Buffer.isBuffer(m.get(-2))) {
		const jwk = { kty: 'RSA', n: b64u(m.get(-1)), e: b64u(m.get(-2)) };
		crypto.createPublicKey({ key: jwk, format: 'jwk' });
		return { jwk, alg: -257 };
	}
	throw fail('Dit type beveiligingssleutel wordt niet ondersteund (ES256 of RS256 is nodig).');
}

function checkClientData(clientDataJSON, { type, challenge, origin }) {
	let cd;
	try { cd = JSON.parse(Buffer.from(clientDataJSON).toString('utf8')); } catch (e) { throw fail('Ongeldige gegevens van de browser.'); }
	if (cd.type !== type) throw fail('Verkeerd soort verzoek van de beveiligingssleutel.');
	const a = Buffer.from(String(cd.challenge || '')); const b = Buffer.from(String(challenge));
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw fail('De controlecode klopt niet (verlopen of opnieuw gebruikt). Probeer het opnieuw.');
	if (cd.origin !== origin) throw fail('Deze beveiligingssleutel is voor een ander adres aangemaakt.');
	if (cd.crossOrigin === true) throw fail('Een beveiligingssleutel uit een ander venster wordt niet geaccepteerd.');
}
function checkRp(authData, rpId) {
	if (!crypto.timingSafeEqual(authData.rpIdHash, sha256(Buffer.from(rpId)))) throw fail('Deze beveiligingssleutel hoort bij een ander adres.');
	if (!authData.up) throw fail('De beveiligingssleutel is niet aangeraakt of bevestigd.');
}

/** Registration: { clientDataJSON, attestationObject } (base64url) -> { credentialId, jwk, alg, counter } */
function verifyRegistration({ clientDataJSON, attestationObject }, { challenge, origin, rpId }) {
	checkClientData(fromB64u(clientDataJSON), { type: 'webauthn.create', challenge, origin });
	const att = cbor(fromB64u(attestationObject)).value;
	if (!(att instanceof Map) || !Buffer.isBuffer(att.get('authData'))) throw fail('Ongeldige gegevens van de beveiligingssleutel.');
	const ad = parseAuthData(att.get('authData'));
	checkRp(ad, rpId);
	if (!ad.at || !ad.credentialId) throw fail('De beveiligingssleutel stuurde geen sleutel mee.');
	const { jwk, alg } = coseToJwk(ad.coseKey);
	return { credentialId: b64u(ad.credentialId), jwk, alg, counter: ad.counter };
}

/** Sign-in: returns the new counter. `stored` = { jwk, alg, teller }. */
function verifyAssertion({ clientDataJSON, authenticatorData, signature }, { challenge, origin, rpId }, stored) {
	const cdj = fromB64u(clientDataJSON);
	checkClientData(cdj, { type: 'webauthn.get', challenge, origin });
	const authBuf = fromB64u(authenticatorData);
	const ad = parseAuthData(authBuf);
	checkRp(ad, rpId);
	const key = crypto.createPublicKey({ key: stored.jwk, format: 'jwk' });
	const data = Buffer.concat([authBuf, sha256(cdj)]);
	const sig = fromB64u(signature);
	const ok = stored.alg === -7 ? crypto.verify('sha256', data, { key, dsaEncoding: 'der' }, sig) : stored.alg === -257 ? crypto.verify('sha256', data, key, sig) : false;
	if (!ok) throw fail('De handtekening van de beveiligingssleutel klopt niet.');
	// A counter that does not go up means the key may have been copied. (Many keys always report 0: then there is nothing to compare.)
	if ((ad.counter !== 0 || stored.teller !== 0) && ad.counter <= stored.teller) throw fail('Deze beveiligingssleutel lijkt gekopieerd te zijn en wordt geweigerd. Neem contact op met een beheerder.');
	return { counter: ad.counter, userVerified: ad.uv };
}

const newChallenge = () => b64u(crypto.randomBytes(32));
module.exports = { cbor, parseAuthData, coseToJwk, verifyRegistration, verifyAssertion, newChallenge, b64u, fromB64u };
