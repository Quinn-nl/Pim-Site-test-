'use strict';
/**
 * Media library and the upload pipeline.
 *  - streamUpload(): a small streaming multipart reader. Content-Length is checked first, bytes go to a temp file (never to memory
 *    beyond the cap), the first bytes must be a real JPEG/PNG/WebP (magic bytes), the size cap is enforced while streaming.
 *  - saveUpload(): structure check + metadata removal (lib/image.js), atomic rename into data/uploads, optional WebP/AVIF through
 *    cwebp/avifenc when those programs exist (1x and 2x), and the media row plus the required alt texts in ONE transaction.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const db = require('./db');
const audit = require('./audit');
const cfg = require('../config');
const { inspectImage } = require('../image');
const { detectImage } = require('../multipart');
const { IMAGE_SLOTS } = require('../fields');
const { LANGS } = require('../i18n');

const uploadsDir = () => path.join(cfg.DATA_DIR, 'uploads');
const tmpDir = () => path.join(cfg.DATA_DIR, 'tmp');
const RIGHTS = ['eigen', 'gelicentieerd', 'ai_sfeer'];
const bad = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

/* ---- streaming multipart ---- */
async function streamUpload(req, { maxFile = cfg.MAX_IMAGE_BYTES, maxFields = 32 * 1024 } = {}) {
	const type = String(req.headers['content-type'] || '');
	const m = /^multipart\/form-data;.*boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
	if (!m) throw bad(400, 'Verwacht een bestandsupload.');
	const declared = Number(req.headers['content-length']);
	// Refuse at once, before reading a single byte, when the announced size is over the cap (a missing length is policed while streaming).
	if (Number.isFinite(declared) && declared > maxFile + maxFields + 4096) throw bad(413, 'Bestand te groot.', { abort: true });
	const boundary = Buffer.from(`--${(m[1] || m[2]).trim()}`);
	const delimiter = Buffer.from(`\r\n--${(m[1] || m[2]).trim()}`);
	fs.mkdirSync(tmpDir(), { recursive: true, mode: 0o700 });
	const fields = {};
	let file = null;
	let buf = Buffer.alloc(0);
	let phase = 'preamble'; // preamble -> headers -> body -> after
	let part = null;
	let received = 0;
	let sink = null; // file descriptor of the temp file
	const cleanup = () => { if (sink !== null) { try { fs.closeSync(sink); } catch (e) { /* closed */ } sink = null; } if (file && file.path) fs.rmSync(file.path, { force: true }); };
	const write = (chunk) => { fs.writeSync(sink, chunk); }; // synchronous: the temp file is complete and removable at every moment
	try {
		for await (const chunk of req) {
			received += chunk.length;
			if (received > maxFile + maxFields + 4096) throw bad(413, 'Bestand te groot.', { abort: true });
			buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
			for (;;) {
				if (phase === 'preamble') {
					const i = buf.indexOf(boundary);
					if (i === -1) { if (buf.length > boundary.length + 2) buf = buf.subarray(buf.length - boundary.length - 2); break; }
					buf = buf.subarray(i + boundary.length);
					phase = 'after';
				} else if (phase === 'after') {
					if (buf.length < 2) break;
					if (buf.subarray(0, 2).toString() === '--') { phase = 'done'; break; }
					if (buf.subarray(0, 2).toString() !== '\r\n') throw bad(400, 'Ongeldige upload.');
					buf = buf.subarray(2);
					phase = 'headers';
				} else if (phase === 'headers') {
					const i = buf.indexOf('\r\n\r\n');
					if (i === -1) { if (buf.length > 8192) throw bad(400, 'Ongeldige upload.'); break; }
					const head = buf.subarray(0, i).toString('utf8');
					buf = buf.subarray(i + 4);
					const disp = /content-disposition:[^\r\n]*/i.exec(head);
					const name = disp && /\bname="([^"]*)"/i.exec(disp[0]);
					const filename = disp && /\bfilename="([^"]*)"/i.exec(disp[0]);
					if (!name) throw bad(400, 'Ongeldige upload.');
					part = { name: name[1], isFile: !!filename, size: 0, head: Buffer.alloc(0), text: '' };
					if (part.isFile) {
						if (file) throw bad(400, 'Upload één bestand per keer.');
						file = { path: path.join(tmpDir(), `${crypto.randomBytes(12).toString('hex')}.part`), size: 0, field: name[1], name: filename[1] };
						sink = fs.openSync(file.path, 'w', 0o600);
					}
					phase = 'body';
				} else if (phase === 'body') {
					const i = buf.indexOf(delimiter);
					const end = i === -1 ? buf.length - (delimiter.length - 1) : i;
					if (end > 0) {
						const data = buf.subarray(0, end);
						part.size += data.length;
						if (part.isFile) {
							if (part.size > maxFile) throw bad(413, 'Bestand te groot.', { abort: true });
							if (part.head.length < 16) {
								part.head = Buffer.concat([part.head, data.subarray(0, 16 - part.head.length)]);
								if (part.head.length >= 16 && !detectImage(part.head)) throw bad(400, 'Upload een JPG-, PNG- of WebP-afbeelding.', { code: 'badimg' }); // magic bytes, not the extension
							}
							if (part.size > 0) write(data);
						} else {
							if (part.size > maxFields) throw bad(413, 'Veld te groot.');
							part.text += data.toString('utf8');
						}
					}
					if (i === -1) { buf = buf.subarray(Math.max(end, 0)); break; }
					buf = buf.subarray(i + delimiter.length);
					if (part.isFile) {
						fs.closeSync(sink);
						sink = null;
						file.size = part.size;
						if (part.size === 0) { fs.rmSync(file.path, { force: true }); file = null; } // the form was sent without choosing a file
						else if (part.size < 16 || !detectImage(part.head)) throw bad(400, 'Upload een JPG-, PNG- of WebP-afbeelding.', { code: 'badimg' });
					} else fields[part.name] = part.text;
					part = null;
					phase = 'after';
				} else break;
			}
			if (phase === 'done') break;
		}
	} catch (e) { cleanup(); throw e; }
	if (phase !== 'done') { cleanup(); throw bad(400, 'De upload is afgebroken.'); }
	if (file && file.size === 0) { cleanup(); file = null; }
	return { fields, file };
}

