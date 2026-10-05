'use strict';
/** In-memory micro-cache for public HTML. Entries are dropped on publish; a TTL and a size cap keep it small. */
const store = new Map();
const MAX = 600;
const TTL = 10 * 60 * 1000;
let hits = 0, misses = 0;

function get(key) {
	const e = store.get(key);
	if (!e) { misses += 1; return null; }
	if (e.expires < Date.now()) { store.delete(key); misses += 1; return null; }
	hits += 1;
	return e.value;
}
/** Survivability: returns an entry even when it is past its TTL (used while the database is down). */
const getStale = (key) => { const e = store.get(key); return e ? e.value : null; };
function set(key, value) {
	if (store.size >= MAX) store.delete(store.keys().next().value);
	store.set(key, { value, expires: Date.now() + TTL });
}
const del = (key) => store.delete(key);
/** Removes every key that starts with the prefix (no prefix: everything). */
const listeners = [];
/** For things that are derived from the public pages (the SEO overview): they forget their copy when anything is published. */
const onInvalidate = (fn) => { listeners.push(fn); };
function invalidate(prefix = '') {
	for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
	for (const fn of listeners) { try { fn(); } catch (e) { /* a listener never breaks publishing */ } }
}
const stats = () => ({ size: store.size, hits, misses });

module.exports = { onInvalidate, get, getStale, set, delete: del, invalidate, stats };
