'use strict';
/**
 * Optional reverse proxy: /admin2/* goes to a Directus instance (trial of an open-source admin panel).
 * Enabled only when DIRECTUS_URL is set (for example http://127.0.0.1:8055). The target is fixed, so this
 * cannot be used as an open proxy. Directus must run with PUBLIC_URL=<site address>/admin2 and sends its
 * own security headers; our CSP is deliberately not added to these responses.
 */
const http = require('http');
const https = require('https');

const PREFIX = '/admin2';
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function create(targetUrl) {
	let target;
	try { target = new URL(targetUrl); } catch (e) { return null; }
	if (!/^https?:$/.test(target.protocol)) return null;
	const lib = target.protocol === 'https:' ? https : http;
	return {
		matches: (pathname) => pathname === PREFIX || pathname.startsWith(`${PREFIX}/`),
		handle(req, res) {
			const path = req.url.slice(PREFIX.length) || '/';
			const headers = {};
			for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) headers[k] = v;
			headers.host = target.host;
			headers['x-forwarded-host'] = req.headers.host || '';
			headers['x-forwarded-proto'] = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
			const up = lib.request({ hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), path: path.startsWith('/') ? path : `/${path}`, method: req.method, headers, timeout: 60000 }, (ures) => {
				const out = {};
				for (const [k, v] of Object.entries(ures.headers)) if (!HOP.has(k)) out[k] = v;
				out['x-robots-tag'] = 'noindex, nofollow';
				res.writeHead(ures.statusCode || 502, out);
				ures.pipe(res);
			});
			up.on('timeout', () => up.destroy(new Error('timeout')));
			up.on('error', () => {
				if (res.headersSent) return res.destroy();
				res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
				res.end('The Directus admin panel is not running. Start it with: npm run directus');
			});
			req.pipe(up);
		},
	};
}

module.exports = { create, PREFIX };
