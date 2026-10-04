#!/usr/bin/env node
'use strict';
/**
 * Builds the Aethra content model in Directus from lib/fields.js and fills it with the current content
 * (defaults plus whatever was saved in our own admin). Safe to run again: it only adds what is missing and
 * updates the values of existing rows only with --reseed.
 *   npm run directus:setup            (Directus must be running; reads directus/.env)
 * Also creates a read-only "site-reader" user whose static token the website uses (printed once, stored in
 * directus/.env as SITE_READER_TOKEN) when CONTENT_SOURCE=directus.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_FILE = path.join(__dirname, '..', 'directus', '.env');
const env = Object.fromEntries(fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]) : []);
const BASE = (process.env.DIRECTUS_URL || `http://127.0.0.1:${env.PORT || 8055}`).replace(/\/+$/, '');
const RESEED = process.argv.includes('--reseed');

const { GROUPS } = require('../lib/fields');
const { LANGS, LANG_NAMES, defaultsFor } = require('../lib/i18n');
const store = require('../lib/store');

let token = '';
async function api(method, url, body, { allow = [] } = {}) {
	const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
	const text = await res.text();
	let json = null;
	try { json = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
	if (!res.ok && !allow.includes(res.status)) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
	return { status: res.status, data: json && json.data };
}

const typeOf = (f) => (f.type === 'textarea' ? { type: 'text', interface: 'input-multiline' } : { type: 'string', interface: 'input' });

async function main() {
	if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error('directus/.env needs ADMIN_EMAIL and ADMIN_PASSWORD');
	token = (await api('POST', '/auth/login', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD })).data.access_token;
	console.log('Logged in to Directus.');

	const existing = await api('GET', '/collections/site_content', null, { allow: [403, 404] });
	if (existing.status === 200) {
		console.log('Collection site_content exists: skipping model creation.');
	} else {
		await api('POST', '/collections', {
			collection: 'site_content',
			meta: { icon: 'article', note: 'One row per language. Edit the texts of the website here.', display_template: '{{language}}', singleton: false, sort_field: null },
			schema: {},
			fields: [{ field: 'id', type: 'integer', meta: { hidden: true, readonly: true, interface: 'input' }, schema: { is_primary_key: true, has_auto_increment: true } }],
		});
		await api('POST', '/fields/site_content', { field: 'language', type: 'string', schema: { is_unique: true, is_nullable: false }, meta: { interface: 'select-dropdown', width: 'half', required: true, sort: 1, note: 'Language of this row', options: { choices: LANGS.map((l) => ({ text: LANG_NAMES[l], value: l })) } } });
		let sort = 2;
		for (const g of GROUPS) {
			const gid = `g_${g.id}`;
			await api('POST', '/fields/site_content', { field: gid, type: 'alias', schema: null, meta: { interface: 'group-detail', special: ['alias', 'no-data', 'group'], sort: sort++, width: 'full', options: { start: g.id === 'site' ? 'open' : 'closed' }, translations: [{ language: 'en-US', translation: g.title }] } });
			for (const f of g.fields) {
				const t = typeOf(f);
				await api('POST', '/fields/site_content', { field: f.key, type: t.type, schema: { is_nullable: true }, meta: { interface: t.interface, group: gid, width: f.type === 'textarea' ? 'full' : 'half', sort: sort++, note: f.label, translations: [{ language: 'en-US', translation: f.label }] } });
			}
			process.stdout.write('.');
		}
		await api('POST', '/fields/site_content', { field: 'privacy', type: 'text', schema: { is_nullable: true }, meta: { interface: 'input-multiline', width: 'full', sort: sort++, note: 'Privacy statement (blank line = new paragraph, "# " = heading)', translations: [{ language: 'en-US', translation: 'Privacy statement' }] } });
		console.log('\nContent model created.');
	}

	// Rows: current defaults merged with what was saved in our own admin.
	const rows = (await api('GET', '/items/site_content?fields=id,language&limit=-1')).data || [];
	for (const lang of LANGS) {
		const c = store.getContent(lang);
		const values = {};
		for (const g of GROUPS) for (const f of g.fields) values[f.key] = c.values[f.key] == null ? '' : String(c.values[f.key]);
		const payload = { language: lang, privacy: c.privacy, ...values };
		const row = rows.find((r) => r.language === lang);
		if (!row) { await api('POST', '/items/site_content', payload); console.log(`Row ${lang}: created`); }
		else if (RESEED) { await api('PATCH', `/items/site_content/${row.id}`, payload); console.log(`Row ${lang}: reseeded`); }
		else console.log(`Row ${lang}: exists (use --reseed to overwrite)`);
	}

	// Read-only user for the website.
	if (!env.SITE_READER_TOKEN) {
		const policy = (await api('POST', '/policies', { name: 'Site reader', icon: 'visibility', admin_access: false, app_access: false, description: 'Read-only access to the website content for the public site.' })).data;
		await api('POST', '/permissions', { policy: policy.id, collection: 'site_content', action: 'read', fields: ['*'], permissions: {}, validation: {} });
		const role = (await api('POST', '/roles', { name: 'Site reader', icon: 'visibility' })).data;
		await api('POST', '/access', { role: role.id, policy: policy.id }, { allow: [400, 403, 404] });
		const readerToken = crypto.randomBytes(24).toString('hex');
		await api('POST', '/users', { email: 'site-reader@example.com', password: crypto.randomBytes(18).toString('base64url'), role: role.id, token: readerToken, status: 'active', first_name: 'Website', last_name: 'reader' });
		fs.appendFileSync(ENV_FILE, `\nSITE_READER_TOKEN=${readerToken}\n`);
		console.log('Created the read-only "site-reader" user; its token is stored in directus/.env (SITE_READER_TOKEN).');
	}
	console.log('Done. Open /admin2 on the website to edit the content.');
}
main().catch((e) => { console.error(e.message); process.exit(1); });
