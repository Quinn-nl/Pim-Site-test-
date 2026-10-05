'use strict';
/** Permanent redirects. Created automatically when a page address changes; checked by the router before it answers 404. */
const db = require('./db');
const audit = require('./audit');

const clean = (p) => String(p || '').split('?')[0].replace(/\/+$/, '') || '/';

function add(van, naar, user = null) {
	van = clean(van); naar = clean(naar);
	if (van === naar || !/^\/[a-z]{2}\/[a-z0-9-]+$/.test(van) || !/^\/[a-z]{2}\/[a-z0-9-]+$/.test(naar)) return false;
	db.tx(() => {
		db.run('DELETE FROM redirects WHERE van = ?', naar); // the new address is real again: no loop
		db.run('UPDATE redirects SET naar = ? WHERE naar = ?', naar, van); // shorten chains: a -> b becomes a -> c when b moves to c
		db.run('INSERT INTO redirects (van, naar) VALUES (?, ?) ON CONFLICT(van) DO UPDATE SET naar = excluded.naar', van, naar);
	});
	audit.log({ user, actie: 'redirect.aangemaakt', entiteit: van, nieuw: naar });
	return true;
}
function find(pathname) {
	const r = db.get('SELECT naar FROM redirects WHERE van = ?', clean(pathname));
	if (r) db.run('UPDATE redirects SET hits = hits + 1 WHERE van = ?', clean(pathname));
	return r ? r.naar : null;
}
const list = () => db.all('SELECT * FROM redirects ORDER BY aangemaakt DESC');
function remove(van, user) { db.run('DELETE FROM redirects WHERE van = ?', van); audit.log({ user, actie: 'redirect.verwijderd', entiteit: van }); }
/** A page is published again at this address: a redirect that pointed away from it must go. */
const clearFor = (pad) => db.run('DELETE FROM redirects WHERE van = ?', clean(pad));

module.exports = { add, find, list, remove, clearFor, clean };
