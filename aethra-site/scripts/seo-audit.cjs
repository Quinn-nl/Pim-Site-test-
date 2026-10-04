#!/usr/bin/env node
'use strict';
/**
 * SEO audit and drift check for the Aethra site. Starts the server in-process on a temporary data directory
 * and checks every public page in every language: metadata, headings, canonical, hreflang (self, return tags,
 * x-default), Open Graph, JSON-LD, images, internal links, sitemap, robots, llms.txt, headers and status codes.
 *   node scripts/seo-audit.cjs            report (exit 1 when there are errors)
 *   node scripts/seo-audit.cjs --baseline save seo/baseline.json (the "known good" state)
 *   node scripts/seo-audit.cjs --compare  list changes against that baseline (drift)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aethra-seo-'));
process.env.SITE_URL = process.env.SITE_URL || 'https://aethra.example';
const { createServer } = require('../server');
const { AUDIENCES } = require('../lib/audiences');
if (process.env.SEO_TODAY === '1') { const store = require('../lib/store'); store.ensureDirs(); store.saveContent({ lang: 'en', values: { today_enabled: 'yes' } }); }
const { LANGS } = require('../lib/i18n');
const BASELINE = path.join(__dirname, '..', 'seo', 'baseline.json');

const PAGES = ['/', '/problem', '/how-it-works', '/applications', '/contact', '/privacy', ...AUDIENCES.map((a) => `/for/${a.slug}`)];
if (process.env.SEO_TODAY === '1') PAGES.push('/eco-mode-today'); // the context page, once published
const findings = [];
const add = (level, where, msg) => findings.push({ level, where, msg });

const get = (port, p, headers = {}) => new Promise((resolve, reject) => {
	http.get({ host: '127.0.0.1', port, path: p, headers: { 'accept-encoding': 'identity', ...headers } }, (res) => {
		let body = '';
		res.setEncoding('utf8');
		res.on('data', (c) => { body += c; });
		res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
	}).on('error', reject);
});
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
const attr = (tag, name) => { const m = new RegExp(`${name}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function parse(html) {
	const tags = (re) => html.match(re) || [];
	const metas = tags(/<meta\b[^>]*>/g);
	const meta = (n, key = 'name') => { const t = metas.find((m) => attr(m, key) === n); return t ? decode(attr(t, 'content') || '') : null; };
	const links = tags(/<link\b[^>]*>/g);
	const ld = tags(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g).map((s) => s.replace(/<\/?script[^>]*>/g, ''));
	const main = (/<main[\s\S]*?<\/main>/.exec(html) || [html])[0];
	return {
		title: decode((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || ''),
		description: meta('description'),
		robots: meta('robots'),
		viewport: meta('viewport'),
		canonical: (links.find((l) => attr(l, 'rel') === 'canonical') || '').length ? attr(links.find((l) => attr(l, 'rel') === 'canonical'), 'href') : null,
		hreflang: links.filter((l) => attr(l, 'rel') === 'alternate' && attr(l, 'hreflang')).map((l) => [attr(l, 'hreflang'), attr(l, 'href')]),
		og: Object.fromEntries(metas.filter((m) => (attr(m, 'property') || '').startsWith('og:')).map((m) => [attr(m, 'property'), decode(attr(m, 'content'))])),
		twitter: Object.fromEntries(metas.filter((m) => (attr(m, 'name') || '').startsWith('twitter:')).map((m) => [attr(m, 'name'), decode(attr(m, 'content'))])),
		lang: attr(/<html\b[^>]*>/.exec(html)[0], 'lang'),
		h1: tags(/<h1\b[\s\S]*?<\/h1>/g).map((h) => decode(strip(h)).replace(/\s+/g, ' ').trim()),
		headings: tags(/<h[1-6]\b/g).map((h) => Number(h[2])),
		ld,
		imgs: tags(/<img\b[^>]*>/g),
		anchors: tags(/<a\b[^>]*>/g).map((a) => attr(a, 'href')).filter(Boolean),
		words: decode(strip(main)).split(/\s+/).filter(Boolean).length,
		hash: crypto.createHash('sha256').update(html).digest('hex').slice(0, 16),
	};
}

async function main() {
	const server = createServer();
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const port = server.address().port;
	const site = process.env.SITE_URL;
	const state = {};
	const seen = { title: new Map(), description: new Map() };

	for (const lang of LANGS) {
		for (const page of PAGES) {
			const url = `/${lang}${page === '/' ? '/' : page}`;
			const res = await get(port, url);
			const where = url;
			if (res.status !== 200) { add('error', where, `status ${res.status}`); continue; }
			const p = parse(res.body);
			const canonical = `${site}${url}`;
			if (p.lang !== lang) add('error', where, `html lang is "${p.lang}", expected "${lang}"`);
			if (!p.viewport) add('error', where, 'no viewport meta');
			if (!p.title) add('error', where, 'no title');
			else if (p.title.length > 60) add('warn', where, `title is ${p.title.length} characters (over 60)`);
			else if (p.title.length < 25) add('warn', where, `title is short (${p.title.length})`);
			if (!p.description) add('error', where, 'no meta description');
			else if (p.description.length > 160) add('warn', where, `description is ${p.description.length} characters (over 160)`);
			else if (p.description.length < 70) add('warn', where, `description is short (${p.description.length})`);
			for (const key of ['title', 'description']) {
				const v = p[key];
				if (!v) continue;
				if (seen[key].has(v)) add('error', where, `duplicate ${key} with ${seen[key].get(v)}`);
				else seen[key].set(v, where);
			}
			if (p.h1.length !== 1) add('error', where, `${p.h1.length} H1 elements`);
			for (let i = 1; i < p.headings.length; i++) if (p.headings[i] - p.headings[i - 1] > 1) { add('warn', where, `heading level skips from h${p.headings[i - 1]} to h${p.headings[i]}`); break; }
			if (page !== '/contact' && /noindex/.test(p.robots || '')) add('error', where, 'unexpected noindex');
			if (p.canonical !== canonical) add('error', where, `canonical ${p.canonical} (expected ${canonical})`);
			// hreflang: full mesh, self reference, x-default
			const map = Object.fromEntries(p.hreflang);
			for (const l of LANGS) if (map[l] !== `${site}/${l}${page === '/' ? '/' : page}`) add('error', where, `hreflang ${l} is ${map[l] || 'missing'}`);
			if (!map['x-default']) add('error', where, 'no hreflang x-default');
			// social
			for (const k of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:locale']) if (!p.og[k]) add('warn', where, `missing ${k}`);
			if (p.og['og:image'] && !/^https?:\/\//.test(p.og['og:image'])) add('error', where, 'og:image is not absolute');
			if (!p.twitter['twitter:card']) add('warn', where, 'missing twitter:card');
			// structured data
			const types = [];
			p.ld.forEach((raw) => {
				try {
					const j = JSON.parse(raw);
					const nodes = j['@graph'] || [j];
					nodes.forEach((n) => {
						types.push(n['@type']);
						if (!j['@context'] && !n['@context']) add('error', where, 'JSON-LD without @context');
						if (/^\//.test(n.url || '') || /^\//.test(n.logo || '')) add('error', where, 'JSON-LD has a relative URL');
						if (n['@type'] === 'FAQPage') add('info', where, 'FAQPage: no Google rich result since May 2026; harmless, kept for other engines');
					});
				} catch (e) { add('error', where, 'invalid JSON-LD'); }
			});
			if (!types.includes('Organization') && page === '/') add('warn', where, 'no Organization JSON-LD on the home page');
			// images
			p.imgs.forEach((img) => {
				if (attr(img, 'alt') === null) add('error', where, `image without alt: ${attr(img, 'src')}`);
				if (!attr(img, 'width') || !attr(img, 'height')) add('warn', where, `image without width/height: ${attr(img, 'src')}`);
			});
			// links
			const internal = p.anchors.filter((a) => a.startsWith('/') && !a.startsWith('//'));
			for (const a of new Set(internal)) {
				const target = a.split('#')[0].split('?')[0];
				if (/^\/(css|js|img|fonts|uploads|deck)\//.test(target) || target === '/admin') continue;
				const r = await get(port, target);
				if (r.status >= 400) add('error', where, `broken internal link ${a} (${r.status})`);
				else if (r.status >= 300 && !/^\/($|(problem|how-it-works|applications|contact|privacy)$)/.test(target)) add('warn', where, `internal link ${a} redirects (${r.status})`);
			}
			if (internal.length < 3) add('warn', where, `only ${internal.length} internal links`);
			const minWords = page === '/' ? 150 : 120;
			if (p.words < minWords && page !== '/contact') add('warn', where, `thin page: ${p.words} words in <main>`);
			state[url] = { title: p.title, description: p.description, h1: p.h1[0], canonical: p.canonical, robots: p.robots, ld: types.join(','), words: p.words, hash: p.hash };
		}
	}

	// sitemap, robots, llms, 404, headers
	const sm = await get(port, '/sitemap.xml');
	const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
	const expected = LANGS.flatMap((l) => PAGES.map((p) => `${site}/${l}${p === '/' ? '/' : p}`));
	for (const e of expected) if (!locs.includes(e)) add('error', '/sitemap.xml', `missing ${e}`);
	for (const l of locs) if (!expected.includes(l)) add('warn', '/sitemap.xml', `unexpected ${l}`);
	if (/<priority>|<changefreq>/.test(sm.body)) add('info', '/sitemap.xml', 'priority/changefreq are ignored by Google');
	if (!/xhtml:link/.test(sm.body)) add('warn', '/sitemap.xml', 'no hreflang alternates in the sitemap (the page tags already cover it)');
	if (!/<lastmod>\d{4}-\d{2}-\d{2}/.test(sm.body)) add('warn', '/sitemap.xml', 'no lastmod');
	const rb = await get(port, '/robots.txt');
	if (!/Sitemap: https?:\/\//.test(rb.body)) add('error', '/robots.txt', 'no absolute Sitemap line');
	const star = (/User-agent:\s*\*\s*\n([\s\S]*?)(?:\n\s*\n|$)/.exec(rb.body) || [, ''])[1];
	if (/^Disallow:\s*\/\s*$/m.test(star)) add('error', '/robots.txt', 'blocks the whole site for all crawlers');
	for (const bot of ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Googlebot', 'Bingbot']) if (new RegExp(`User-agent:\\s*${bot}\\b`, 'i').test(rb.body)) add('warn', '/robots.txt', `${bot} has its own rule: check that search access is intended`);
	const ll = await get(port, '/llms.txt');
	if (ll.status !== 200) add('info', '/llms.txt', 'missing (optional; Google ignores it)');
	const nf = await get(port, '/en/does-not-exist');
	if (nf.status !== 404) add('error', '/en/does-not-exist', `unknown URL returns ${nf.status}, expected 404`);
	if (!/noindex/.test(nf.body)) add('info', '/404', '404 page has no noindex (status 404 is enough)');
	const home = await get(port, '/en/');
	for (const h of ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'permissions-policy']) if (!home.headers[h]) add('warn', '/en/', `missing ${h}`);
	const big = Buffer.byteLength(home.body);
	if (big > 200 * 1024) add('warn', '/en/', `HTML is ${Math.round(big / 1024)} KB`);
	const redirect = await get(port, '/', { 'accept-language': 'nl' });
	if (!/\/nl\//.test(redirect.headers.location || '')) add('error', '/', 'bare address does not follow the browser language');
	const css = await get(port, '/css/site.css');
	state.__meta = { pages: Object.keys(state).length, sitemapUrls: locs.length };

	server.close();
	const arg = process.argv[2];
	if (arg === '--baseline') {
		fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
		fs.writeFileSync(BASELINE, JSON.stringify({ at: new Date().toISOString().slice(0, 10), state }, null, 2) + '\n');
		console.log(`Baseline saved: ${Object.keys(state).length - 1} pages.`);
		return 0;
	}
	if (arg === '--compare') {
		if (!fs.existsSync(BASELINE)) { console.log('No baseline yet. Run with --baseline first.'); return 1; }
		const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).state;
		let n = 0;
		for (const k of new Set([...Object.keys(base), ...Object.keys(state)])) {
			if (k === '__meta') continue;
			if (!state[k]) { console.log(`CRITICAL  ${k}: page is gone`); n++; continue; }
			if (!base[k]) { console.log(`INFO      ${k}: new page`); continue; }
			for (const f of ['title', 'description', 'h1', 'canonical', 'robots', 'ld']) {
				if (base[k][f] !== state[k][f]) { console.log(`${['canonical', 'robots'].includes(f) ? 'CRITICAL' : 'WARNING '}  ${k}: ${f} changed\n            was: ${base[k][f]}\n            now: ${state[k][f]}`); n++; }
			}
			if (Math.abs(state[k].words - base[k].words) > base[k].words * 0.3) { console.log(`WARNING   ${k}: word count ${base[k].words} -> ${state[k].words}`); n++; }
		}
		console.log(n ? `${n} change(s) against the baseline.` : 'No SEO drift against the baseline.');
		return 0;
	}
	const order = { error: 0, warn: 1, info: 2 };
	findings.sort((a, b) => order[a.level] - order[b.level]);
	const counts = { error: 0, warn: 0, info: 0 };
	findings.forEach((f) => { counts[f.level]++; console.log(`${f.level.toUpperCase().padEnd(5)} ${f.where}  ${f.msg}`); });
	console.log(`\n${Object.keys(state).length - 1} pages checked, ${counts.error} errors, ${counts.warn} warnings, ${counts.info} notes.`);
	return counts.error ? 1 : 0;
}
main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
