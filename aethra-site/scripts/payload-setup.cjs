#!/usr/bin/env node
'use strict';
/**
 * Fills the Payload CMS with the website's current texts (defaults plus whatever was saved in our own admin),
 * creates the first administrator from payload/.env, and creates the "website" account whose API key the
 * website uses to hand contact messages to the CMS inbox. Safe to run again: it only adds what is missing
 * (use --reseed to overwrite the texts). Payload must be running (npm run cms).
 *   npm run cms:setup
 * Run it before you switch on two-step verification for the administrator.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_FILE = path.join(__dirname, '..', 'payload', '.env');
const env = Object.fromEntries(fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]) : []);
const BASE = `${(process.env.CMS_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '')}/admin2/api`;
const RESEED = process.argv.includes('--reseed');

const { GROUPS } = require('../lib/fields');
const { LANGS } = require('../lib/i18n');
const store = require('../lib/store');
const { globalSlug } = require('../lib/payload-content');

let token = '';
async function api(method, url, body, { allow = [] } = {}) {
	const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
	const text = await res.text();
	let json = null;
	try { json = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
	if (!res.ok && !allow.includes(res.status)) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
	return { status: res.status, data: json };
}

async function main() {
	if (!env.CMS_ADMIN_EMAIL || !env.CMS_ADMIN_PASSWORD) throw new Error('payload/.env needs CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD (run npm run cms:init first)');
	const email = env.CMS_ADMIN_EMAIL;
	const password = env.CMS_ADMIN_PASSWORD;

	// First administrator (the first-run screen does the same), otherwise log in.
	const first = await api('POST', '/users/first-register', { email, password, 'confirm-password': password }, { allow: [400, 401, 403, 404] });
	if (first.status === 200 && first.data && first.data.token) { token = first.data.token; console.log(`Administrator created: ${email}`); }
	else {
		const login = await api('POST', '/users/login', { email, password }, { allow: [400, 401, 403] });
		if (!login.data || !login.data.token) throw new Error('Could not log in as the administrator from payload/.env. If you changed the password or switched on two-step verification, set the new password in payload/.env (or run this before enabling two-step verification).');
		token = login.data.token;
		console.log(`Logged in as ${email}`);
	}

	// Website texts, one global per group, per language.
	let written = 0;
	for (const g of GROUPS) {
		const slug = globalSlug(g.id);
		const current = (await api('GET', `/globals/${slug}?locale=all&depth=0`)).data || {};
		for (const lang of LANGS) {
			const values = store.getContent(lang).values;
			const data = {};
			for (const f of g.fields) {
				const has = current[f.key] && typeof current[f.key] === 'object' && typeof current[f.key][lang] === 'string';
				if (RESEED || !has) data[f.key] = values[f.key] == null ? '' : String(values[f.key]);
			}
			if (Object.keys(data).length) { await api('POST', `/globals/${slug}?locale=${lang}`, data); written++; }
		}
		process.stdout.write('.');
	}
	for (const lang of LANGS) {
		const cur = (await api('GET', '/globals/privacy?locale=all&depth=0')).data || {};
		if (RESEED || !(cur.text && typeof cur.text[lang] === 'string' && cur.text[lang])) { await api('POST', `/globals/privacy?locale=${lang}`, { text: store.getContent(lang).privacy }); written++; }
	}
	console.log(`\nTexts written: ${written} (group x language). Existing texts were left alone${RESEED ? ' except with --reseed' : ''}.`);

	// The website's own account (API key) for the contact inbox.
	let keyWorks = false;
	if (env.CMS_API_KEY) { // a key left over from an earlier database no longer works
		try { const me = await fetch(`${BASE}/users/me`, { headers: { Authorization: `users API-Key ${env.CMS_API_KEY}` } }); const j = await me.json(); keyWorks = !!(j && j.user && j.user.role === 'site'); } catch (e) { keyWorks = false; }
	}
	if (!keyWorks) {
		const siteEmail = 'website@example.com';
		const apiKey = crypto.randomBytes(24).toString('hex');
		const existing = (await api('GET', `/users?where[email][equals]=${encodeURIComponent(siteEmail)}&limit=1`)).data;
		if (existing && existing.docs && existing.docs[0]) await api('PATCH', `/users/${existing.docs[0].id}`, { enableAPIKey: true, apiKey });
		else await api('POST', '/users', { email: siteEmail, password: crypto.randomBytes(18).toString('base64url') + 'aA1!', role: 'site', enableAPIKey: true, apiKey });
		const kept = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('CMS_API_KEY='));
		fs.writeFileSync(ENV_FILE, `${kept.join('\n')}\nCMS_API_KEY=${apiKey}\n`);
		console.log('Created the "website" account; its API key is stored in payload/.env (CMS_API_KEY).');
	}
	console.log('Done. Open /admin2 on the website to edit the content.');
}
main().catch((e) => { console.error(e.message); process.exit(1); });
