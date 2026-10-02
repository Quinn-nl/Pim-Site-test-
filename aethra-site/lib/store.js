'use strict';
/**
 * File-based storage: content.json, messages.json, admin.json, secret.key.
 * Writes are atomic (temp file + rename). Private files are mode 0600.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const { FIELDS, IMAGE_SLOTS } = require('./fields');
const { LANGS, defaultsFor, PRIVACY } = require('./i18n');

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

/* Secret used to sign form tokens; generated once. */
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

/* Content */
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

/* Saved content is per language: { values: { en: {...}, nl: {...} }, privacy: { en: '...' }, images }.
   Older single-language files (flat values, string privacy) are read as English. */
function normalise(saved) {
	const values = saved.values || {};
	const flat = Object.keys(values).some((k) => FIELDS[k]);
	return {
		values: flat ? { en: values } : values,
		privacy: typeof saved.privacy === 'string' ? { en: saved.privacy } : (saved.privacy || {}),
		images: saved.images || {},
	};
}

function getContent(lang = 'en') {
	const saved = normalise(readJson('content.json', {}));
	return {
		lang,
		values: { ...defaultsFor(lang), ...(saved.values[lang] || {}) },
		images: saved.images,
		privacy: saved.privacy[lang] || PRIVACY[lang] || PRIVACY.en,
	};
}

function saveContent(patch) {
	const lang = patch.lang || 'en';
	if (!LANGS.includes(lang)) return { ok: false, errors: ['Unknown language'] };
	const saved = normalise(readJson('content.json', {}));
	if (patch.values) {
		const values = { ...(saved.values[lang] || {}) };
		const errors = [];
		for (const [key, raw] of Object.entries(patch.values)) {
			const field = FIELDS[key];
			if (!field) continue;
			const v = cleanValue(field, raw);
			if (v === null) errors.push(`${field.label}: enter a valid http(s) link`);
			else values[key] = v;
		}
		if (errors.length) return { ok: false, errors };
		saved.values[lang] = values;
	}
	if (typeof patch.privacy === 'string') saved.privacy[lang] = patch.privacy.replace(/\r/g, '').slice(0, 20000);
	if (patch.images) saved.images = patch.images;
	writeJson('content.json', saved);
	return { ok: true };
}

function setImage(slot, entry) {
	if (!IMAGE_SLOTS.some((s) => s.slot === slot)) throw new Error('unknown slot');
	const { images } = getContent('en');
	const old = images[slot];
	if (entry) images[slot] = entry;
	else delete images[slot];
	saveContent({ images });
	if (old && (!entry || old.file !== entry.file)) {
		try {
			fs.unlinkSync(path.join(uploadsDir(), path.basename(old.file)));
		} catch (e) { /* already gone */ }
	}
}

/* Messages */
function listMessages() {
	const cutoff = Date.now() - cfg.RETENTION_DAYS * 86400000;
	const all = readJson('messages.json', []);
	const kept = all.filter((m) => Date.parse(m.at) >= cutoff);
	if (kept.length !== all.length) writeJson('messages.json', kept);
	return kept.sort((a, b) => (a.at < b.at ? 1 : -1));
}

function addMessage(msg) {
	const all = listMessages();
	if (all.length >= 1000) return false;
	all.push({ id: crypto.randomBytes(8).toString('hex'), at: new Date().toISOString(), ...msg });
	writeJson('messages.json', all);
	return true;
}

function deleteMessage(id) {
	const all = readJson('messages.json', []);
	writeJson('messages.json', all.filter((m) => m.id !== id));
}

module.exports = { file, uploadsDir, ensureDirs, readJson, writeJson, getSecret, getContent, saveContent, setImage, listMessages, addMessage, deleteMessage, cleanValue };