/* ---- encoders (optional) ---- */
const bin = (name, envVar) => process.env[envVar] || name;
const have = {};
function available(name, envVar, args) {
	const key = `${name}|${process.env[envVar] || ''}`;
	if (!(key in have)) { const r = spawnSync(bin(name, envVar), args, { timeout: 5000 }); have[key] = !r.error && r.status !== null; }
	return have[key];
}
function run(cmd, args) {
	return new Promise((resolve) => {
		let done = false;
		const p = spawn(cmd, args, { stdio: 'ignore' });
		const t = setTimeout(() => { if (!done) { done = true; p.kill('SIGKILL'); resolve(false); } }, 30000);
		p.on('error', () => { if (!done) { done = true; clearTimeout(t); resolve(false); } });
		p.on('close', (code) => { if (!done) { done = true; clearTimeout(t); resolve(code === 0); } });
	});
}
const encodersAvailable = () => ({ webp: available('cwebp', 'CWEBP_BIN', ['-version']), avif: available('avifenc', 'AVIFENC_BIN', ['--version']) });

/** WebP at 1x and 2x (and AVIF at 1x) from a cleaned JPEG/PNG. Returns the variants that were made. */
async function makeVariants(srcPath, base, ext, width) {
	const out = [];
	if (ext === 'webp') return out; // already the target format
	const enc = encodersAvailable();
	const x1 = Math.min(width, 1200);
	const x2 = Math.min(width, 2400);
	if (enc.webp) {
		const f1 = `${base}.webp`;
		if (await run(bin('cwebp', 'CWEBP_BIN'), ['-quiet', '-q', '80', ...(width > x1 ? ['-resize', String(x1), '0'] : []), srcPath, '-o', path.join(uploadsDir(), f1)])) out.push({ bestand: f1, breedte: x1, type: 'image/webp', dichtheid: 1 });
		if (x2 > x1) {
			const f2 = `${base}@2x.webp`;
			if (await run(bin('cwebp', 'CWEBP_BIN'), ['-quiet', '-q', '78', ...(width > x2 ? ['-resize', String(x2), '0'] : []), srcPath, '-o', path.join(uploadsDir(), f2)])) out.push({ bestand: f2, breedte: x2, type: 'image/webp', dichtheid: 2 });
		}
	}
	if (enc.avif && width <= 2400) {
		const f = `${base}.avif`;
		if (await run(bin('avifenc', 'AVIFENC_BIN'), ['--min', '20', '--max', '40', '--speed', '8', srcPath, path.join(uploadsDir(), f)])) out.push({ bestand: f, breedte: width, type: 'image/avif', dichtheid: 1 });
	}
	return out;
}

/* ---- saving ---- */
const cleanAlt = (alt) => {
	const out = {};
	for (const l of LANGS) { const v = String((alt || {})[l] || '').replace(/\s+/g, ' ').trim().slice(0, 200); if (v) out[l] = v; }
	return out;
};

