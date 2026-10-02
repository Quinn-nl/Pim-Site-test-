'use strict';
/** Minimal multipart/form-data parser (buffered; the caller caps the body size). */
const CRLF = Buffer.from('\r\n');

function parseMultipart(body, contentType) {
	const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
	if (!m) throw new Error('Missing multipart boundary');
	const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
	const fields = {};
	const files = [];

	let pos = body.indexOf(boundary);
	while (pos !== -1) {
		let start = pos + boundary.length;
		if (body.slice(start, start + 2).toString() === '--') break;
		start += CRLF.length;
		const next = body.indexOf(boundary, start);
		if (next === -1) throw new Error('Malformed multipart body');
		const part = body.slice(start, next - CRLF.length);
		const headerEnd = part.indexOf('\r\n\r\n');
		if (headerEnd === -1) throw new Error('Malformed multipart part');
		const headers = part.slice(0, headerEnd).toString('utf8');
		const data = part.slice(headerEnd + 4);
		const disp = /content-disposition:[^\r\n]*/i.exec(headers);
		const name = disp && /\bname="([^"]*)"/i.exec(disp[0]);
		const filename = disp && /\bfilename="([^"]*)"/i.exec(disp[0]);
		if (name) {
			if (filename) files.push({ name: name[1], filename: filename[1], data });
			else fields[name[1]] = data.toString('utf8');
		}
		pos = next;
	}
	return { fields, files };
}

/** Identify an image by its first bytes; never trust the client's filename or type. */
function detectImage(buf) {
	if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
	if (buf.length > 12 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
	if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { ext: 'webp', type: 'image/webp' };
	return null;
}

module.exports = { parseMultipart, detectImage };
