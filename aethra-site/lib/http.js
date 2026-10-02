'use strict';
const fs = require('fs');
const path = require('path');
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
		...extra,
	};
	if (cfg.SECURE) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
	return h;
}

function send(res, status, body, headers = {}) {
	res.writeHead(status, baseHeaders({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers }));
	res.end(body);
}

function redirect(res, location, headers = {}) {
	res.writeHead(303, baseHeaders({ Location: location, 'Cache-Control': 'no-store', ...headers }));
	res.end();
}

function clientIp(req) {
	if (cfg.TRUST_PROXY) {
		const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
		if (xff) return xff;
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

const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function serveFile(res, root, relPath, cache) {
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
	res.writeHead(200, baseHeaders({ 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': cache }));
	fs.createReadStream(full).pipe(res);
	return true;
}

module.exports = { baseHeaders, send, redirect, clientIp, readBody, readForm, serveFile };
