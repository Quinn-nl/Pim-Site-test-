'use strict';
/**
 * Link check. Internal links are verified against the site itself (pages, uploads, redirects), external links with a HEAD request
 * (falling back to GET). External checks refuse private and local addresses and never follow redirects, so an address typed into a page can
 * not be used to probe the server's own network.
 */
const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const seo = require('./seo');
const store = require('../store');
const redirects = require('./redirects');
const views = require('../views');
const render = require('./render');
const { LANGS } = require('../i18n');

let running = false;
const isRunning = () => running;
const STATIC = /^\/(css|js|img|fonts)\//;

const privateIp = (ip) => {
	if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
	const v = ip.toLowerCase();
	return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:') ;
};
async function safeHost(host) {
	if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
	if (net.isIP(host)) return !privateIp(host);
	try { const addrs = await dns.lookup(host, { all: true }); return addrs.length > 0 && addrs.every((a) => !privateIp(a.address)); } catch (e) { return false; }
}

/** Does this path of our own site resolve? Returns { status, note }. */
function internalStatus(pathname, known) {
	if (known.has(pathname)) return { status: 200 };
	if (STATIC.test(pathname)) return { status: fs.existsSync(path.join(__dirname, '../../public', pathname)) ? 200 : 404 };
	if (pathname.startsWith('/uploads/')) return { status: fs.existsSync(path.join(store.uploadsDir(), path.basename(pathname))) ? 200 : 404 };
	if (pathname.startsWith('/admin')) return { status: 200 };
	let to = null;
	try { to = redirects.find(pathname); } catch (e) { /* no table */ }
	if (to) return { status: 301, note: `stuurt door naar ${to}` };
	if (['/robots.txt', '/sitemap.xml', '/llms.txt', '/healthz', '/favicon.ico'].includes(pathname)) return { status: 200 };
	return { status: 404 };
}

async function checkExternal(url, fetcher, timeoutMs) {
	let u;
	try { u = new URL(url); } catch (e) { return { status: null, fout: 'ongeldige link' }; }
	if (!/^https?:$/.test(u.protocol)) return { status: null, fout: 'niet gecontroleerd' };
	if (!(await safeHost(u.hostname))) return { status: null, fout: 'adres wordt niet gecontroleerd (lokaal of niet gevonden)' };
	for (const method of ['HEAD', 'GET']) {
		try {
			const res = await fetcher(url, { method, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'AethraLinkCheck/1.0 (+site owner check)' } });
			if (method === 'HEAD' && [403, 405, 501].includes(res.status)) continue;
			return { status: res.status, fout: null };
		} catch (e) { if (method === 'GET') return { status: null, fout: e.name === 'TimeoutError' ? 'reageert niet (time-out)' : 'niet bereikbaar' }; }
	}
	return { status: null, fout: 'niet bereikbaar' };
}

/**
 * One full run. opts: { fetcher, timeoutMs, maxExternal, concurrency, now }. Results replace the previous run.
 * Returns { intern, extern, kapot }.
 */
