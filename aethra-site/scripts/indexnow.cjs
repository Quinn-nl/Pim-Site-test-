#!/usr/bin/env node
'use strict';
/**
 * Tell Bing, Yandex and other IndexNow search engines about the site's URLs (Google ignores IndexNow).
 * Needs SITE_URL (https://your-domain) and INDEXNOW_KEY (8-128 letters, digits or dashes; the site then serves
 * /<key>.txt as proof of ownership). Reads the URLs from the live /sitemap.xml. Run after a release:
 *   SITE_URL=https://aethra.example INDEXNOW_KEY=abc12345 npm run indexnow
 */
const https = require('https');
const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
const key = process.env.INDEXNOW_KEY || '';
if (!/^https:\/\//.test(site) || !/^[A-Za-z0-9-]{8,128}$/.test(key)) {
	console.error('Set SITE_URL (https://...) and INDEXNOW_KEY (8-128 letters, digits or dashes).');
	process.exit(1);
}
const request = (url, { method = 'GET', body, headers = {} } = {}) => new Promise((resolve, reject) => {
	const req = https.request(url, { method, headers, timeout: 20000 }, (res) => {
		let data = '';
		res.setEncoding('utf8');
		res.on('data', (c) => { data += c; });
		res.on('end', () => resolve({ status: res.statusCode, body: data }));
	});
	req.on('error', reject);
	req.on('timeout', () => req.destroy(new Error('timeout')));
	if (body) req.write(body);
	req.end();
});
(async () => {
	const sm = await request(`${site}/sitemap.xml`);
	if (sm.status !== 200) throw new Error(`sitemap returned ${sm.status}`);
	const urlList = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
	const host = new URL(site).host;
	const payload = JSON.stringify({ host, key, keyLocation: `${site}/${key}.txt`, urlList });
	const res = await request('https://api.indexnow.org/IndexNow', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) } });
	console.log(`IndexNow: ${urlList.length} URLs submitted, response ${res.status}${res.status === 200 || res.status === 202 ? ' (accepted)' : ''}.`);
	process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
