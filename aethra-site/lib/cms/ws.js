'use strict';
/**
 * A minimal WebSocket server (RFC 6455) for edit locks. Hand-rolled handshake (SHA-1 of the key + magic string), text frames,
 * ping/pong and close. A client claims an exclusive lock on an object (a page, a text group); it expires after 5 minutes without a heartbeat.
 * Messages (JSON)  client -> server: { t: 'lock'|'unlock'|'hb', object }   server -> client: { t: 'lock', object, ok, door } and { t: 'locks', locks }
 */
const crypto = require('crypto');
const users = require('./users');
const { clientIp } = require('../http');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const LOCK_MS = 5 * 60 * 1000;
const MAX_CONNECTIONS = 200;
const MAX_FRAME = 64 * 1024;
const conns = new Set();
const locks = new Map(); // object -> { conn, userId, naam, expires }
let sweeper = null;

function frame(opcode, payload = Buffer.alloc(0)) {
	const len = payload.length;
	const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]) : null;
	return Buffer.concat([head, payload]);
}
const send = (conn, obj) => { try { if (!conn.socket.destroyed) conn.socket.write(frame(1, Buffer.from(JSON.stringify(obj)))); } catch (e) { /* closing */ } };

const snapshot = () => Object.fromEntries([...locks].filter(([, l]) => l.expires > Date.now()).map(([o, l]) => [o, l.naam]));
const broadcast = () => { const msg = { t: 'locks', locks: snapshot() }; for (const c of conns) send(c, msg); };

function release(conn) {
	let changed = false;
	for (const [object, l] of locks) if (l.conn === conn) { locks.delete(object); changed = true; }
	if (changed) broadcast();
}
function acquire(conn, object) {
	const l = locks.get(object);
	if (l && l.expires > Date.now() && l.conn !== conn) return { ok: false, door: l.naam, zelf: l.userId === conn.user.id };
	locks.set(object, { conn, userId: conn.user.id, naam: conn.user.naam, expires: Date.now() + LOCK_MS });
	return { ok: true };
}
/** Server-side enforcement for saves: null when the user may save, else the name of the person who holds the lock. */
function heldByOther(object, userId) {
	const l = locks.get(object);
	if (!l || l.expires <= Date.now()) return null;
	return l.userId === userId ? null : l.naam;
}

function onMessage(conn, text) {
	let m;
	try { m = JSON.parse(text); } catch (e) { return; }
	const object = typeof m.object === 'string' && /^[a-z]+:[A-Za-z0-9_.-]{1,60}$|^privacy$/.test(m.object) ? m.object : null;
	if (!object) return;
	if (m.t === 'lock') {
		if (!users.can(conn.user, 'schrijven')) return send(conn, { t: 'lock', object, ok: false, door: null, lezer: true });
		const r = acquire(conn, object);
		send(conn, { t: 'lock', object, ...r });
		if (r.ok) broadcast();
	} else if (m.t === 'hb') {
		const l = locks.get(object);
		if (l && l.conn === conn) l.expires = Date.now() + LOCK_MS;
		else send(conn, { t: 'lock', object, ...acquire(conn, object) });
	} else if (m.t === 'unlock') {
		const l = locks.get(object);
		if (l && l.conn === conn) { locks.delete(object); broadcast(); }
	}
}

function upgrade(req, socket, head) {
	const fail = (code, text) => { try { socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch (e) { /* gone */ } socket.destroy(); };
	const url = new URL(req.url, 'http://localhost');
	if (url.pathname !== '/admin/ws') return fail(404, 'Not Found');
	const key = req.headers['sec-websocket-key'];
	if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') return fail(400, 'Bad Request');
	const origin = req.headers.origin;
	if (origin) { try { if (new URL(origin).host !== String(req.headers.host || '')) return fail(403, 'Forbidden'); } catch (e) { return fail(403, 'Forbidden'); } }
	let session;
	try { session = users.getSession(req, clientIp(req)); } catch (e) { return fail(503, 'Service Unavailable'); }
	if (!session) return fail(401, 'Unauthorized');
	if (conns.size >= MAX_CONNECTIONS) return fail(503, 'Service Unavailable');
	const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
	socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
	socket.setNoDelay(true);
	socket.setTimeout(0);
	const conn = { socket, user: session.user, buf: head && head.length ? Buffer.from(head) : Buffer.alloc(0) };
	conns.add(conn);
	send(conn, { t: 'locks', locks: snapshot() });
	const drop = () => { if (!conns.has(conn)) return; conns.delete(conn); release(conn); };
	socket.on('close', drop);
	socket.on('error', drop);
	socket.on('end', () => { drop(); socket.end(); }); // HTTP sockets are half-open by default: a closed browser tab only sends FIN
	const parse = () => {
		for (;;) {
			const b = conn.buf;
			if (b.length < 2) return;
			const fin = (b[0] & 0x80) !== 0;
			const opcode = b[0] & 0x0f;
			const masked = (b[1] & 0x80) !== 0;
			let len = b[1] & 0x7f;
			let off = 2;
			if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
			else if (len === 127) { socket.destroy(); return; } // frames over 64 KB are never needed here
			if (!masked || len > MAX_FRAME || !fin) { socket.destroy(); return; } // clients must mask; no fragmentation
			if (b.length < off + 4 + len) return;
			const mask = b.subarray(off, off + 4);
			const data = Buffer.from(b.subarray(off + 4, off + 4 + len));
			for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
			conn.buf = b.subarray(off + 4 + len);
			if (opcode === 1) onMessage(conn, data.toString('utf8'));
			else if (opcode === 8) { try { socket.end(frame(8, data.subarray(0, 2))); } catch (e) { /* gone */ } drop(); return; }
			else if (opcode === 9) socket.write(frame(10, data));
			else if (opcode !== 10) { socket.destroy(); return; }
		}
	};
	socket.on('data', (chunk) => { conn.buf = Buffer.concat([conn.buf, chunk]); parse(); });
	parse();
}

function start() {
	if (sweeper) return;
	sweeper = setInterval(() => { // a lock whose heartbeat stopped for 5 minutes is released
		let changed = false;
		for (const [object, l] of locks) if (l.expires <= Date.now()) { locks.delete(object); changed = true; }
		if (changed) broadcast();
	}, 30000);
	sweeper.unref();
}
function closeAll() { if (sweeper) clearInterval(sweeper); sweeper = null; for (const c of conns) { try { c.socket.end(frame(8, Buffer.from([0x03, 0xe9]))); } catch (e) { /* gone */ } } conns.clear(); locks.clear(); }
const reset = closeAll;

module.exports = { upgrade, start, closeAll, reset, heldByOther, snapshot, LOCK_MS, acquire: (o, user) => acquire({ user }, o) };
