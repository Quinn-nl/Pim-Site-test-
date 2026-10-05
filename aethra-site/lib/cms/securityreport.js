'use strict';
/** Security overview for administrators: one row per account and a list of system checks. Read-only; nothing here changes anything. */
const db = require('./db');
const users = require('./users');
const settings = require('./settings');
const backup = require('./backup');
const mail = require('../mail');
const cfg = require('../config');

const DAY = 86400000;

function accounts(now = Date.now()) {
	const sessions = users.sessionCounts();
	return users.list().map((u) => {
		const row = db.get('SELECT token_soort, token_tot FROM gebruikers WHERE id = ?', u.id) || {};
		const passkeys = users.passkeyCount(u.id);
		const last = Date.parse(u.laatste_login) || 0;
		const flags = [];
		if (u.actief) {
			if (!users.has2fa(u.id)) flags.push('Geen tweede stap');
			if (last && now - last > 90 * DAY) flags.push('Meer dan 90 dagen niet ingelogd');
			if (!last && now - (Date.parse(u.aangemaakt) || now) > 14 * DAY) flags.push(row.token_soort === 'uitnodiging' ? 'Uitnodiging niet gebruikt' : 'Nooit ingelogd');
			if (row.token_soort === 'uitnodiging' && row.token_tot && row.token_tot < now) flags.push('Uitnodiging verlopen');
		}
		return { id: u.id, naam: u.naam, email: u.email, rol: u.rol, actief: !!u.actief, totp: !!u.totp, passkeys, tweestaps: users.has2fa(u.id), laatste_login: u.laatste_login || '', sessies: sessions[u.id] || 0, open_uitnodiging: row.token_soort === 'uitnodiging' && !!row.token_tot && row.token_tot > now, flags };
	});
}

/** [{ ok, titel, uitleg }] */
function checks(now = Date.now()) {
	const out = [];
	const add = (ok, titel, uitleg) => out.push({ ok, titel, uitleg });
	const rule = settings.get('tweestaps_verplicht');
	add(cfg.SECURE, 'Beveiligde cookies', cfg.SECURE ? 'Inlogcookies krijgen het Secure-kenmerk (alleen via https).' : 'De cookies hebben geen Secure-kenmerk. Op de echte website moet NODE_ENV=production staan (of COOKIE_SECURE=1), achter https.');
	add(!!cfg.SITE_URL, 'Adres van de website (SITE_URL)', cfg.SITE_URL ? cfg.SITE_URL : 'Niet ingesteld. Passkeys en links in e-mails hebben dit adres nodig.');
	add(/^https:/.test(cfg.SITE_URL || ''), 'Website via https', /^https:/.test(cfg.SITE_URL || '') ? 'Ja.' : 'SITE_URL begint niet met https://. Passkeys werken alleen via https (of lokaal).');
	add(mail.canSend(), 'Mailserver ingesteld', mail.canSend() ? 'Meldingen, uitnodigingen en herstelmails kunnen worden verstuurd.' : 'Zonder mailserver blijven uitnodigingen en meldingen in de wachtrij.');
	add(rule !== 'niemand', 'Tweestapsverificatie verplicht', rule === 'niemand' ? 'Nog niet verplicht. Je kunt dit onder Instellingen > Inloggen en toegang aanzetten.' : `Verplicht voor: ${({ beheerder: 'beheerders', beheer_editor: 'beheerders en editors', iedereen: 'iedereen' })[rule]}.`);
	const ipl = settings.get('beheer_ip_lijst');
	add(!!ipl, 'Beheer alleen vanaf bekende netwerken', ipl ? `${ipl.split(/\s+/).filter(Boolean).length} adres(sen) of bereik(en) toegestaan.` : 'Uit. Het beheer is vanaf elk netwerk bereikbaar (inloggen blijft beschermd door wachtwoord en uitsluiting). Optioneel.');
	let last = null; try { last = backup.list()[0]; } catch (e) { /* no back-ups yet */ }
	const fresh = !!last && now - Date.parse(last.tijd) < 36 * 3600 * 1000;
	add(fresh, 'Recente back-up', last ? `Laatste back-up: ${last.tijd.slice(0, 16).replace('T', ' ')}.` : 'Er is nog geen back-up gemaakt.');
	add(process.env.ADMIN_IP_BYPASS !== '1', 'Geen noodknop voor de IP-lijst actief', process.env.ADMIN_IP_BYPASS === '1' ? 'ADMIN_IP_BYPASS=1 staat aan: de IP-lijst wordt genegeerd. Haal die variabele weg zodra je weer bent binnengekomen.' : 'In orde.');
	add(!db.degraded(), 'Database schrijfbaar', db.degraded() ? 'De database staat in alleen-lezen modus.' : 'In orde.');
	return out;
}

function summary(now = Date.now()) {
	const a = accounts(now); const c = checks(now);
	const active = a.filter((x) => x.actief);
	return { accounts: a, checks: c, actief: active.length, zonderTweestaps: active.filter((x) => !x.tweestaps).length, metPasskey: active.filter((x) => x.passkeys > 0).length, aandacht: a.filter((x) => x.flags.length).length + c.filter((x) => !x.ok).length };
}

function csv(now = Date.now()) {
	const cell = (v) => { let t = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
	const rows = accounts(now).map((u) => [u.naam, u.email, u.rol, u.actief ? 'ja' : 'nee', u.tweestaps ? 'ja' : 'nee', u.passkeys, u.laatste_login, u.sessies, u.flags.join('; ')].map(cell).join(','));
	return ['naam,e-mail,rol,actief,tweede stap,passkeys,laatste login,open sessies,aandachtspunten', ...rows].join('\r\n') + '\r\n';
}

module.exports = { accounts, checks, summary, csv };
