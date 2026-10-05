'use strict';
/**
 * Cookieless, first-party page-view statistics.
 * Stores only daily totals per (event, language, page, source, campaign). No IP address, user agent,
 * cookie or visitor identifier is ever recorded, and visitors who send Do Not Track or Global Privacy
 * Control are not counted at all. Unique visitors cannot be measured this way, by design.
 */
const store = require('./store');

const KEEP_DAYS = 400;
const MAX_KEYS_PER_DAY = 3000;
let buffer = {};
let timer = null;

const today = () => new Date().toISOString().slice(0, 10);
const tag = (s, max = 40) => String(s || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, max);

/** UTM tags win; otherwise the host of an external referrer; otherwise "direct". */
function sourceOf(url, referer, ownHost) {
	const utm = tag(url.searchParams.get('utm_source'));
	const campaign = tag(url.searchParams.get('utm_campaign'));
	if (utm) return { source: utm, campaign };
	try {
		const host = new URL(referer).hostname.replace(/^www\./, '').toLowerCase();
		if (host && host !== String(ownHost).split(':')[0].replace(/^www\./, '')) return { source: tag(host, 60) || 'direct', campaign };
	} catch (e) { /* no or malformed referrer */ }
	return { source: 'direct', campaign };
}

/** Only real browser navigations count; crawlers, prefetches and privacy signals are ignored. */
function countable(req) {
	const h = req.headers;
	if (h.dnt === '1' || h['sec-gpc'] === '1') return false;
	if (h['sec-purpose'] || h['purpose']) return false;
	return h['sec-fetch-dest'] === 'document' && h['sec-fetch-mode'] === 'navigate';
}

function record(kind, { lang, page, source = 'direct', campaign = '' }, n = 1) {
	const d = today();
	const bucket = (buffer[d] = buffer[d] || {});
	let key = [kind, lang, page, source, campaign].join('|');
	if (!(key in bucket) && Object.keys(bucket).length >= MAX_KEYS_PER_DAY) key = [kind, lang, page, 'other', ''].join('|');
	bucket[key] = (bucket[key] || 0) + n;
	if (!timer) { timer = setTimeout(() => { timer = null; flush(); }, 30000); timer.unref(); }
}

function flush() {
	if (!Object.keys(buffer).length) return;
	const data = store.readJson('stats.json', { days: {} });
	for (const [d, keys] of Object.entries(buffer)) {
		const day = (data.days[d] = data.days[d] || {});
		for (const [k, n] of Object.entries(keys)) day[k] = (day[k] || 0) + n;
	}
	buffer = {};
	const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
	for (const d of Object.keys(data.days)) if (d < cutoff) delete data.days[d];
	store.writeJson('stats.json', data);
}

/** Aggregates the last `days` days for the dashboard. */
function summary(days = 30, offset = 0) {
	flush();
	const data = store.readJson('stats.json', { days: {} });
	const list = [];
	for (let i = days - 1 + offset; i >= offset; i--) list.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
	const out = { days: list, perDay: list.map(() => 0), views: 0, contactViews: 0, sent: 0, pages: {}, sources: {}, langs: {}, roles: {} };
	const add = (obj, k, n) => { obj[k] = (obj[k] || 0) + n; };
	list.forEach((d, idx) => {
		for (const [key, n] of Object.entries(data.days[d] || {})) {
			const [kind, lang, page, source, campaign] = key.split('|');
			if (kind === 'v') {
				out.views += n; out.perDay[idx] += n;
				add(out.pages, page, n); add(out.langs, lang, n);
				add(out.sources, campaign ? `${source} / ${campaign}` : source, n);
				if (page === '/contact') out.contactViews += n;
			} else if (kind === 's') {
				out.sent += n; add(out.roles, page, n);
			}
		}
	});
	return out;
}

module.exports = { sourceOf, countable, record, flush, summary, tag };
