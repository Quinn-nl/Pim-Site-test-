'use strict';
/** "Mijn taken" on the dashboard: what needs this person's attention right now. */
const db = require('./db');
const users = require('./users');
const reviews = require('./reviews');
const planning = require('./planning');
const linkcheck = require('./linkcheck');
const backup = require('./backup');
const outbox = require('./outbox');
const messages = require('./messages');
const mail = require('../mail');

function forUser(user, now = Date.now()) {
	const out = [];
	const add = (icon, tekst, href, urgent = false) => out.push({ icon, tekst, href, urgent });
	const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
	if (user.rol !== 'lezer') {
		const mine = db.get("SELECT COUNT(*) AS n FROM berichten WHERE toegewezen_aan = ? AND status != 'afgesloten'", user.id).n;
		if (mine) add('mail', `${plural(mine, 'bericht staat', 'berichten staan')} op jouw naam`, '/admin/berichten?toegewezen=ik', true);
		const unassigned = db.get("SELECT COUNT(*) AS n FROM berichten WHERE status = 'nieuw' AND toegewezen_aan IS NULL").n;
		if (unassigned) add('mail', `${plural(unassigned, 'nieuw bericht wacht', 'nieuwe berichten wachten')} op iemand`, '/admin/berichten?status=nieuw&toegewezen=niemand');
		const drafts = db.all('SELECT object FROM concepten WHERE gebruiker_id = ? ORDER BY bijgewerkt DESC LIMIT 5', user.id);
		for (const d of drafts) {
			const href = d.object === 'privacy' ? '/admin/privacy' : d.object.startsWith('pagina:') ? `/admin/paginas/${d.object.slice(7)}` : `/admin/tekst/${d.object.slice(6)}`;
			add('pages', `Je hebt een onaf concept van ${d.object.startsWith('pagina:') ? `pagina ${d.object.slice(7)}` : d.object === 'privacy' ? 'de privacyverklaring' : d.object.slice(6)}`, href);
		}
	}
	if (users.can(user, 'publiceren')) {
		const n = reviews.pendingCount();
		if (n) add('check', `${plural(n, 'voorstel wacht', 'voorstellen wachten')} op beoordeling`, '/admin/reviews', true);
	}
	if (user.rol === 'redacteur') {
		const open = reviews.list({ mine: user.id, limit: 20 });
		const rejected = open.filter((r) => r.status === 'afgewezen' && Date.now() - Date.parse(r.beoordeeld_op || 0) < 14 * 86400000).length;
		if (rejected) add('alert', `${plural(rejected, 'voorstel is', 'voorstellen zijn')} afgewezen: lees de opmerking`, '/admin/reviews', true);
	}
	const failedPlans = planning.failedCount();
	if (failedPlans && users.can(user, 'publiceren')) add('clock', `${plural(failedPlans, 'geplande publicatie is', 'geplande publicaties zijn')} mislukt`, '/admin/planning', true);
	const broken = linkcheck.brokenCount();
	if (broken && user.rol !== 'lezer') add('link', `${plural(broken, 'kapotte link', 'kapotte links')} gevonden`, '/admin/links');
	const stuck = messages.alarmCount() + (outbox.stats().gefaald || 0);
	if (stuck && user.rol !== 'lezer') add('send', `${plural(stuck, 'mail loopt', 'mails lopen')} vast`, '/admin/wachtrij', true);
	if (user.rol === 'beheerder') {
		const last = backup.list()[0];
		if (!last || now - Date.parse(last.tijd) > 36 * 3600 * 1000) add('server', 'De laatste back-up is ouder dan 36 uur', '/admin/systeem', true);
		if (!mail.canSend()) add('send', 'Er is geen mailserver ingesteld: meldingen en uitnodigingen blijven in de wachtrij', '/admin/systeem');
		if (!users.byId(user.id).totp_geheim) add('lock', 'Zet tweestapsverificatie aan voor je eigen account', '/admin/account');
	} else if (!users.byId(user.id).totp_geheim) add('lock', 'Zet tweestapsverificatie aan voor je account', '/admin/account');
	return out;
}
module.exports = { forUser };
