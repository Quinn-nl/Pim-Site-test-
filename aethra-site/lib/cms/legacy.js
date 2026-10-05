'use strict';
/** One-time import of what the old JSON-based admin stored (content.json, messages.json) into the database. The old files stay untouched as a back-up. */
const fs = require('fs');
const path = require('path');
const db = require('./db');
const cfg = require('../config');
const { GROUPS, FIELDS, IMAGE_SLOTS } = require('../fields');
const { LANGS } = require('../i18n');

const readJson = (name) => { try { return JSON.parse(fs.readFileSync(path.join(cfg.DATA_DIR, name), 'utf8')); } catch (e) { return null; } };
const groupOfKey = Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((f) => [f.key, g.id])));

function importLegacy() {
	if (db.get("SELECT 1 FROM instellingen WHERE sleutel = 'legacy_import'")) return { skipped: true };
	const content = readJson('content.json');
	const messages = readJson('messages.json');
	const result = { fields: 0, messages: 0, photos: 0 };
	db.tx(() => {
		if (content) {
			const values = content.values || {};
			const perLang = Object.keys(values).some((k) => FIELDS[k]) ? { en: values } : values; // very old files had one flat language
			for (const taal of LANGS) {
				for (const [key, waarde] of Object.entries(perLang[taal] || {})) {
					const g = groupOfKey[key];
					if (!g || typeof waarde !== 'string') continue;
					db.run("INSERT OR IGNORE INTO vertalingen (object, veld, taal, waarde, status) VALUES (?, ?, ?, ?, ?)", `tekst:${g}`, key, taal, waarde, waarde.trim() ? 'eerste_versie' : 'leeg');
					result.fields += 1;
				}
				const priv = typeof content.privacy === 'string' ? (taal === 'en' ? content.privacy : '') : (content.privacy || {})[taal];
				if (priv) db.run("INSERT OR IGNORE INTO vertalingen (object, veld, taal, waarde, status) VALUES ('privacy', 'text', ?, ?, 'eerste_versie')", taal, priv);
			}
			for (const slot of IMAGE_SLOTS.map((s) => s.slot)) {
				const img = (content.images || {})[slot];
				if (!img || !img.file || !fs.existsSync(path.join(cfg.DATA_DIR, 'uploads', path.basename(img.file)))) continue;
				const ext = path.extname(img.file).slice(1).toLowerCase();
				const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
				const r = db.run('INSERT OR IGNORE INTO media (bestand, varianten, breedte, hoogte, grootte, mime, rechten) VALUES (?, ?, ?, ?, ?, ?, ?)', path.basename(img.file), '[]', img.w || 1, img.h || 1, fs.statSync(path.join(cfg.DATA_DIR, 'uploads', path.basename(img.file))).size, mime, 'eigen');
				const id = r.changes ? r.id : db.get('SELECT id FROM media WHERE bestand = ?', path.basename(img.file)).id;
				if (img.alt) db.run("INSERT OR IGNORE INTO vertalingen (object, veld, taal, waarde, status) VALUES (?, 'alt', 'en', ?, 'eerste_versie')", `media:${id}`, img.alt);
				db.run('INSERT OR IGNORE INTO instellingen (sleutel, waarde) VALUES (?, ?)', `foto.${slot}`, String(id));
				result.photos += 1;
			}
		}
		for (const m of Array.isArray(messages) ? messages : []) {
			if (!m || !m.email || !m.message) continue;
			db.run('INSERT INTO berichten (tijd, taal, naam, email, organisatie, rol, tekst, bron, campagne, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', m.at || db.iso(), LANGS.includes(m.lang) ? m.lang : 'en', String(m.name || '-'), m.email, m.org || '', m.role || 'Other', m.message, m.source || 'direct', m.campaign || '', m.read === false ? 'nieuw' : 'gelezen');
			result.messages += 1;
		}
		db.run("INSERT INTO instellingen (sleutel, waarde) VALUES ('legacy_import', ?)", db.iso());
	});
	return result;
}

module.exports = { importLegacy };
