'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cfg = require('./config');

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

function baseHeaders(extra = {}) {
	const h = {
		'Content-Security-Policy': CSP,
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'same-origin',
		'X-Frame-Options': 'DENY',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Resource-Policy': 'same-origin',
		...extra,
	};
	if (cfg.SECURE) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
	return h;
}

const crypto = require('crypto');

/** Public HTML: revalidated with an ETag so repeat visits cost a 304 instead of a full page. */
function sendPage(req, res, html, { cache = true } = {}) {
	if (!cache) return send(res, 200, html);
	const etag = `W/"${crypto.createHash('sha1').update(html).digest('base64url').slice(0, 20)}"`;
	if (req.headers['if-none-match'] === etag) {
		res.writeHead(304, baseHeaders({ ETag: etag, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' }));
		return res.end();
	}
	return send(res, 200, html, { ETag: etag, 'Cache-Control': 'no-cache' });
}

const accepts = (req, coding) => new RegExp(`\\b${coding}\\b`).test(String((req && req.headers['accept-encoding']) || ''));
const wantsGzip = (req) => accepts(req, 'gzip');
const wantsBrotli = (req) => accepts(req, 'br');

function send(res, status, body, headers = {}) {
	if (res.devToggle && typeof body === 'string' && body.includes('</body>')) body = body.replace('</body>', `${res.devToggle}</body>`);
	const h = baseHeaders({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding', ...headers });
	if (typeof body === 'string' && body.length > 1024 && wantsBrotli(res.req)) {
		body = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }); // quality 4: fast enough to do per request
		h['Content-Encoding'] = 'br';
	} else if (typeof body === 'string' && body.length > 1024 && wantsGzip(res.req)) {
		body = zlib.gzipSync(body);
		h['Content-Encoding'] = 'gzip';
	}
	res.writeHead(status, h);
	res.end(body);
}

function redirect(res, location, headers = {}, status = 303) {
	res.writeHead(status, baseHeaders({ Location: location, 'Cache-Control': 'no-store', ...headers }));
	res.end();
}

function clientIp(req) {
	if (cfg.TRUST_PROXY) {
		// The rightmost entry is the one our own proxy appended; the leftmost can be forged by the visitor.
		const parts = String(req.headers['x-forwarded-for'] || '').split(',');
		const last = parts[parts.length - 1].trim();
		if (/^[0-9a-f:.]{3,45}$/i.test(last)) return last;
	}
	return req.socket.remoteAddress || 'unknown';
}

function readBody(req, limit) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on('data', (c) => {
			size += c.length;
			if (size > limit) {
				const err = new Error('Payload too large');
				err.status = 413;
				req.destroy();
				reject(err);
				return;
			}
			chunks.push(c);
		});
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

async function readForm(req, limit = 200 * 1024) {
	const raw = await readBody(req, limit);
	const out = {};
	for (const [k, v] of new URLSearchParams(raw.toString('utf8'))) out[k] = v;
	return out;
}

const TYPES = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function serveFile(res, root, relPath, cache) {
	const req = res.req;
	let decoded;
	try {
		decoded = decodeURIComponent(relPath);
	} catch (e) {
		return false;
	}
	const full = path.resolve(root, '.' + path.sep + decoded);
	if (!full.startsWith(root + path.sep)) return false;
	let stat;
	try {
		stat = fs.statSync(full);
	} catch (e) {
		return false;
	}
	if (!stat.isFile()) return false;
	const type = TYPES[path.extname(full).toLowerCase()];
	if (!type) return false;
	const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
	const headers = { 'Content-Type': type, 'Cache-Control': cache, ETag: etag, Vary: 'Accept-Encoding' };
	if (req && req.headers['if-none-match'] === etag) {
		res.writeHead(304, baseHeaders(headers));
		res.end();
		return true;
	}
	const br = /^(text\/|image\/svg)/.test(type) && stat.size > 1024 && wantsBrotli(req);
	const compressible = br || (/^(text\/|image\/svg)/.test(type) && stat.size > 1024 && wantsGzip(req));
	if (compressible) headers['Content-Encoding'] = br ? 'br' : 'gzip';
	else headers['Content-Length'] = stat.size;
	res.writeHead(200, baseHeaders(headers));
	const stream = fs.createReadStream(full);
	(compressible ? stream.pipe(br ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.createGzip()) : stream).pipe(res);
	return true;
}

module.exports = { baseHeaders, send, sendPage, redirect, clientIp, readBody, readForm, serveFile };
