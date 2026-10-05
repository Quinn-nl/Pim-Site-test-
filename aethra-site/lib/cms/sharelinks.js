'use strict';
/**
 * Preview links: a secret address that shows an unpublished draft to someone without an account.
 * The token is long and random, only its hash is stored, a link expires (default 7 days) and can be revoked. Anyone who has the link can read the preview:
 * the page says so, is never indexed and is never cached.
 */
const crypto = require('crypto');
const db = require('./db');
const audit = require('./audit');
const { LANGS } = require('../i18n');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const DAYS = [1, 3, 7, 14];

function create({ object, soort, taal, pad = '/', payload, days = 7 }, user, now = Date.now()) {
	if (!['tekst', 'privacy', 'pagina'].includes(soort)) throw Object.assign(new Error('Onbekend onderdeel.'), { status: 400 });
	if (!LANGS.includes(taal)) throw Object.assign(new Error('Onbekende taal.'), { status: 400 });
	const ttl = DAYS.includes(Number(days)) ? Number(days) : 7;
	const token = crypto.randomBytes(32).toString('base64url');
	db.run('INSERT INTO voorbeeld_links (token_hash, object, soort, taal, pad, payload, door, aangemaakt, verloopt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', sha(token), object, soort, taal, String(pad).slice(0, 200), JSON.stringify(payload || {}), user.id, now, now + ttl * 86400000);
	audit.log({ user, actie: 'voorbeeldlink.gemaakt', entiteit: object, nieuw: { dagen: ttl, taal } });
	return { token, verloopt: now + ttl * 86400000 };
}
function find(token, now = Date.now()) {
	if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ''))) return null;
	const r = db.get('SELECT * FROM voorbeeld_links WHERE token_hash = ? AND verloopt > ?', sha(token), now);
	return r ? { ...r, payload: JSON.parse(r.payload) } : null;
}
const active = (now = Date.now()) => db.all('SELECT l.token_hash, l.object, l.soort, l.taal, l.aangemaakt, l.verloopt, g.naam FROM voorbeeld_links l LEFT JOIN gebruikers g ON g.id = l.door WHERE l.verloopt > ? ORDER BY l.aangemaakt DESC', now);
function revoke(hash, user) {
	const r = db.run('DELETE FROM voorbeeld_links WHERE token_hash = ?', String(hash));
	if (r.changes) audit.log({ user, actie: 'voorbeeldlink.ingetrokken', entiteit: 'voorbeeldlink' });
	return r.changes > 0;
}
const purgeExpired = (now = Date.now()) => db.run('DELETE FROM voorbeeld_links WHERE verloopt < ?', now - 86400000).changes;
module.exports = { create, find, active, revoke, purgeExpired, DAYS };
