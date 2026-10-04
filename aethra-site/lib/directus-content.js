'use strict';
/**
 * Optional content source: the website texts live in Directus (collection site_content, one row per language)
 * and are pulled in the background with a read-only token. If Directus is unreachable the last good copy (or
 * our own saved content) keeps serving, so the public site never depends on it being up.
 * Enable with CONTENT_SOURCE=directus, DIRECTUS_URL and DIRECTUS_TOKEN (the site-reader token from directus/.env).
 */
const store = require('./store');

const POLL_MS = Math.max(5000, Number(process.env.DIRECTUS_POLL_MS) || 15000);
let timer = null;

async function refresh(fetchFn = fetch) {
	const base = String(process.env.DIRECTUS_URL || '').replace(/\/+$/, '');
	const token = process.env.DIRECTUS_TOKEN || '';
	if (!base || !token) throw new Error('DIRECTUS_URL and DIRECTUS_TOKEN are required');
	const res = await fetchFn(`${base}/items/site_content?limit=-1`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
	if (!res.ok) throw new Error(`Directus answered ${res.status}`);
	const rows = ((await res.json()).data) || [];
	const map = {};
	for (const row of rows) if (row && /^[a-z]{2}$/.test(row.language)) map[row.language] = row;
	store.setRemote(map);
	// Pages made in Directus (collection "pages"). Optional: when it is missing or not readable yet, there are simply no extra pages.
	try {
		const pr = await fetchFn(`${base}/items/pages?filter[status][_eq]=published&limit=-1`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
		store.setRemotePages(pr.ok ? ((await pr.json()).data || []) : []);
	} catch (e) {
		store.setRemotePages([]);
	}
	return Object.keys(map);
}

function start() {
	if (process.env.CONTENT_SOURCE !== 'directus') return false;
	let failing = '';
	const tick = () => refresh().then(() => { if (failing) console.log('Directus content refresh recovered'); failing = ''; }).catch((e) => { if (failing !== e.message) console.error(`Directus content refresh failed (keeping the last copy): ${e.message}`); failing = e.message; });
	tick();
	timer = setInterval(tick, POLL_MS);
	timer.unref();
	return true;
}

const stop = () => { if (timer) clearInterval(timer); timer = null; };

module.exports = { start, stop, refresh };