async function saveUpload({ tmpPath, alt, rechten = 'eigen', bron = '', user, slot = null }) {
	const altText = cleanAlt(alt);
	if (!altText.en) { fs.rmSync(tmpPath, { force: true }); throw bad(422, 'Een omschrijving van de foto is verplicht (minstens in het Engels). Schermlezers lezen die voor.'); }
	if (!RIGHTS.includes(rechten)) { fs.rmSync(tmpPath, { force: true }); throw bad(422, 'Kies wie de rechten op deze foto heeft.'); }
	const raw = fs.readFileSync(tmpPath);
	fs.rmSync(tmpPath, { force: true });
	if (raw.length > cfg.MAX_IMAGE_BYTES) throw bad(413, 'Bestand te groot.');
	const img = inspectImage(raw);
	if (!img) throw bad(400, 'Upload een JPG-, PNG- of WebP-afbeelding.', { code: 'badimg' });
	fs.mkdirSync(uploadsDir(), { recursive: true, mode: 0o700 });
	const base = crypto.randomBytes(10).toString('hex');
	const file = `${base}.${img.ext}`;
	const stage = path.join(tmpDir(), `${file}.stage`);
	fs.mkdirSync(tmpDir(), { recursive: true, mode: 0o700 });
	fs.writeFileSync(stage, img.data, { mode: 0o600 });
	const written = [];
	try {
		await fs.promises.rename(stage, path.join(uploadsDir(), file)); // atomic: a crash never leaves half a file in uploads
		written.push(file);
		const variants = await makeVariants(path.join(uploadsDir(), file), base, img.ext, img.width);
		for (const v of variants) written.push(v.bestand);
		const id = db.tx(() => {
			const r = db.run('INSERT INTO media (bestand, varianten, breedte, hoogte, grootte, mime, rechten, bron, gebruiker_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', file, JSON.stringify(variants), img.width, img.height, img.data.length, img.type, rechten, String(bron).slice(0, 200), user ? user.id : null);
			for (const [taal, tekst] of Object.entries(altText)) db.run("INSERT INTO vertalingen (object, veld, taal, waarde, status) VALUES (?, 'alt', ?, ?, 'eerste_versie')", `media:${r.id}`, taal, tekst);
			if (slot) setSlotRow(slot, r.id);
			return r.id;
		});
		audit.log({ user, actie: 'media.geupload', entiteit: `media:${id}`, nieuw: { bestand: file, rechten, slot } });
		if (slot) require('./content').invalidate(`foto.${slot}`);
		return id;
	} catch (e) {
		for (const f of written) fs.rm(path.join(uploadsDir(), f), { force: true }, () => {});
		fs.rm(stage, { force: true }, () => {});
		throw e;
	}
}

function setSlotRow(slot, mediaId) {
	if (!IMAGE_SLOTS.some((s) => s.slot === slot)) throw bad(400, 'Onbekende plek voor een foto.');
	if (mediaId == null) db.run('DELETE FROM instellingen WHERE sleutel = ?', `foto.${slot}`);
	else db.run('INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde', `foto.${slot}`, String(mediaId));
}
function setSlot(slot, mediaId, user) {
	if (mediaId != null && !db.get('SELECT 1 FROM media WHERE id = ? AND verwijderd_op IS NULL', mediaId)) throw bad(404, 'Foto niet gevonden.');
	setSlotRow(slot, mediaId);
	audit.log({ user, actie: 'media.plek', entiteit: `foto.${slot}`, nieuw: mediaId });
	require('./content').invalidate(`foto.${slot}`);
}

/* ---- reading ---- */
const parse = (r) => ({ ...r, varianten: JSON.parse(r.varianten || '[]') });
function altOf(id) {
	const out = {};
	for (const r of db.all("SELECT taal, waarde FROM vertalingen WHERE object = ? AND veld = 'alt'", `media:${id}`)) out[r.taal] = r.waarde;
	return out;
}
const get = (id) => { const r = db.get('SELECT * FROM media WHERE id = ? AND verwijderd_op IS NULL', id); return r ? { ...parse(r), alt: altOf(id) } : null; };
const list = () => db.all('SELECT * FROM media WHERE verwijderd_op IS NULL ORDER BY id DESC').map((r) => ({ ...parse(r), alt: altOf(r.id) }));
function slots() {
	const out = {};
	for (const r of db.all("SELECT sleutel, waarde FROM instellingen WHERE sleutel LIKE 'foto.%'")) out[r.sleutel.slice(5)] = Number(r.waarde);
	return out;
}
function usage(id) {
	const used = [];
	for (const [slot, mid] of Object.entries(slots())) if (mid === id) used.push({ soort: 'plek', naam: slot });
	for (const r of db.all("SELECT object FROM vertalingen WHERE object LIKE 'pagina:%' AND veld LIKE 's.%.media' AND waarde = ? GROUP BY object", String(id))) used.push({ soort: 'pagina', naam: r.object });
	return used;
}
/** The shape the page templates use: { url, w, h, alt, variants } in one language. */
function forView(m, lang) {
	if (!m) return null;
	return { file: m.bestand, url: `/uploads/${m.bestand}`, w: m.breedte, h: m.hoogte, focus: [Math.round((m.focus_x == null ? 50 : m.focus_x) / 10) * 10, Math.round((m.focus_y == null ? 50 : m.focus_y) / 10) * 10], alt: m.alt[lang] || m.alt.en || '', illustratie: m.rechten === 'ai_sfeer', variants: m.varianten.map((v) => ({ url: `/uploads/${v.bestand}`, w: v.breedte, type: v.type, d: v.dichtheid })) };
}
function slotImages(lang) {
	const out = {};
	for (const [slot, id] of Object.entries(slots())) { const m = get(id); if (m) out[slot] = forView(m, lang); }
	return out;
}
const imageFor = (id, lang) => forView(get(Number(id)), lang);

