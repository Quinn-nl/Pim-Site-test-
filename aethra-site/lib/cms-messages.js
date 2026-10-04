'use strict';
/**
 * Hands contact messages to the Payload CMS inbox (collection "messages") with the website's own API key, and
 * removes them there again when they are deleted here or pass the retention period. Best effort: the message is
 * always stored in our own inbox first, and a CMS outage never blocks a visitor. Logs contain no personal data.
 * Needs CMS_URL and CMS_API_KEY (written to payload/.env by `npm run cms:setup`).
 */
const PREFIX = '/admin2';
const enabled = () => !!(process.env.CMS_URL && process.env.CMS_API_KEY);
const base = () => `${process.env.CMS_URL.replace(/\/+$/, '')}${PREFIX}/api`;
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `users API-Key ${process.env.CMS_API_KEY}` });
const signal = () => AbortSignal.timeout(8000);

async function push(m, fetchFn = fetch) {
	if (!enabled()) return false;
	try {
		const res = await fetchFn(`${base()}/messages`, { method: 'POST', headers: headers(), signal: signal(), body: JSON.stringify({ name: m.name, email: m.email, organisation: m.org || '', role: m.role || '', message: m.message, language: m.lang || '', source: m.source && m.source !== 'direct' ? `${m.source}${m.campaign ? ' / ' + m.campaign : ''}` : '', receivedAt: m.at || new Date().toISOString(), externalId: m.id }) });
		if (!res.ok) console.error(`CMS inbox: message not stored (HTTP ${res.status})`);
		return res.ok;
	} catch (e) {
		console.error(`CMS inbox unreachable: ${e.message}`);
		return false;
	}
}

async function remove(externalId, fetchFn = fetch) {
	if (!enabled() || !externalId) return false;
	try {
		const res = await fetchFn(`${base()}/messages?where[externalId][equals]=${encodeURIComponent(externalId)}`, { method: 'DELETE', headers: headers(), signal: signal() });
		return res.ok;
	} catch (e) {
		return false;
	}
}

/** Deletes inbox messages older than the retention period (run now and then). */
async function purge(retentionDays, fetchFn = fetch) {
	if (!enabled()) return false;
	try {
		const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
		const res = await fetchFn(`${base()}/messages?where[receivedAt][less_than]=${encodeURIComponent(cutoff)}`, { method: 'DELETE', headers: headers(), signal: signal() });
		return res.ok;
	} catch (e) {
		return false;
	}
}

module.exports = { enabled, push, remove, purge };
