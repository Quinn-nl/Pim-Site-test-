'use strict';
/**
 * Mail that is not a contact-form message: invitations, password resets, notifications, the weekly report.
 * Same promise as the message queue: the row is written first, a worker sends it, a failure waits 10, 20, 40, 80 minutes and is given up after 5 tries.
 * Nothing in the queue contains more than the mail itself; error texts never contain addresses.
 */
const db = require('./db');
const mail = require('../mail');

const MAX_ATTEMPTS = 5;
const BASE_WAIT_MS = 5 * 60 * 1000;
const waitAfter = (attempts) => (2 ** attempts) * BASE_WAIT_MS;
let ticking = false;
let timer = null;
let kicked = null;

function send({ aan, onderwerp, tekst, soort = 'melding' }) {
	const to = String(aan || '').trim();
	if (!/^[^\s@<>(),;:\\"]+@[^\s@<>(),;:\\"]+\.[^\s@<>(),;:\\"]+$/.test(to)) return null;
	const r = db.run('INSERT INTO mail_uit (aan, onderwerp, tekst, soort, status, pogingen, volgende_poging, aangemaakt) VALUES (?, ?, ?, ?, ?, 0, 0, ?)', to, String(onderwerp).slice(0, 200), String(tekst).slice(0, 20000), soort, 'wacht', Date.now());
	kick();
	return r.id;
}

async function tick(now = Date.now(), transport = mail.sendMail) {
	if (ticking || db.degraded()) return 0;
	ticking = true;
	let handled = 0;
	try {
		if (!mail.canSend() && transport === mail.sendMail) return 0;
		const due = db.all("SELECT * FROM mail_uit WHERE status = 'wacht' OR (status = 'mislukt' AND volgende_poging <= ?) ORDER BY id LIMIT 20", now);
		for (const row of due) {
			let result;
			try { result = await transport({ to: [row.aan], subject: row.onderwerp, text: row.tekst }); } catch (e) { result = { sent: false, reason: e.message }; }
			handled += 1;
			if (result && result.sent) { db.run("UPDATE mail_uit SET status = 'verzonden', fout = NULL WHERE id = ?", row.id); continue; }
			const attempts = row.pogingen + 1;
			const reason = String((result && result.reason) || 'unknown error').slice(0, 200);
			if (attempts >= MAX_ATTEMPTS) db.run("UPDATE mail_uit SET status = 'gefaald', pogingen = ?, fout = ? WHERE id = ?", attempts, reason, row.id);
			else db.run("UPDATE mail_uit SET status = 'mislukt', pogingen = ?, volgende_poging = ?, fout = ? WHERE id = ?", attempts, now + waitAfter(attempts), reason, row.id);
		}
	} finally { ticking = false; }
	return handled;
}
const list = (limit = 50) => db.all('SELECT id, aan, onderwerp, soort, status, pogingen, volgende_poging, fout, aangemaakt FROM mail_uit ORDER BY id DESC LIMIT ?', limit);
const stats = () => Object.fromEntries(db.all('SELECT status, COUNT(*) AS n FROM mail_uit GROUP BY status').map((r) => [r.status, r.n]));
function retry(id) { db.run("UPDATE mail_uit SET status = 'wacht', pogingen = 0, volgende_poging = 0 WHERE id = ? AND status IN ('mislukt', 'gefaald')", id); kick(); }
/** Sent mail is kept a week for troubleshooting, then removed (the text can contain a one-time link). */
const purge = (now = Date.now()) => db.run("DELETE FROM mail_uit WHERE status IN ('verzonden', 'gefaald') AND aangemaakt < ?", now - 7 * 86400000).changes;

function kick() {
	if (kicked) return;
	kicked = setTimeout(() => { kicked = null; tick().catch(() => {}); }, 50);
	kicked.unref();
}
function start() {
	if (timer) return;
	timer = setInterval(() => tick().catch(() => {}), 60000);
	timer.unref();
}
const stop = () => { if (timer) clearInterval(timer); timer = null; if (kicked) clearTimeout(kicked); kicked = null; };

module.exports = { send, tick, list, stats, retry, purge, start, stop, waitAfter, MAX_ATTEMPTS };
