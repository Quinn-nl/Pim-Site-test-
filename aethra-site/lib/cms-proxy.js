'use strict';
/**
 * Reverse proxy: /admin2/* goes to the Payload CMS (an app served with basePath /admin2, so the path is
 * handed over unchanged). Enabled only when CMS_URL is set (for example http://127.0.0.1:3001). The target is
 * fixed, so this cannot be used as an open proxy. Payload sends its own headers; our CSP is deliberately not
 * added to these responses, and the responses are marked noindex.
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
			const headers = {};
			for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) headers[k] = v;
			headers.host = req.headers.host || target.host; // Payload builds its links from the visitor's host
			headers['x-forwarded-host'] = req.headers.host || '';
			headers['x-forwarded-proto'] = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
			const up = lib.request({ hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), path: req.url, method: req.method, headers, timeout: 120000 }, (ures) => {
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
				res.end('The CMS (/admin2) is not running. Start it with: npm run cms');
			});
			req.pipe(up);
		},
		// WebSocket upgrades (only used by the CMS dev server's hot reload)
		upgrade(req, socket, head) {
			const up = lib.request({ hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), path: req.url, method: 'GET', headers: { ...req.headers, host: req.headers.host || target.host } });
			up.on('upgrade', (ures, usocket, uhead) => {
				const lines = ['HTTP/1.1 101 Switching Protocols'];
				for (const [k, v] of Object.entries(ures.headers)) lines.push(`${k}: ${v}`);
				socket.write(`${lines.join('\r\n')}\r\n\r\n`);
				if (uhead && uhead.length) socket.write(uhead);
				usocket.pipe(socket); socket.pipe(usocket);
				usocket.on('error', () => socket.destroy()); socket.on('error', () => usocket.destroy());
			});
			up.on('error', () => socket.destroy());
			up.on('response', () => socket.destroy());
			up.end(head);
		},
	};
}

module.exports = { create, PREFIX };
