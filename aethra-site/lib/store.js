'use strict';
/**
 * Small shared helpers (data folder, atomic JSON files, the server secret, text cleaning) and the read side of the site's content.
 * Everything editable lives in the SQLite database (lib/cms/*); this module hands the public templates what they need:
 * getContent(lang) = texts (defaults + database), photos, privacy text. If the database is down the last good copy keeps serving.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');

const file = (name) => path.join(cfg.DATA_DIR, name);
const uploadsDir = () => path.join(cfg.DATA_DIR, 'uploads');

function ensureDirs() {
	fs.mkdirSync(uploadsDir(), { recursive: true, mode: 0o700 });
}

function readJson(name, fallback) {
	try {
		return JSON.parse(fs.readFileSync(file(name), 'utf8'));
	} catch (err) {
		if (err.code === 'ENOENT') return fallback;
		throw err;
	}
}

function writeJson(name, data) {
	ensureDirs();
	const target = file(name);
	const tmp = `${target}.${crypto.randomBytes(4).toString('hex')}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, target);
}

/* Secret used to sign form tokens and to encrypt authenticator secrets; generated once. */
function getSecret() {
	ensureDirs();
	try {
		return fs.readFileSync(file('secret.key'), 'utf8');
	} catch (err) {
		if (err.code !== 'ENOENT') throw err;
		const secret = crypto.randomBytes(32).toString('hex');
		fs.writeFileSync(file('secret.key'), secret, { mode: 0o600 });
		return secret;
	}
}

/** One text value cleaned by its field type (300 / 2000 characters, links must be http(s)). null = invalid link. */
function cleanValue(field, raw) {
	let v = String(raw == null ? '' : raw).replace(/\r/g, '');
	if (field.type === 'textarea') {
		v = v.replace(/\n{2,}/g, '\n').slice(0, 2000);
	} else {
		v = v.replace(/\n/g, ' ').slice(0, 300);
	}
	v = v.trim();
	if (field.type === 'url' && v) {
		try {
			const u = new URL(v);
			if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
		} catch (e) {
			return null;
		}
	}
	return v;
}

/* ---- the read side ---- */
let imagesCache = {};
let wired = false;
function wire() {
	if (wired) return;
	wired = true;
	require('./cms/content').onChange(() => { imagesCache = {}; });
}
function images(lang) {
	wire();
	if (imagesCache[lang]) return imagesCache[lang];
	try {
		return (imagesCache[lang] = require('./cms/media').slotImages(lang));
	} catch (e) {
		return imagesCache[lang] || {};
	}
}

function getContent(lang = 'en') {
	const content = require('./cms/content');
	wire();
	return { lang, values: content.textValues(lang), images: images(lang), privacy: content.privacyText(lang) };
}

const pages = () => require('./cms/pages');
const publishedPages = () => pages().publishedPages();
const findPage = (lang, slug) => pages().findPage(lang, slug);
const pageVersions = (page) => pages().pageVersions(page);
const footerPages = (lang) => pages().footerPages(lang);
/** Resolved menu for a language, or null for the built-in one. */
const menuFor = (lang, todayOn) => require('./cms/menu').resolve(lang, { todayOn, published: publishedPages() });

module.exports = { file, uploadsDir, ensureDirs, readJson, writeJson, getSecret, cleanValue, getContent, publishedPages, findPage, pageVersions, footerPages, menuFor };
