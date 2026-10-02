'use strict';
/**
 * Validates an uploaded image by structure (not by name), reads its size and
 * strips metadata (EXIF/GPS, text chunks, XMP). Returns null for anything
 * malformed, so a bad file is rejected instead of stored.
 */
const MAX_SIDE = 6000;

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);

function inspectPng(buf) {
	if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
	const out = [PNG_SIG];
	let pos = 8, width = 0, height = 0, sawIend = false, first = true;
	while (pos + 12 <= buf.length) {
		const len = buf.readUInt32BE(pos);
		const type = buf.toString('latin1', pos + 4, pos + 8);
		const end = pos + 12 + len;
		if (end > buf.length) return null;
		if (first) {
			if (type !== 'IHDR' || len !== 13) return null;
			width = buf.readUInt32BE(pos + 8);
			height = buf.readUInt32BE(pos + 12);
			first = false;
		}
		if (!PNG_DROP.has(type)) out.push(buf.subarray(pos, end));
		pos = end;
		if (type === 'IEND') { sawIend = true; break; }
	}
	if (!sawIend) return null;
	return { ext: 'png', type: 'image/png', width, height, data: Buffer.concat(out) };
}

function inspectJpeg(buf) {
	if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
	const out = [buf.subarray(0, 2)];
	let pos = 2, width = 0, height = 0;
	while (pos + 4 <= buf.length) {
		if (buf[pos] !== 0xff) return null;
		const marker = buf[pos + 1];
		if (marker === 0xff) { pos += 1; continue; }
		if (marker === 0xd9) { out.push(buf.subarray(pos, pos + 2)); pos = buf.length; break; }
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { out.push(buf.subarray(pos, pos + 2)); pos += 2; continue; }
		const len = buf.readUInt16BE(pos + 2);
		const end = pos + 2 + len;
		if (len < 2 || end > buf.length) return null;
		const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
		if (isSof) {
			if (len < 8) return null;
			height = buf.readUInt16BE(pos + 5);
			width = buf.readUInt16BE(pos + 7);
		}
		// Drop EXIF/XMP (APP1), IPTC/Photoshop (APP13) and comments; keep JFIF, ICC colour profile and image data.
		const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
		if (!drop) out.push(buf.subarray(pos, end));
		pos = end;
		if (marker === 0xda) { out.push(buf.subarray(pos)); pos = buf.length; break; }
	}
	if (!width || !height) return null;
	return { ext: 'jpg', type: 'image/jpeg', width, height, data: Buffer.concat(out) };
}

function inspectWebp(buf) {
	if (buf.length < 20 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
	const riffEnd = Math.min(buf.length, 8 + buf.readUInt32LE(4));
	const chunks = [];
	let pos = 12, width = 0, height = 0;
	while (pos + 8 <= riffEnd) {
		const type = buf.toString('latin1', pos, pos + 4);
		const len = buf.readUInt32LE(pos + 4);
		const padded = len + (len & 1);
		if (pos + 8 + len > riffEnd) return null;
		const data = buf.subarray(pos + 8, pos + 8 + len);
		if (type === 'VP8X' && len >= 10) {
			width = 1 + (data[4] | (data[5] << 8) | (data[6] << 16));
			height = 1 + (data[7] | (data[8] << 8) | (data[9] << 16));
		} else if (type === 'VP8 ' && len >= 10 && !width) {
			width = data.readUInt16LE(6) & 0x3fff;
			height = data.readUInt16LE(8) & 0x3fff;
		} else if (type === 'VP8L' && len >= 5 && !width) {
			const bits = data.readUInt32LE(1);
			width = 1 + (bits & 0x3fff);
			height = 1 + ((bits >> 14) & 0x3fff);
		}
		if (type !== 'EXIF' && type !== 'XMP ') {
			const chunk = Buffer.from(buf.subarray(pos, pos + 8 + padded));
			if (type === 'VP8X') chunk[8] &= ~(0x08 | 0x04); // clear the EXIF and XMP flags
			chunks.push(chunk);
		}
		pos += 8 + padded;
	}
	if (!chunks.length || !width || !height) return null;
	const body = Buffer.concat(chunks);
	const head = Buffer.alloc(12);
	head.write('RIFF', 0, 'latin1');
	head.writeUInt32LE(4 + body.length, 4);
	head.write('WEBP', 8, 'latin1');
	return { ext: 'webp', type: 'image/webp', width, height, data: Buffer.concat([head, body]) };
}

function inspectImage(buf) {
	let r = null;
	try {
		r = inspectPng(buf) || inspectJpeg(buf) || inspectWebp(buf);
	} catch (e) {
		return null;
	}
	if (!r || r.width < 1 || r.height < 1 || r.width > MAX_SIDE || r.height > MAX_SIDE) return null;
	return r;
}

module.exports = { inspectImage, MAX_SIDE };
