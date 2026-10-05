'use strict';
/** The weekly report: Monday morning, one short mail for everyone who switched it on under Mijn account. Facts only, no personal data of visitors. */
const db = require('./db');
const users = require('./users');
const outbox = require('./outbox');
const reviews = require('./reviews');
const backup = require('./backup');
const stats = require('../stats');
const cfg = require('../config');

const KEY = 'weekrapport_laatst';
const weekKey = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); const y = t.getUTCFullYear(); return `${y}-W${String(Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0')}`; };

function build(now = new Date()) {
	const since = new Date(now.getTime() - 7 * 86400000).toISOString();
	const s = stats.summary(7);
	const top = Object.entries(s.pages).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${p} (${n})`).join(', ') || '-';
	const msgs = db.get('SELECT COUNT(*) AS n FROM berichten WHERE tijd >= ?', since).n;
	const open = db.get("SELECT COUNT(*) AS n FROM berichten WHERE status IN ('nieuw', 'gelezen', 'in_behandeling')").n;
	const unread = db.get("SELECT COUNT(*) AS n FROM berichten WHERE status = 'nieuw'").n;
	const planned = db.get("SELECT COUNT(*) AS n FROM planning WHERE status = 'wacht' AND wanneer < ?", now.getTime() + 7 * 86400000).n;
	const broken = require('./linkcheck').brokenCount();
	const failedMail = db.get("SELECT COUNT(*) AS n FROM mail_uit WHERE status IN ('mislukt', 'gefaald')").n + db.get("SELECT COUNT(*) AS n FROM uitgaande_wachtrij WHERE status IN ('mislukt', 'gefaald')").n;
	const last = backup.list()[0];
	const lines = [
		`Weekrapport Aethra-website (week ${weekKey(now)})`,
		'',
		`Bezoek: ${s.views} paginaweergaven, ${s.contactViews} op de contactpagina. Meest bekeken: ${top}.`,
		`Berichten: ${msgs} nieuw in de afgelopen week, ${open} nog open (${unread} ongelezen).`,
		`Te beoordelen voorstellen: ${reviews.pendingCount()}.`,
		`Gepland voor de komende week: ${planned}.`,
		`Kapotte links bij de laatste controle: ${broken}.`,
		`Mails met problemen: ${failedMail}.`,
		`Laatste back-up: ${last ? last.tijd.slice(0, 16).replace('T', ' ') + ' (UTC)' : 'nog geen'}.`,
		'',
		`Naar het beheer: ${cfg.SITE_URL ? cfg.SITE_URL + '/admin' : '/admin'}`,
		'Uitzetten kan onder Mijn account.',
	];
	return { onderwerp: `Weekrapport Aethra-website (${weekKey(now)})`, tekst: lines.join('\n') + '\n' };
}

/** Sends the report once per week, on Monday from 07:00 (server time). Returns how many mails were queued. */
function sendWeekly(now = new Date()) {
	if (now.getDay() !== 1 || now.getHours() < 7) return 0;
	const week = weekKey(now);
	const last = db.get('SELECT waarde FROM instellingen WHERE sleutel = ?', KEY);
	if (last && last.waarde === week) return 0;
	db.run('INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde', KEY, week);
	const r = build(now);
	let n = 0;
	for (const u of users.subscribers('weekrapport')) if (outbox.send({ aan: u.email, soort: 'weekrapport', ...r })) n += 1;
	return n;
}
module.exports = { build, sendWeekly, weekKey };