async function run({ fetcher = fetch, timeoutMs = 8000, maxExternal = 200, concurrency = 5, now = Date.now() } = {}) {
	if (running) return null;
	running = true;
	try {
		const on = seo.todayOn();
		const rows = [];
		const known = new Set();
		for (const t of seo.targets()) known.add(`/${t.lang}${t.path === '/' ? '' : t.path}`), known.add(`/${t.lang}${t.path}/`);
		for (const l of LANGS) known.add(`/${l}/`);
		const internal = [];
		const external = new Map();
		for (const t of seo.targets()) {
			const r = render.renderPublic(t.lang, t.path, seo.siteUrl(), on);
			if (!r) continue;
			const source = `/${t.lang}${t.path === '/' ? '/' : t.path}`;
			for (const { href } of seo.inspect(r.html).links) {
				if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
				if (/^https?:\/\//i.test(href)) {
					let u; try { u = new URL(href); } catch (e) { continue; }
					const own = seo.siteUrl() !== 'http://localhost' && u.origin === new URL(seo.siteUrl()).origin;
					if (own) internal.push({ source, pathname: u.pathname }); else (external.get(href) || external.set(href, []).get(href)).push(source);
				} else if (href.startsWith('/')) internal.push({ source, pathname: href.split(/[?#]/)[0] });
			}
		}
		const seen = new Set();
		for (const l of internal) {
			const key = `${l.source}|${l.pathname}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const st = internalStatus(l.pathname, known);
			rows.push({ bron: l.source, url: l.pathname, soort: 'intern', status: st.status, fout: st.note || (st.status === 404 ? 'bestaat niet' : null) });
		}
		const urls = [...external.keys()].slice(0, maxExternal);
		let i = 0;
		await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
			while (i < urls.length) {
				const url = urls[i++];
				const res = await checkExternal(url, fetcher, timeoutMs);
				for (const source of [...new Set(external.get(url))]) rows.push({ bron: source, url, soort: 'extern', status: res.status, fout: res.fout || (res.status >= 400 ? 'foutmelding van de andere site' : null) });
			}
		}));
		const stamp = new Date(now).toISOString();
		// An external link counts as broken only after it failed in at least two checks that were a day or more apart.
		const before = new Map(db.all('SELECT url, MIN(reeks) AS reeks, MIN(eerste_fout) AS eerste, MAX(gecontroleerd) AS laatst FROM link_resultaten WHERE soort = \'extern\' GROUP BY url').map((r) => [r.url, r]));
		for (const r of rows) {
			const failed = r.status === null ? !!r.fout && r.fout !== 'niet gecontroleerd' : r.status >= 400;
			if (r.soort === 'intern') { r.reeks = failed ? 2 : 0; r.eerste = failed ? stamp : null; continue; }
			if (!failed) { r.reeks = 0; r.eerste = null; continue; }
			const prev = before.get(r.url);
			if (!prev || !prev.reeks) { r.reeks = 1; r.eerste = stamp; } else { r.eerste = prev.eerste || stamp; r.reeks = now - Date.parse(prev.laatst) >= 20 * 3600 * 1000 ? prev.reeks + 1 : prev.reeks; }
		}
		db.tx(() => {
			db.run('DELETE FROM link_resultaten');
			for (const r of rows) db.run('INSERT INTO link_resultaten (bron, url, soort, status, fout, gecontroleerd, reeks, eerste_fout) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', r.bron, r.url, r.soort, r.status, r.fout, stamp, r.reeks, r.eerste);
			db.run("INSERT INTO instellingen (sleutel, waarde) VALUES ('links_laatst', ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde", stamp);
		});
		return { intern: rows.filter((r) => r.soort === 'intern').length, extern: rows.filter((r) => r.soort === 'extern').length, kapot: rows.filter(isBroken).length, twijfel: rows.filter(isDoubtful).length };
	} finally { running = false; }
}
const results = () => db.all('SELECT * FROM link_resultaten ORDER BY (status IS NULL OR status >= 400) DESC, soort, url');
const lastRun = () => { const r = db.get("SELECT waarde FROM instellingen WHERE sleutel = 'links_laatst'"); return r ? r.waarde : null; };
const failedNow = (r) => (r.status === null ? !!r.fout && r.fout !== 'niet gecontroleerd' : r.status >= 400);
/** Broken: an own address that does not exist, or an external link that failed in two checks a day or more apart. */
const isBroken = (r) => failedNow(r) && (r.soort === 'intern' || (r.reeks || 0) >= 2);
/** Failed once: wait for the next check before calling it broken. */
const isDoubtful = (r) => failedNow(r) && r.soort === 'extern' && (r.reeks || 0) < 2;
const brokenCount = () => results().filter(isBroken).length;

module.exports = { run, results, lastRun, isRunning, isBroken, isDoubtful, brokenCount, internalStatus, safeHost, privateIp };