function update(id, { alt, rechten, bron, focus_x, focus_y }, user) {
	const m = get(id);
	if (!m) throw bad(404, 'Foto niet gevonden.');
	const nextAlt = cleanAlt(alt || m.alt);
	if (!nextAlt.en) throw bad(422, 'Een omschrijving van de foto is verplicht (minstens in het Engels).');
	if (rechten && !RIGHTS.includes(rechten)) throw bad(422, 'Onbekend type rechten.');
	db.tx(() => {
		const clamp = (v, old) => (v == null || v === '' || !Number.isFinite(Number(v)) ? old : Math.min(100, Math.max(0, Math.round(Number(v)))));
		db.run('UPDATE media SET rechten = ?, bron = ?, focus_x = ?, focus_y = ? WHERE id = ?', rechten || m.rechten, bron == null ? m.bron : String(bron).slice(0, 200), clamp(focus_x, m.focus_x), clamp(focus_y, m.focus_y), id);
		db.run("DELETE FROM vertalingen WHERE object = ? AND veld = 'alt'", `media:${id}`);
		for (const [taal, tekst] of Object.entries(nextAlt)) db.run("INSERT INTO vertalingen (object, veld, taal, waarde, status) VALUES (?, 'alt', ?, ?, 'eerste_versie')", `media:${id}`, taal, tekst);
	});
	audit.log({ user, actie: 'media.gewijzigd', entiteit: `media:${id}`, oud: { alt: m.alt, rechten: m.rechten }, nieuw: { alt: nextAlt, rechten: rechten || m.rechten } });
	require('./content').invalidate(`media:${id}`);
}

/** To the trash (files stay for 30 days). A photo that is still in use cannot be deleted. */
function remove(id, user) {
	const m = get(id);
	if (!m) return false;
	const used = usage(id);
	if (used.length) throw bad(409, `Deze foto wordt nog gebruikt (${used.map((u) => u.naam).join(', ')}). Vervang hem eerst daar.`, { gebruikt: used });
	db.run('UPDATE media SET verwijderd_op = ? WHERE id = ?', db.iso(), id);
	audit.log({ user, actie: 'media.verwijderd', entiteit: `media:${id}`, oud: { bestand: m.bestand } });
	return true;
}
function trash() {
	return db.all('SELECT * FROM media WHERE verwijderd_op IS NOT NULL ORDER BY verwijderd_op DESC').map((r) => ({ ...parse(r), alt: altOf(r.id) }));
}
function restore(id, user) {
	const r = db.run('UPDATE media SET verwijderd_op = NULL WHERE id = ? AND verwijderd_op IS NOT NULL', id);
	if (!r.changes) throw bad(404, 'Foto niet gevonden in de prullenbak.');
	audit.log({ user, actie: 'media.teruggezet', entiteit: `media:${id}` });
}
/** Gone for good, files included. */
function purge(id, user) {
	const row = db.get('SELECT * FROM media WHERE id = ?', id);
	if (!row) return false;
	const m = parse(row);
	db.tx(() => {
		db.run('DELETE FROM media WHERE id = ?', id);
		db.run('DELETE FROM vertalingen WHERE object = ?', `media:${id}`);
	});
	for (const f of [m.bestand, ...m.varianten.map((v) => v.bestand)]) fs.rmSync(path.join(uploadsDir(), path.basename(f)), { force: true });
	audit.log({ user, actie: 'media.definitief_verwijderd', entiteit: `media:${id}`, oud: { bestand: m.bestand } });
	return true;
}
function purgeOld(days = 30, now = Date.now()) {
	let n = 0;
	for (const r of db.all('SELECT id FROM media WHERE verwijderd_op IS NOT NULL AND verwijderd_op < ?', new Date(now - days * 86400000).toISOString())) if (purge(r.id, null)) n += 1;
	return n;
}

module.exports = { trash, restore, purge, purgeOld, RIGHTS, streamUpload, saveUpload, setSlot, get, list, slots, usage, slotImages, imageFor, forView, update, remove, encodersAvailable, uploadsDir, tmpDir };
