'use strict';
/**
 * Minimal SMTP client (no dependencies) used to e-mail the team when a message arrives.
 * Configure with SMTP_HOST, SMTP_PORT (587 STARTTLS or 465 TLS), SMTP_USER, SMTP_PASS,
 * MAIL_FROM and MAIL_TO (comma separated). Without SMTP_HOST nothing is sent and the
 * message simply waits in the admin inbox.
 */
const net = require('net');
const tls = require('tls');
const os = require('os');
const crypto = require('crypto');

const cfg = () => ({
	host: process.env.SMTP_HOST || '',
	port: Number(process.env.SMTP_PORT) || 587,
	user: process.env.SMTP_USER || '',
	pass: process.env.SMTP_PASS || '',
	from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
	to: (process.env.MAIL_TO || '').split(',').map((s) => s.trim()).filter(Boolean),
});

const configured = () => { const c = cfg(); return !!(c.host && c.from && c.to.length); };
/** Can mail go out at all (server and sender set)? Recipients are then given per mail. */
const canSend = () => { const c = cfg(); return !!(c.host && c.from); };
const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const isLocal = (host) => host === 'localhost' || host === '127.0.0.1' || host === '::1';

function buildMessage({ from, to, subject, text, replyTo }) {
	const body = Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
	const headers = [
		`From: ${clean(from)}`,
		`To: ${to.map(clean).join(', ')}`,
		`Subject: ${encodeWord(clean(subject))}`,
		replyTo ? `Reply-To: ${clean(replyTo)}` : null,
		`Date: ${new Date().toUTCString()}`,
		`Message-ID: <${crypto.randomBytes(12).toString('hex')}@${os.hostname()}>`,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=utf-8',
		'Content-Transfer-Encoding: base64',
	].filter(Boolean);
	return `${headers.join('\r\n')}\r\n\r\n${body}\r\n`;
}

function sendMail({ subject, text, replyTo, to }) {
	const c = cfg();
	if (to ? !canSend() : !configured()) return Promise.resolve({ sent: false, reason: 'not configured' });
	if (to) c.to = to;
	const message = buildMessage({ from: c.from, to: c.to, subject, text, replyTo });

	return new Promise((resolve) => {
		let socket, buffer = '', waiting = null, done = false;
		const finish = (result) => { if (done) return; done = true; clearTimeout(timer); try { socket.destroy(); } catch (e) { /* closed */ } resolve(result); };
		const timer = setTimeout(() => finish({ sent: false, reason: 'timeout' }), 15000);

		const attach = (s) => {
			socket = s;
			s.setEncoding('utf8');
			s.on('data', (d) => {
				buffer += d;
				for (;;) {
					const lines = buffer.split('\r\n');
					const idx = lines.findIndex((l) => /^\d{3} /.test(l));
					if (idx === -1) return;
					const reply = lines.slice(0, idx + 1);
					buffer = lines.slice(idx + 1).join('\r\n');
					if (waiting) { const w = waiting; waiting = null; w(reply); } else return;
				}
			});
			s.on('error', (e) => finish({ sent: false, reason: e.code || 'socket error' }));
			s.on('close', () => finish({ sent: false, reason: 'closed' }));
		};
		const read = () => new Promise((r) => { waiting = r; if (buffer) s_flush(); });
		const s_flush = () => socket.emit('data', '');
		const cmd = async (line, ok) => {
			if (line !== null) socket.write(line + '\r\n');
			const reply = await read();
			const code = Number(reply[reply.length - 1].slice(0, 3));
			if (!ok.includes(code)) throw new Error(`SMTP ${code}`);
			return reply;
		};

		(async () => {
			const onConnect = () => { /* greeting is read below */ };
			if (c.port === 465) attach(tls.connect({ host: c.host, port: c.port, servername: c.host }, onConnect));
			else attach(net.connect({ host: c.host, port: c.port }, onConnect));
			await cmd(null, [220]);
			let caps = (await cmd(`EHLO ${os.hostname() || 'localhost'}`, [250])).join('\n');
			if (c.port !== 465) {
				if (/STARTTLS/i.test(caps)) {
					await cmd('STARTTLS', [220]);
					const plain = socket;
					plain.removeAllListeners('data'); plain.removeAllListeners('close');
					buffer = '';
					attach(tls.connect({ socket: plain, servername: c.host }));
					caps = (await cmd(`EHLO ${os.hostname() || 'localhost'}`, [250])).join('\n');
				} else if (c.user && !isLocal(c.host)) {
					throw new Error('refusing to send credentials without TLS');
				}
			}
			if (c.user) await cmd(`AUTH PLAIN ${Buffer.from(`\0${c.user}\0${c.pass}`).toString('base64')}`, [235]);
			await cmd(`MAIL FROM:<${clean(c.from).replace(/^.*<|>.*$/g, '')}>`, [250]);
			for (const rcpt of c.to) await cmd(`RCPT TO:<${clean(rcpt)}>`, [250, 251]);
			await cmd('DATA', [354]);
			socket.write(message.replace(/^\./gm, '..') + '.\r\n');
			await cmd(null, [250]);
			socket.write('QUIT\r\n');
			finish({ sent: true });
		})().catch((e) => finish({ sent: false, reason: e.message }));
	});
}

module.exports = { sendMail, configured, canSend, buildMessage };
