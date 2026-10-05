'use strict';
/**
 * The admin: every route under /admin. Frameworkless.
 * Security on every response: CSP with a per-request nonce, X-Frame-Options, nosniff, Referrer-Policy, no-store.
 * Session cookie: HttpOnly, SameSite=Strict, Path=/admin (Secure in production). CSRF token per session on every POST.
 * While the database is unreachable every route answers 503 (the public site keeps serving its cached pages).
 */
const crypto = require('crypto');
const cfg = require('../config');
const db = require('./db');
const users = require('./users');
const content = require('./content');
const pages = require('./pages');
const media = require('./media');
const menu = require('./menu');
const settings = require('./settings');
const backup = require('./backup');
const outbox = require('./outbox');
const reviews = require('./reviews');
const planning = require('./planning');
const sharelinks = require('./sharelinks');
const translations = require('./translations');
const seo = require('./seo');
const tasks = require('./tasks');
const replies = require('./replies');
const search = require('./search');
const HELP = require('./help');
const linkcheck = require('./linkcheck');
const compliance = require('./compliance');
const { robotsTxt } = require('../robots');
const fs = require('fs');
const path = require('path');
const mail = require('../mail');
const messages = require('./messages');
const redirects = require('./redirects');
const audit = require('./audit');
const events = require('./events');
const ws = require('./ws');
const cache = require('./cache');
const publish = require('./publish');
const render = require('./render');
const views = require('./views');
const stats = require('../stats');
const { GROUPS, FIELDS } = require('../fields');
const { LANGS, PRIVACY } = require('../i18n');
const { readForm, readBody, clientIp } = require('../http');
const { TEMPLATES } = require('./templates');

const VERSION = require('../../package.json').version;

/* ---- responses ---- */
function headers(nonce, extra = {}) {
	const h = {
		'Content-Security-Policy': `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'`,
		'X-Frame-Options': 'DENY',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Resource-Policy': 'same-origin',
		'Cache-Control': 'no-store',
		'X-Robots-Tag': 'noindex, nofollow',
		...extra,
	};
	if (cfg.SECURE) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
	return h;
}

/** Everything the system page shows. */
function systemInfo() {
	const dirSize = (dir) => { let n = 0; let files = 0; try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) { const r = dirSize(f); n += r.bytes; files += r.files; } else { n += fs.statSync(f).size; files += 1; } } } catch (e) { /* missing folder */ } return { bytes: n, files }; };
	let disk = null;
	try { const st = fs.statfsSync(cfg.DATA_DIR); disk = { vrij: st.bavail * st.bsize, totaal: st.blocks * st.bsize }; } catch (e) { /* not supported here */ }
	const uploads = dirSize(media.uploadsDir());
	return {
		versie: VERSION, node: process.version, uptime: Math.round(process.uptime()), dbBytes: (() => { try { return fs.statSync(db.file()).size; } catch (e) { return 0; } })(), dbOk: !db.degraded(), uploads, disk,
		smtp: mail.canSend(), team: mail.configured(), queue: messages.queueStats(), outbox: outbox.stats(), cache: cache.stats(), backups: backup.list(), keep: backup.KEEP,
		gezondheid: db.all('SELECT bericht, ernst FROM gezondheid ORDER BY ernst, sleutel'), siteUrl: cfg.SITE_URL, secure: cfg.SECURE, now: Date.now(),
	};
}

/** After a successful sign-in: a mail to the person when this is a browser we have not seen before (not on the very first login). */
function afterLogin(userId, req, ip) {
	try {
		const u = users.byId(userId);
		if (users.noteDevice(userId, req.headers['user-agent'])) {
			audit.log({ user: userId, actie: 'login.nieuw_apparaat', entiteit: `gebruiker:${userId}`, nieuw: { apparaat: users.describeDevice(req.headers['user-agent']), netwerk: users.subnetOf(ip) } });
			outbox.send({ aan: u.email, soort: 'beveiliging', onderwerp: 'Nieuwe inlog bij het Aethra-beheer', tekst: `Hallo ${u.naam},\n\nEr is zojuist ingelogd op je account vanaf een apparaat dat we nog niet kenden: ${users.describeDevice(req.headers['user-agent'])}, netwerk ${users.subnetOf(ip)}, ${new Date().toLocaleString('nl-NL')}.\n\nWas jij dit niet? Verander dan direct je wachtwoord (Mijn account) en laat een beheerder de sessies beëindigen.\n` });
		}
	} catch (e) { /* a notification problem never blocks a sign-in */ }
}

/** The address links in mails point to. Never taken from the Host header of an arbitrary request (that would let anyone poison a reset mail). */
function linkBase(req) {
	if (cfg.SITE_URL) return cfg.SITE_URL;
	const host = String(req.headers.host || '');
	return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? `http://${host}` : null;
}
const mailTexts = {
	herstel: (naam, link) => ({ onderwerp: 'Nieuw wachtwoord voor het Aethra-beheer', tekst: `Hallo ${naam},\n\nEr is een nieuw wachtwoord aangevraagd voor je account. Kies het via deze link (een uur geldig, eenmalig):\n\n${link}\n\nHeb je dit niet aangevraagd? Dan hoef je niets te doen; je wachtwoord blijft zoals het was.\n` }),
	uitnodiging: (naam, link) => ({ onderwerp: 'Je bent uitgenodigd voor het Aethra-beheer', tekst: `Hallo ${naam},\n\nJe hebt een account gekregen voor het beheer van de Aethra-website. Kies je wachtwoord via deze link (drie dagen geldig, eenmalig):\n\n${link}\n\nZet daarna ook tweestapsverificatie aan onder Mijn account.\n` }),
};
/** Sends the link by mail when mail works. Returns the link when it has to be handed over by hand instead. */
function deliverToken(req, user, soort, token) {
	const base = linkBase(req);
	const link = base ? `${base}/admin/herstel?token=${token}` : null;
	if (link && mail.canSend()) { const t = mailTexts[soort](user.naam, link); outbox.send({ aan: user.email, soort: soort === 'uitnodiging' ? 'uitnodiging' : 'herstel', ...t }); return { mailed: true, link: null }; }
	return { mailed: false, link: link || `/admin/herstel?token=${token}` };
}

const FLASH = {
	opgeslagen: { ok: true, text: 'Opgeslagen.' }, verwijderd: { ok: true, text: 'Verwijderd.' }, ingekort: { ok: true, text: 'De ketens zijn ingekort: elke oude link gaat nu in één keer naar de laatste pagina.' }, wachtwoord: { ok: true, text: 'Wachtwoord gewijzigd. Andere sessies zijn uitgelogd.' },
	foutwachtwoord: { ok: false, text: 'Het huidige wachtwoord klopt niet.' }, kort: { ok: false, text: 'Gebruik minstens 12 tekens.' }, nofile: { ok: false, text: 'Kies eerst een bestand.' },
	badimg: { ok: false, text: 'Upload een JPG-, PNG- of WebP-afbeelding van maximaal 5 MB.' }, vernieuwd: { ok: true, text: 'De sitemap en alle opgeslagen pagina’s worden opnieuw opgebouwd bij het volgende bezoek.' }, gestart: { ok: true, text: 'De linkcontrole is gestart. Dit kan even duren.' }, teruggezet: { ok: true, text: 'Teruggezet. De vorige staat staat in de geschiedenis.' }, gemaakt: { ok: true, text: 'Aangemaakt.' },
	backup: { ok: true, text: 'Back-up gemaakt.' }, goedgekeurd: { ok: true, text: 'Goedgekeurd en gepubliceerd.' }, teruggezet: { ok: true, text: 'Teruggezet. Een pagina komt terug als concept.' }, geenselectie: { ok: false, text: 'Vink eerst een of meer berichten aan.' }, naam: { ok: true, text: 'Naam bijgewerkt.' }, sessies: { ok: true, text: 'Alle andere apparaten zijn uitgelogd.' },
	geblokkeerd: { ok: false, text: 'Te veel pogingen. Probeer het later opnieuw.' },
};

async function handleAdmin(req, res, url) {
	const nonce = crypto.randomBytes(16).toString('base64');
	const ip = clientIp(req);
	const p = url.pathname;
	const out = (status, body, extra = {}) => { res.writeHead(status, headers(nonce, { 'Content-Type': 'text/html; charset=utf-8', ...extra })); res.end(body); return true; };
	const jsonOut = (status, obj) => { res.writeHead(status, headers(nonce, { 'Content-Type': 'application/json; charset=utf-8' })); res.end(JSON.stringify(obj)); return true; };
	const go = (to, extra = {}) => { res.writeHead(303, headers(nonce, { Location: to, ...extra })); res.end(); return true; };
	const wantsJson = () => /json/.test(String(req.headers.accept || '')) || /json/.test(String(req.headers['content-type'] || '')) || req.headers['x-requested-with'] === 'fetch';
	const fail = (status, text, ctx) => (wantsJson() ? jsonOut(status, { ok: false, melding: text }) : out(status, views.errorPage(ctx || { nonce }, status, text)));

	if (req.method === 'POST' && !sameOrigin(req)) return fail(403, 'Verzoek geweigerd (andere herkomst).');
	if (db.degraded()) { if (!db.ping()) return fail(503, 'De database is tijdelijk niet bereikbaar. De website blijft gewoon draaien; wijzigen kan pas als de database weer werkt.'); }

	let session = null;
	try { session = users.getSession(req, ip); } catch (e) { return fail(503, 'De database is tijdelijk niet bereikbaar.'); }
	const flash = FLASH[url.searchParams.get('f')] || null;
	const badges = (u) => { try { return { berichten: messages.unreadCount() || '', reviews: u && users.can(u, 'publiceren') ? reviews.pendingCount() || '' : '' }; } catch (e) { return {}; } };
	const ctx = { session, nonce, flash, get badges() { return badges(session && session.user); } };
	const can = (action) => users.can(session && session.user, action);

	/* ---- signing in ---- */
	if (!session) {
		if (req.method === 'GET' && p === '/admin') return out(200, views.loginPage(ctx, { setup: users.count() === 0 }));
		if (req.method === 'POST' && p === '/admin/login') {
			const form = await readForm(req, 4096);
			const email = String(form.email || '').trim().toLowerCase();
			const r = users.checkLogin(ip, email, form.password || '');
			if (r.locked) { try { users.notifyLock(email); } catch (e) { /* never block the answer */ } return out(429, views.loginPage(ctx, { flash: { ok: false, text: `Te veel pogingen. Probeer het opnieuw na ${new Date(r.until).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}.` } })); }
			if (r.error) return out(401, views.loginPage(ctx, { flash: { ok: false, text: 'E-mailadres of wachtwoord klopt niet.' }, setup: users.count() === 0 }));
			if (r.user.totp_geheim) return out(200, views.codePage(ctx, users.createTicket(r.user.id, ip, email)));
			users.clearAttempts(ip, email);
			const s = users.createSession(r.user.id, ip, req.headers['user-agent']);
			afterLogin(r.user.id, req, ip);
			audit.log({ user: r.user.id, actie: 'login.gelukt', entiteit: `gebruiker:${r.user.id}` });
			return go('/admin', { 'Set-Cookie': users.cookieHeader(s.id, 8 * 3600) });
		}
		if (req.method === 'GET' && p === '/admin/vergeten') return out(200, views.forgotPage(ctx, {}));
		if (req.method === 'POST' && p === '/admin/vergeten') {
			const form = await readForm(req, 4096);
			const email = String(form.email || '').trim().toLowerCase();
			const gate = users.lockState(ip, `vergeten:${ip}`);
			if (gate.locked) return out(429, views.forgotPage(ctx, { flash: { ok: false, text: 'Te veel verzoeken. Probeer het later opnieuw.' } }));
			users.failedAttempt(ip, `vergeten:${ip}`);   // every request counts: the form is not an oracle for which accounts exist
			const u = users.byEmail(email);
			if (u && u.actief) { const d = deliverToken(req, u, 'herstel', users.createToken(u.id, 'herstel')); audit.log({ user: u.id, actie: 'gebruiker.herstel_aangevraagd', entiteit: `gebruiker:${u.id}`, nieuw: { gemaild: d.mailed } }); }
			return out(200, views.forgotPage(ctx, { done: true }));
		}
		if (p === '/admin/herstel') {
			const token = String(url.searchParams.get('token') || '');
			if (req.method === 'GET') { const u = users.findByToken(token); return out(u ? 200 : 410, views.resetPage(ctx, u ? { token, user: u } : { invalid: true })); }
			if (req.method === 'POST') {
				const form = await readForm(req, 4096);
				const key = `token:${ip}`;
				if (users.lockState(ip, key).locked) return out(429, views.resetPage(ctx, { invalid: true, flash: { ok: false, text: 'Te veel pogingen. Probeer het later opnieuw.' } }));
				const u = users.findByToken(String(form.token || ''));
				if (!u) { users.failedAttempt(ip, key); return out(410, views.resetPage(ctx, { invalid: true })); }
				const again = (text, status = 400) => out(status, views.resetPage(ctx, { token: String(form.token), user: u, flash: { ok: false, text } }));
				if (String(form.password || '').length < 12) return again('Gebruik minstens 12 tekens.');
				if (form.password !== form.password2) return again('De twee wachtwoorden zijn niet gelijk.');
				if (u.totp_geheim && u.token_soort === 'herstel' && !users.verifySecondFactor(u.id, form.code)) { users.failedAttempt(ip, key); return again('De code uit je authenticator-app klopt niet.', 401); }
				users.setPassword(u.id, form.password, u.id);
				users.clearToken(u.id);
				users.destroyOthers(u.id, '');
				users.clearAttempts(ip, key);
				audit.log({ user: u.id, actie: u.token_soort === 'uitnodiging' ? 'gebruiker.uitnodiging_geaccepteerd' : 'gebruiker.herstel', entiteit: `gebruiker:${u.id}` });
				return out(200, views.loginPage(ctx, { flash: { ok: true, text: 'Je wachtwoord is ingesteld. Log nu in.' } }));
			}
		}
		if (req.method === 'POST' && p === '/admin/login/code') {
			const form = await readForm(req, 4096);
			const t = users.useTicket(String(form.ticket || ''));
			if (!t) return out(401, views.loginPage(ctx, { flash: { ok: false, text: 'Deze stap is verlopen. Log opnieuw in.' } }));
			const st = users.lockState(ip, t.email);
			if (st.locked) return out(429, views.loginPage(ctx, { flash: { ok: false, text: 'Te veel pogingen. Probeer het later opnieuw.' } }));
			if (!users.verifySecondFactor(t.userId, form.code)) {
				const f = users.failedAttempt(ip, t.email);
				audit.log({ user: t.userId, actie: 'login.code_mislukt', entiteit: `gebruiker:${t.userId}` });
				if (f.locked) return out(429, views.loginPage(ctx, { flash: { ok: false, text: 'Te veel pogingen. Probeer het later opnieuw.' } }));
				return out(401, views.codePage(ctx, String(form.ticket), { ok: false, text: 'Die code klopt niet.' }));
			}
			users.endTicket(String(form.ticket));
			users.clearAttempts(ip, t.email);
			const s = users.createSession(t.userId, ip, req.headers['user-agent']);
			afterLogin(t.userId, req, ip);
			audit.log({ user: t.userId, actie: 'login.gelukt', entiteit: `gebruiker:${t.userId}`, nieuw: { tweestaps: true } });
			return go('/admin', { 'Set-Cookie': users.cookieHeader(s.id, 8 * 3600) });
		}
		if (wantsJson()) return jsonOut(401, { ok: false, melding: 'Je bent uitgelogd. Log opnieuw in.' });
		return go('/admin');
	}

	/* ---- everything below needs a session ---- */
	ctx.session = session;
	try { ctx.maintenance = settings.maintenance(); } catch (e) { ctx.maintenance = false; }
	const isPost = req.method === 'POST';
	let form = null;
	let body = null;
	const csrfOk = (token) => !!token && users.safeEqual(token, session.csrf);
	if (isPost && p !== '/admin/media/upload') {
		if (/json/.test(String(req.headers['content-type'] || ''))) {
			if (!csrfOk(req.headers['x-csrf-token'])) return fail(403, 'Verzoek geweigerd (CSRF).', ctx);
			try { body = JSON.parse((await readBody(req, 700 * 1024)).toString('utf8')); } catch (e) { if (e.status === 413) return fail(413, 'Te groot.', ctx); return fail(400, 'Ongeldige gegevens.', ctx); }
		} else {
			try { form = await readForm(req, 700 * 1024); } catch (e) { return fail(e.status || 400, 'Verzoek te groot of ongeldig.', ctx); }
			if (!csrfOk(form.csrf)) return fail(403, 'Verzoek geweigerd (CSRF).', ctx);
		}
	}
	const needWrite = () => (can('schrijven') ? true : (fail(403, 'Je hebt alleen leesrechten.', ctx), false));
	const needPublish = () => (can('publiceren') ? true : (fail(403, 'Alleen een editor of beheerder mag dit. Als redacteur dien je een voorstel in.', ctx), false));
	const needAdmin = () => (can('beheer') ? true : (fail(403, 'Alleen een beheerder mag dit.', ctx), false));
	const user = session.user;

	if (p === '/admin/logout' && isPost) {
		users.destroySession(req);
		audit.log({ user: user.id, actie: 'logout', entiteit: `gebruiker:${user.id}` });
		return go('/admin', { 'Set-Cookie': users.cookieHeader('', 0) });
	}

	/* ---- dashboard ---- */
	if (req.method === 'GET' && p === '/admin') {
		const extra = pages.list();
		return out(200, views.dashboardPage(ctx, {
			nieuw: messages.unreadCount(), mailMislukt: messages.alarmCount(), concepten: extra.filter((x) => x.status === 'concept').length, publiek: extra.filter((x) => x.status === 'gepubliceerd').length,
			gezondheid: db.all('SELECT bericht, ernst FROM gezondheid ORDER BY ernst, sleutel'), locks: ws.snapshot(),
			recent: audit.list({ limit: 8 }).filter((a) => !/^login|logout/.test(a.actie)), dbOk: !db.degraded(), cache: cache.stats(), versie: VERSION, tasks: tasks.forUser(user),
		}));
	}
	if (req.method === 'GET' && p === '/admin/events') { messages.alarm(); events.broadcast('berichten', { nieuw: messages.unreadCount() }); return events.handle(req, res, headers(nonce)), true; }

	/* ---- pages and texts: lists ---- */
	if (req.method === 'GET' && p === '/admin/paginas') return out(200, views.pagesPage(ctx, { extra: pages.list(), locks: ws.snapshot(), info: Object.fromEntries(db.all('SELECT o.object, o.gewijzigd_op, g.naam FROM objecten o LEFT JOIN gebruikers g ON g.id = o.gewijzigd_door').map((r) => [r.object, r])) }));
	if (req.method === 'GET' && p === '/admin/paginas/nieuw') return out(200, views.newPagePage(ctx, { existing: pages.list() }));
	if (isPost && p === '/admin/paginas/nieuw') {
		if (!needWrite()) return true;
		if (/^\d+$/.test(String(form.kopie_van || ''))) { try { return go(`/admin/paginas/${pages.duplicate(Number(form.kopie_van), user)}`); } catch (e) { return fail(e.status || 400, e.errors ? e.errors[0] : e.message, ctx); } }
		if (!TEMPLATES[form.sjabloon]) return go('/admin/paginas/nieuw');
		const id = pages.create({ sjabloon: form.sjabloon, user });
		return go(`/admin/paginas/${id}`);
	}

	/* ---- editors ---- */
	const draftFor = (object, versie) => {
		const d = content.getDraft(object, user.id);
		if (!d) return null;
		const info = db.get('SELECT gewijzigd_op FROM objecten WHERE object = ?', object);
		if (d.basis_versie !== versie || (info && d.bijgewerkt < info.gewijzigd_op)) { content.deleteDraft(object, user.id); return null; }
		return d;
	};
	let m;
	if (req.method === 'GET' && (m = /^\/admin\/tekst\/([a-z_]+)$/.exec(p))) {
		const group = GROUPS.find((g) => g.id === m[1]);
		if (!group) return fail(404, 'Onbekende tekstgroep.', ctx);
		const object = content.textObject(group.id);
		const values = {};
		for (const l of LANGS) { const v = content.textValues(l); values[l] = Object.fromEntries(group.fields.map((f) => [f.key, v[f.key]])); }
		const versie = content.objectVersion(object);
		return out(200, views.textEditorPage(ctx, group.id, { values, statuses: content.readStatus(object), versie, draft: draftFor(object, versie), locked: ws.heldByOther(object, user.id) }));
	}
	if (req.method === 'GET' && p === '/admin/privacy') {
		const saved = content.readObject('privacy');
		const values = Object.fromEntries(LANGS.map((l) => [l, (saved[l] && saved[l].text) || content.privacyText(l) || PRIVACY[l]]));
		const versie = content.objectVersion('privacy');
		return out(200, views.privacyEditorPage(ctx, { values, versie, draft: draftFor('privacy', versie), statuses: content.readStatus('privacy') }));
	}
	if (req.method === 'GET' && (m = /^\/admin\/paginas\/(\d+)$/.exec(p))) {
		const pg = pages.get(Number(m[1]));
		if (!pg) return fail(404, 'Pagina niet gevonden.', ctx);
		pg.draft = draftFor(pages.object(pg.meta.id), pg.versie);
		return out(200, views.pageEditorPage(ctx, pg.meta.id, pg));
	}
	if (isPost && (m = /^\/admin\/paginas\/(\d+)\/verwijderen$/.exec(p))) {
		if (!needPublish()) return true;
		const holder = ws.heldByOther(pages.object(Number(m[1])), user.id);
		if (holder) return fail(423, `${holder} is deze pagina momenteel aan het bewerken.`, ctx);
		pages.remove(Number(m[1]), user);
		return go('/admin/paginas?f=verwijderd');
	}

	/* ---- JSON API of the editors ---- */
	const objectOf = (b) => (b.kind === 'tekst' ? content.textObject(String(b.id || '')) : b.kind === 'pagina' ? pages.object(Number(b.id)) : b.kind === 'privacy' ? 'privacy' : null);
	if (isPost && (p === '/admin/publish' || p === '/admin/publish/override')) {
		if (!can('schrijven')) return jsonOut(403, { ok: false, melding: 'Je hebt alleen leesrechten.' });
		if (!body) return jsonOut(400, { ok: false, melding: 'Ongeldige gegevens.' });
		const object = objectOf(body);
		if (!object) return jsonOut(400, { ok: false, melding: 'Onbekend onderdeel.' });
		if (!can('publiceren') && body.kind === 'pagina' && body.meta && body.meta.status === 'concept' && ((pages.get(Number(body.id)) || {}).meta || {}).status === 'gepubliceerd') return jsonOut(403, { ok: false, melding: 'Een redacteur kan een pagina niet offline halen. Vraag het een editor.' });
		if (!can('publiceren') && reviews.goesLive(body.kind, body)) {      // a redacteur proposes instead of publishing
			if (p === '/admin/publish/override') return jsonOut(403, { ok: false, melding: 'Een redacteur kan niets zelf publiceren.' });
			try { const r = reviews.submit(body, user); return jsonOut(200, { ok: true, review: r.id, versie: Number(body.baseVersie) || 0, notes: r.waarschuwingen.map((w) => w.melding) }); } catch (e) { return jsonOut(e.status || 500, { ok: false, melding: e.message, fouten: e.fouten || null, waarschuwingen: e.waarschuwingen || null }); }
		}
		const holder = ws.heldByOther(object, user.id);
		if (holder) return jsonOut(423, { ok: false, melding: `${holder} is deze pagina momenteel aan het bewerken.` });
		const override = p === '/admin/publish/override';
		const reden = override ? String(body.override_reason || '').trim() : '';
		if (override && reden.length < 10) return jsonOut(400, { ok: false, melding: 'Geef een reden van minstens 10 tekens op.' });
		try {
			const params = { velden: body.velden, meta: body.meta, baseVersie: body.baseVersie, overrideReden: reden || null };
			if (body.kind === 'tekst') params.groupId = String(body.id); else params.id = Number(body.id);
			const r = publish.publish(body.kind, params, user);
			return jsonOut(200, { ok: true, versie: r.versie, gewijzigd: r.gewijzigd, notes: r.notes || [] });
		} catch (e) {
			const status = [400, 404, 409, 413, 422, 423].includes(e.status) ? e.status : 500;
			if (status === 500) { console.error(e); return jsonOut(500, { ok: false, melding: 'Er ging iets mis bij het opslaan. Er is niets gewijzigd.' }); }
			return jsonOut(status, { ok: false, melding: e.message, fouten: e.fouten || null, waarschuwingen: e.waarschuwingen || null, huidige_versie: e.huidige_versie == null ? null : e.huidige_versie });
		}
	}
	if (isPost && p === '/admin/auto-save') {
		if (!can('schrijven')) return jsonOut(403, { ok: false });
		const object = body && typeof body.object === 'string' ? body.object : '';
		const known = /^tekst:([a-z_]+)$/.exec(object) ? GROUPS.some((g) => `tekst:${g.id}` === object) : /^pagina:(\d+)$/.test(object) ? !!pages.get(Number(object.slice(7))) : object === 'privacy';
		if (!known) return jsonOut(400, { ok: false });
		if (ws.heldByOther(object, user.id)) return jsonOut(423, { ok: false });
		try { content.saveDraft(object, user.id, body.data, Number(body.basisVersie) || 0); } catch (e) { return jsonOut(e.status || 500, { ok: false }); }
		return jsonOut(200, { ok: true, tijd: db.iso() });
	}
	if (isPost && p === '/admin/api/concept-weg') {
		const object = objectOf({ kind: body && body.kind, id: body && body.id });
		if (object) content.deleteDraft(object, user.id);
		return jsonOut(200, { ok: true });
	}
	if (isPost && p === '/admin/api/check') {
		if (!body) return jsonOut(400, { ok: false });
		try {
			const params = { velden: body.velden, meta: body.meta };
			if (body.kind === 'tekst') params.groupId = String(body.id); else params.id = Number(body.id);
			return jsonOut(200, { ok: true, ...publish.check(body.kind, params) });
		} catch (e) { return jsonOut(e.status || 400, { ok: false, melding: e.message, fouten: e.fouten || null }); }
	}
	if (isPost && p === '/admin/api/nagekeken') {
		if (!can('schrijven')) return jsonOut(403, { ok: false });
		const object = objectOf({ kind: body && body.kind, id: body && body.id });
		if (!object || !LANGS.includes(body.taal)) return jsonOut(400, { ok: false });
		return jsonOut(200, { ok: true, velden: content.markReviewed(object, body.taal, user) });
	}

	/* ---- live preview: a form posts the editor state into a sandboxed iframe; nothing is stored ---- */
	if (isPost && p === '/admin/preview') {
		let payload;
		try { payload = JSON.parse(String(form.payload || '{}')); } catch (e) { return out(400, '<p>Ongeldig voorbeeld.</p>'); }
		const lang = LANGS.includes(payload.lang) ? payload.lang : 'en';
		const siteUrl = cfg.SITE_URL || `${cfg.SECURE ? 'https' : 'http'}://${req.headers.host || 'localhost'}`;
		const html = render.previewAny({ kind: payload.kind, lang, velden: payload.velden, meta: payload.meta, path: payload.path, siteUrl });
		if (!html) return out(200, '<!doctype html><meta charset="utf-8"><p style="font:16px system-ui;padding:2rem">Voor deze pagina is geen voorbeeld beschikbaar.</p>', { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Frame-Options': 'SAMEORIGIN' });
		const shown = html.replace('<head>', '<head>\n<base target="_blank">').replace(/<script[\s\S]*?<\/script>/g, '');
		res.writeHead(200, headers(nonce, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'", 'X-Frame-Options': 'SAMEORIGIN' }));
		res.end(shown);
		return true;
	}

	/* ---- history ---- */
	if (req.method === 'GET' && p === '/admin/historie') {
		const object = String(url.searchParams.get('object') || '');
		return out(200, views.historyPage(ctx, { object, entries: content.history(object) }));
	}
	if (req.method === 'GET' && (m = /^\/admin\/historie\/(\d+)$/.exec(p))) {
		const entry = content.historyEntry(Number(m[1]));
		if (!entry) return fail(404, 'Versie niet gevonden.', ctx);
		const now = content.readObject(entry.object);
		return out(200, views.diffPage(ctx, { entry, object: entry.object, diff: content.diffObjects(entry.snapshot.velden, now), huidigeVersie: content.objectVersion(entry.object) }));
	}
	if (isPost && (m = /^\/admin\/historie\/(\d+)\/terugzetten$/.exec(p))) {
		if (!needPublish()) return true;
		const entry = content.historyEntry(Number(m[1]));
		if (!entry) return fail(404, 'Versie niet gevonden.', ctx);
		const holder = ws.heldByOther(entry.object, user.id);
		if (holder) return fail(423, `${holder} is dit onderdeel momenteel aan het bewerken.`, ctx);
		try {
			const basis = Number(form.basis);
			if (/^pagina:(\d+)$/.test(entry.object)) pages.rollback(Number(entry.object.slice(7)), entry.id, { user, baseVersie: basis });
			else content.writeFields(entry.object, entry.snapshot.velden, { user, baseVersie: basis, reden: 'rollback' });
		} catch (e) { return fail(e.status || 500, e.message, ctx); }
		return go(`/admin/historie?object=${encodeURIComponent(entry.object)}&f=teruggezet`);
	}

	/* ---- media ---- */
	const mediaData = () => { const items = media.list(); return { items, slots: media.slots(), enc: media.encodersAvailable(), usage: Object.fromEntries(items.map((m) => [m.id, media.usage(m.id)])) }; };
	if (req.method === 'GET' && p === '/admin/media') return out(200, views.mediaPage({ ...ctx }, mediaData()));
	if (isPost && p === '/admin/media/upload') {
		if (!can('schrijven')) { res.writeHead(403, headers(nonce, { Connection: 'close' })); res.end(); return true; }
		let up;
		try {
			up = await media.streamUpload(req);
		} catch (e) {
			if (e.abort) { res.writeHead(413, headers(nonce, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' })); res.end('Bestand te groot', () => req.socket.destroy()); return true; }
			return go(`/admin/media?f=${e.code === 'badimg' ? 'badimg' : 'nofile'}`);
		}
		if (!csrfOk(up.fields.csrf)) { if (up.file) require('fs').rmSync(up.file.path, { force: true }); return fail(403, 'Verzoek geweigerd (CSRF).', ctx); }
		if (!up.file) return go('/admin/media?f=nofile');
		try {
			await media.saveUpload({ tmpPath: up.file.path, alt: Object.fromEntries(LANGS.map((l) => [l, up.fields[`alt_${l}`]])), rechten: up.fields.rechten, bron: up.fields.bron, user });
		} catch (e) { return out(e.status || 500, views.mediaPage({ ...ctx, flash: { ok: false, text: e.message } }, mediaData())); }
		return go('/admin/media?f=opgeslagen');
	}
	if (isPost && p === '/admin/media/plek') {
		if (!needPublish()) return true;
		try { media.setSlot(String(form.plek), form.media ? Number(form.media) : null, user); } catch (e) { return fail(e.status || 400, e.message, ctx); }
		return go('/admin/media?f=opgeslagen');
	}
	if (isPost && (m = /^\/admin\/media\/(\d+)$/.exec(p))) {
		if (!needPublish()) return true;
		try { media.update(Number(m[1]), { alt: Object.fromEntries(LANGS.map((l) => [l, form[`alt_${l}`]])), rechten: form.rechten, bron: form.bron, focus_x: form.focus_x, focus_y: form.focus_y }, user); } catch (e) { return fail(e.status || 400, e.message, ctx); }
		return go('/admin/media?f=opgeslagen');
	}
	if (isPost && (m = /^\/admin\/media\/(\d+)\/verwijderen$/.exec(p))) {
		if (!needPublish()) return true;
		try { media.remove(Number(m[1]), user); } catch (e) { return fail(e.status || 400, e.message, ctx); }
		return go('/admin/media?f=verwijderd');
	}

	/* ---- messages ---- */
	const filterOf = (u) => {
		const f = Object.fromEntries(['q', 'status', 'rol', 'taal', 'bron', 'van', 'tot', 'toegewezen'].map((k) => [k, String(u.searchParams.get(k) || '').slice(0, 200)]));
		if (f.toegewezen === 'ik') f.toegewezen = String(user.id);
		return f;
	};
	if (req.method === 'GET' && p === '/admin/berichten') {
		const filter = filterOf(url);
		const per = 50;
		const total = messages.count(filter);
		const pagesN = Math.max(1, Math.ceil(total / per));
		const page = Math.min(pagesN, Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1));
		const raw = Object.fromEntries(['q', 'status', 'rol', 'taal', 'bron', 'van', 'tot', 'toegewezen'].map((k) => [k, String(url.searchParams.get(k) || '').slice(0, 200)]));
		return out(200, views.messagesPage(ctx, { list: messages.list(filter, { limit: per, offset: (page - 1) * per }), total, page, pages: pagesN, filter: raw, counts: messages.statusCounts(filter), people: users.list(), sources: messages.sources(), roles: messages.roles(), retention: settings.retentionDays(), queueProblems: messages.alarmCount() }));
	}
	if (isPost && p === '/admin/berichten/bulk') {
		if (!needWrite()) return true;
		const ids = Object.keys(form).filter((k) => /^sel_\d+$/.test(k)).map((k) => Number(k.slice(4)));
		const back = String(form.terug || '').startsWith('/admin/berichten') ? form.terug : '/admin/berichten';
		const sep = back.includes('?') ? '&' : '?';
		try {
			if (!ids.length) return go(`${back}${sep}f=geenselectie`);
			const [actie, waarde] = String(form.actie || '').split(':');
			const n = messages.bulk(ids, actie, waarde, user);
			return go(`${back}${sep}f=${actie === 'verwijderen' ? 'verwijderd' : 'opgeslagen'}&n=${n}`);
		} catch (e) { return fail(e.status || 400, e.message, ctx); }
	}
	if (req.method === 'GET' && p === '/admin/berichten.csv') {
		audit.log({ user, actie: 'bericht.export', entiteit: 'bericht', nieuw: filterOf(url) });
		res.writeHead(200, headers(nonce, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="aethra-berichten.csv"' }));
		res.end(messages.csv(filterOf(url)));
		return true;
	}
	if (req.method === 'GET' && p === '/admin/berichten/privacy') {
		const email = String(url.searchParams.get('email') || '').trim();
		return out(200, views.privacyRequestPage(ctx, { email, list: email ? messages.byEmail(email) : [] }));
	}
	if (req.method === 'GET' && p === '/admin/berichten/privacy.json') {
		const email = String(url.searchParams.get('email') || '').trim();
		audit.log({ user, actie: 'bericht.privacy_export', entiteit: 'bericht', nieuw: { email_hash: crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12) } });
		res.writeHead(200, headers(nonce, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="berichten-export.json"' }));
		res.end(JSON.stringify({ email, berichten: messages.byEmail(email) }, null, 2));
		return true;
	}
	if (isPost && p === '/admin/berichten/privacy/wissen') {
		if (!needWrite()) return true;
		const n = messages.removeByEmail(form.email, user);
		return go(`/admin/berichten/privacy?email=${encodeURIComponent(form.email || '')}&f=verwijderd&n=${n}`);
	}
	if (req.method === 'GET' && (m = /^\/admin\/berichten\/(\d+)$/.exec(p))) {
		const msg = messages.get(Number(m[1]));
		if (!msg) return fail(404, 'Bericht niet gevonden.', ctx);
		if (can('schrijven')) messages.markRead(msg.id);
		return out(200, views.messagePage(ctx, { m: { ...msg, status: msg.status === 'nieuw' && can('schrijven') ? 'gelezen' : msg.status }, gebruikers: users.list(), aantalVanAdres: messages.byEmail(msg.email).length, templates: replies.list(), chosen: (() => { const t = replies.get(Number(url.searchParams.get('sjabloon'))); return t ? replies.fill(t, msg) : null; })(), neighbors: messages.neighbors(msg.id) }));
	}
	if (isPost && (m = /^\/admin\/berichten\/(\d+)\/(status|notitie|toewijzen|verwijderen)$/.exec(p))) {
		if (!needWrite()) return true;
		const id = Number(m[1]);
		try {
			if (m[2] === 'status') messages.setStatus(id, form.status, user);
			else if (m[2] === 'notitie') messages.setNote(id, form.notitie, user);
			else if (m[2] === 'toewijzen') messages.assign(id, form.gebruiker ? Number(form.gebruiker) : null, user);
			else { messages.remove(id, user); return go('/admin/berichten?f=verwijderd'); }
		} catch (e) { return fail(e.status || 400, e.message, ctx); }
		return go(`/admin/berichten/${id}?f=opgeslagen`);
	}
	if (req.method === 'GET' && p === '/admin/wachtrij') return out(200, views.queuePage(ctx, { rows: messages.queueList(), stats: messages.queueStats(), outbox: outbox.list(30), outboxStats: outbox.stats(), smtp: mail.canSend() }));
	if (isPost && (m = /^\/admin\/wachtrij\/(\d+)\/opnieuw$/.exec(p))) { if (!needWrite()) return true; messages.retry(Number(m[1]), user); return go('/admin/wachtrij'); }

	/* ---- menu (navigation) ---- */
	if (req.method === 'GET' && p === '/admin/menu') return out(200, views.menuPage(ctx, menu.editorData(pages.list())));
	if (isPost && p === '/admin/menu') {
		if (!needPublish()) return true;
		let raw = null;
		try { raw = JSON.parse(String(form.menu || '')); menu.save(raw, pages.list(), user); } catch (e) {
			const data = menu.editorData(pages.list());
			if (raw && typeof raw === 'object' && Array.isArray(raw.header) && Array.isArray(raw.footer)) data.menu = raw;
			return out(e.status || 400, views.menuPage({ ...ctx, flash: { ok: false, text: e instanceof SyntaxError ? 'Het menu kon niet worden gelezen.' : e.message } }, data));
		}
		return go('/admin/menu?f=opgeslagen');
	}
	if (isPost && p === '/admin/menu/standaard') { if (!needPublish()) return true; menu.reset(user); return go('/admin/menu?f=opgeslagen'); }

	/* ---- redirects ---- */
	if (req.method === 'GET' && p === '/admin/redirects') return out(200, views.redirectsPage(ctx, redirects.list(), { chains: redirects.chains() }));
	if (req.method === 'GET' && p === '/admin/redirects.csv') {
		res.writeHead(200, headers(nonce, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="aethra-redirects.csv"' }));
		res.end(redirects.exportCsv());
		return true;
	}
	if (isPost && p === '/admin/redirects/importeren') {
		if (!needPublish()) return true;
		const r = redirects.importCsv(form.csv, user);
		return out(200, views.redirectsPage({ ...ctx, flash: { ok: r.fouten.length === 0, text: `${r.toegevoegd} toegevoegd${r.overgeslagen ? `, ${r.overgeslagen} overgeslagen` : ''}.${r.fouten.length ? ' ' + r.fouten.slice(0, 3).map((f) => `Regel ${f.regel}: ${f.tekst}`).join(' ') : ''}` } }, redirects.list(), { chains: redirects.chains() }));
	}
	if (isPost && p === '/admin/redirects/inkorten') { if (!needPublish()) return true; const n = redirects.flatten(user); return go(`/admin/redirects?f=${n ? 'ingekort' : 'opgeslagen'}`); }
	if (isPost && p === '/admin/redirects/bulk') {
		if (!needPublish()) return true;
		const vans = Object.keys(form).filter((k) => /^v_[0-9a-f]+$/.test(k)).map((k) => Buffer.from(k.slice(2), 'hex').toString('utf8'));
		if (!vans.length) return go('/admin/redirects?f=geenselectie');
		redirects.removeMany(vans, user);
		return go('/admin/redirects?f=verwijderd');
	}
	if (isPost && p === '/admin/redirects') { if (!needPublish()) return true; if (!redirects.add(form.van, form.naar, user)) return fail(400, 'Gebruik adressen als /nl/oude-pagina en /nl/nieuwe-pagina (twee verschillende adressen).', ctx); return go('/admin/redirects?f=opgeslagen'); }
	if (isPost && p === '/admin/redirects/verwijderen') { if (!needPublish()) return true; redirects.remove(String(form.van), user); return go('/admin/redirects?f=verwijderd'); }

	/* ---- statistics, audit ---- */
	if (req.method === 'GET' && p === '/admin/stats') {
		const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
		const cur = stats.summary(days);
		const prev = stats.summary(days, days);
		return out(200, views.statsPage(ctx, cur, days, { prev, bySource: messages.bySource(days) }));
	}
	const auditFilter = () => Object.fromEntries(['actie', 'gebruiker', 'entiteit', 'van', 'tot'].map((k) => [k, String(url.searchParams.get(k) || '').slice(0, 60)]));
	if (req.method === 'GET' && p === '/admin/stats.csv') {
		const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
		const sum = stats.summary(days);
		const lines = ['onderdeel,naam,waarde', ...sum.days.map((d, i) => `dag,${d},${sum.perDay[i]}`), ...Object.entries(sum.pages).map(([k, v]) => `pagina,"${k.replace(/"/g, '')}",${v}`), ...Object.entries(sum.sources).map(([k, v]) => `bron,"${k.replace(/"/g, '').replace(/^[=+@-]/, "'$&")}",${v}`), ...Object.entries(sum.langs).map(([k, v]) => `taal,${k},${v}`)];
		res.writeHead(200, headers(nonce, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="aethra-statistieken-${days}-dagen.csv"` }));
		res.end(lines.join('\r\n') + '\r\n');
		return true;
	}
	if (req.method === 'GET' && p === '/admin/audit') {
		if (!needAdmin()) return true;
		const filter = auditFilter();
		const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
		return out(200, views.auditPage(ctx, { rows: audit.list({ limit: 100, offset: (page - 1) * 100, ...filter }), total: audit.count(filter), page, filter, people: users.list() }));
	}
	if (req.method === 'GET' && p === '/admin/audit.csv') {
		if (!needAdmin()) return true;
		const filter = auditFilter();
		audit.log({ user, actie: 'audit.export', entiteit: 'audit', nieuw: filter });
		res.writeHead(200, headers(nonce, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="aethra-auditlog.csv"' }));
		res.end(audit.csv(filter));
		return true;
	}

	/* ---- re-authentication for critical actions ---- */
	const reauth = (password) => {
		const key = `reauth:${user.email}`;
		if (users.lockState(ip, key).locked) return 'locked';
		const row = users.byId(user.id);
		if (!users.verifyPassword(password || '', row.wachtwoord_hash)) { users.failedAttempt(ip, key); return false; }
		users.clearAttempts(ip, key);
		return true;
	};
	/** After a critical action the session id changes. */
	const rotated = (to, extra = {}) => { const s = users.rotateSession(session, req, ip); return go(to, { 'Set-Cookie': users.cookieHeader(s.id, 8 * 3600), ...extra }); };

	/* ---- help, privacy overview, search, reply templates ---- */
	if (req.method === 'GET' && p === '/admin/help') return out(200, views.helpPage(ctx, { guide: HELP.GUIDE, shortcuts: HELP.SHORTCUTS }));
	if (req.method === 'GET' && p === '/admin/privacy-overzicht') return out(200, views.privacyOverviewPage(ctx, { retention: settings.retentionDays(), backups: backup.KEEP, secure: cfg.SECURE }));
	if (req.method === 'GET' && p === '/admin/zoeken') return jsonOut(200, { ok: true, items: search.search(String(url.searchParams.get('q') || ''), user) });
	if (req.method === 'GET' && p === '/admin/sjablonen') { const edit = replies.get(Number(url.searchParams.get('bewerk'))); return out(200, views.repliesPage(ctx, { list: replies.list(), edit, canWrite: can('schrijven') })); }
	if (isPost && p === '/admin/sjablonen') {
		if (!needWrite()) return true;
		try { replies.save(Number(form.id) || null, form, user); } catch (e) { return out(e.status || 400, views.repliesPage({ ...ctx, flash: { ok: false, text: e.message } }, { list: replies.list(), edit: Number(form.id) ? replies.get(Number(form.id)) : null, draft: form, canWrite: true })); }
		return go('/admin/sjablonen?f=opgeslagen');
	}
	if (isPost && (m = /^\/admin\/sjablonen\/(\d+)\/verwijderen$/.exec(p))) { if (!needWrite()) return true; replies.remove(Number(m[1]), user); return go('/admin/sjablonen?f=verwijderd'); }
	if (isPost && p === '/admin/media/bulk') {
		if (!needPublish()) return true;
		const ids = Object.keys(form).filter((k) => /^m_\d+$/.test(k)).map((k) => Number(k.slice(2)));
		if (!ids.length) return go('/admin/media?f=geenselectie');
		let n = 0; const blocked = [];
		for (const id of ids) { try { if (media.remove(id, user)) n += 1; } catch (e) { blocked.push(id); } }
		return out(200, views.mediaPage({ ...ctx, flash: { ok: !blocked.length, text: `${n} foto${n === 1 ? '' : '’s'} naar de prullenbak.${blocked.length ? ` ${blocked.length} niet verwijderd omdat ze nog gebruikt worden.` : ''}` } }, mediaData()));
	}

	/* ---- duplicate, trash ---- */
	if (isPost && (m = /^\/admin\/paginas\/(\d+)\/dupliceren$/.exec(p))) {
		if (!needWrite()) return true;
		try { return go(`/admin/paginas/${pages.duplicate(Number(m[1]), user)}`); } catch (e) { return fail(e.status || 400, e.errors ? e.errors[0] : e.message, ctx); }
	}
	if (req.method === 'GET' && p === '/admin/prullenbak') return out(200, views.trashPage(ctx, { pages: pages.trash(), media: media.trash(), canRestore: can('publiceren') }));
	if (isPost && (m = /^\/admin\/prullenbak\/(pagina|media)\/(\d+)\/(terugzetten|verwijderen)$/.exec(p))) {
		if (!needPublish()) return true;
		const id = Number(m[2]);
		try {
			if (m[3] === 'terugzetten') { if (m[1] === 'pagina') pages.restore(id, user); else media.restore(id, user); return go('/admin/prullenbak?f=teruggezet'); }
			if (!can('beheer')) return fail(403, 'Alleen een beheerder verwijdert definitief.', ctx);
			if (m[1] === 'pagina') pages.purge(id, user); else media.purge(id, user);
			return go('/admin/prullenbak?f=verwijderd');
		} catch (e) { return fail(e.status || 400, e.errors ? e.errors[0] : e.message, ctx); }
	}

	/* ---- translations overview ---- */
	if (req.method === 'GET' && p === '/admin/vertalingen') { const rows = translations.overview(); return out(200, views.translationsPage(ctx, { rows, totals: translations.totals(rows) })); }

	/* ---- scheduled publishing ---- */
	if (req.method === 'GET' && p === '/admin/planning') return out(200, views.planningPage(ctx, { items: planning.list({ limit: 100 }), canPlan: can('publiceren') }));
	if (req.method === 'GET' && p === '/admin/api/planning') return jsonOut(200, { ok: true, items: planning.forObject(String(url.searchParams.get('object') || '')).map((r) => ({ id: r.id, actie: r.actie, wanneer: r.wanneer, door: r.naam })) });
	if (isPost && p === '/admin/plannen') {
		if (!can('publiceren')) return jsonOut(403, { ok: false, melding: 'Alleen een editor of beheerder kan een publicatie plannen.' });
		if (!body) return jsonOut(400, { ok: false, melding: 'Ongeldige gegevens.' });
		try {
			const id = planning.schedule({ kind: body.kind, id: body.id, actie: body.actie, wanneer: Number(body.wanneer), payload: body, reden: body.override_reason, user });
			return jsonOut(200, { ok: true, id });
		} catch (e) { return jsonOut([400, 404, 409, 422].includes(e.status) ? e.status : 500, { ok: false, melding: e.message, fouten: e.fouten || null, waarschuwingen: e.waarschuwingen || null }); }
	}
	if (isPost && (m = /^\/admin\/planning\/(\d+)\/annuleren$/.exec(p))) {
		if (!needPublish()) return true;
		try { planning.cancel(Number(m[1]), user); } catch (e) { return fail(e.status || 400, e.message, ctx); }
		return go('/admin/planning?f=opgeslagen');
	}

	/* ---- preview links ---- */
	if (req.method === 'GET' && p === '/admin/voorbeeldlinks') return out(200, views.shareLinksPage(ctx, { links: sharelinks.active(), canRevoke: can('schrijven') }));
	if (isPost && p === '/admin/voorbeeldlink') {
		if (!can('schrijven')) return jsonOut(403, { ok: false });
		if (!body) return jsonOut(400, { ok: false });
		const object = objectOf({ kind: body.kind, id: body.id });
		const exists = body.kind === 'tekst' ? GROUPS.some((g) => g.id === String(body.id)) : body.kind === 'pagina' ? !!pages.get(Number(body.id)) : body.kind === 'privacy';
		if (!object || !exists || !LANGS.includes(body.lang)) return jsonOut(400, { ok: false, melding: 'Onbekend onderdeel.' });
		try {
			const l = sharelinks.create({ object, soort: body.kind, taal: body.lang, pad: body.path, payload: { velden: body.velden, meta: body.meta }, days: body.days }, user);
			const base = cfg.SITE_URL || `${cfg.SECURE ? 'https' : 'http'}://${req.headers.host || 'localhost'}`;
			return jsonOut(200, { ok: true, url: `${base}/voorbeeld/${l.token}`, verloopt: l.verloopt });
		} catch (e) { return jsonOut(e.status || 500, { ok: false, melding: e.message }); }
	}
	if (isPost && (m = /^\/admin\/voorbeeldlinks\/([0-9a-f]{64})\/intrekken$/.exec(p))) {
		if (!needWrite()) return true;
		sharelinks.revoke(m[1], user);
		return go('/admin/voorbeeldlinks?f=opgeslagen');
	}

	/* ---- search engines, links, editorial rules ---- */
	if (req.method === 'GET' && p === '/admin/seo') {
		const rows = seo.audit();
		const siteUrl = cfg.SITE_URL || `${cfg.SECURE ? 'https' : 'http'}://${req.headers.host || 'localhost'}`;
		const sitemap = require('../views').renderSitemap(siteUrl, content.lastModified(), seo.todayOn() ? ['/eco-mode-today'] : [], require('../store').publishedPages(), require('../store').pageVersions);
		return out(200, views.seoPage(ctx, { rows, score: seo.score(rows), robots: robotsTxt(siteUrl), sitemapUrls: (sitemap.match(/<loc>/g) || []).length, siteUrl, env: { siteUrl: !!cfg.SITE_URL, training: process.env.AI_TRAINING === 'allow', indexNow: !!process.env.INDEXNOW_KEY } }));
	}
	if (isPost && p === '/admin/seo/vernieuwen') { if (!needWrite()) return true; cache.invalidate(); return go('/admin/seo?f=vernieuwd'); }
	if (req.method === 'GET' && p === '/admin/links') return out(200, views.linksPage(ctx, { results: linkcheck.results(), last: linkcheck.lastRun(), running: linkcheck.isRunning(), canRun: can('schrijven') }));
	if (isPost && p === '/admin/links/controleren') {
		if (!needWrite()) return true;
		if (!linkcheck.isRunning()) { audit.log({ user, actie: 'links.controle_gestart', entiteit: 'links' }); linkcheck.run().catch((e) => console.error(`Link check failed: ${e.message}`)); }
		return go('/admin/links?f=gestart');
	}
	if (req.method === 'GET' && p === '/admin/regels') { if (!needAdmin()) return true; return out(200, views.rulesPage(ctx, { builtin: compliance.BUILTIN, extra: db.all('SELECT * FROM compliance_regels ORDER BY soort, term') })); }
	if (isPost && p === '/admin/regels') {
		if (!needAdmin()) return true;
		const term = String(form.term || '').replace(/\s+/g, ' ').trim();
		const soort = form.soort === 'verboden' ? 'verboden' : 'waarschuwing';
		const again = (text, status = 422) => out(status, views.rulesPage({ ...ctx, flash: { ok: false, text } }, { builtin: compliance.BUILTIN, extra: db.all('SELECT * FROM compliance_regels ORDER BY soort, term') }));
		if (term.length < 2 || term.length > 60) return again('Een term is 2 tot 60 tekens lang.');
		if (/[<>]/.test(term)) return again('Gebruik gewone woorden, geen tekens als < of >.');
		if (db.get('SELECT 1 FROM compliance_regels WHERE term = ?', term)) return again('Deze term staat er al.', 409);
		db.run('INSERT INTO compliance_regels (soort, term, toelichting, aangemaakt_door) VALUES (?, ?, ?, ?)', soort, term, String(form.toelichting || '').slice(0, 200), user.id);
		compliance.reloadExtra();
		audit.log({ user, actie: 'regels.toegevoegd', entiteit: 'compliance', nieuw: { soort, term } });
		return go('/admin/regels?f=opgeslagen');
	}
	if (isPost && (m = /^\/admin\/regels\/(\d+)\/verwijderen$/.exec(p))) {
		if (!needAdmin()) return true;
		const old = db.get('SELECT * FROM compliance_regels WHERE id = ?', Number(m[1]));
		if (old) { db.run('DELETE FROM compliance_regels WHERE id = ?', old.id); compliance.reloadExtra(); audit.log({ user, actie: 'regels.verwijderd', entiteit: 'compliance', oud: { soort: old.soort, term: old.term } }); }
		return go('/admin/regels?f=verwijderd');
	}

	/* ---- review flow ---- */
	if (req.method === 'GET' && p === '/admin/reviews') return out(200, views.reviewsPage(ctx, { pending: reviews.list({ status: 'wacht' }), recent: reviews.list({ limit: 30 }).filter((r) => r.status !== 'wacht'), mine: reviews.list({ mine: user.id, limit: 20 }), canJudge: can('publiceren') }));
	if (req.method === 'GET' && (m = /^\/admin\/reviews\/(\d+)$/.exec(p))) {
		const r = reviews.get(Number(m[1]));
		if (!r || (!can('publiceren') && r.ingediend_door !== user.id)) return fail(404, 'Voorstel niet gevonden.', ctx);
		return out(200, views.reviewPage(ctx, { r, changes: reviews.changes(r), canJudge: can('publiceren') }));
	}
	if (isPost && (m = /^\/admin\/reviews\/(\d+)\/(goedkeuren|afwijzen|intrekken)$/.exec(p))) {
		const id = Number(m[1]);
		const back = (flash2, status = 200) => { const r = reviews.get(id); return out(status, views.reviewPage({ ...ctx, flash: flash2 }, { r, changes: reviews.changes(r), canJudge: can('publiceren') })); };
		try {
			if (m[2] === 'intrekken') { reviews.withdraw(id, user); return go('/admin/reviews?f=opgeslagen'); }
			if (!needPublish()) return true;
			if (m[2] === 'afwijzen') { reviews.reject(id, user, form.opmerking); return go('/admin/reviews?f=opgeslagen'); }
			reviews.approve(id, user, { overrideReden: String(form.override_reden || '').trim() || null, force: form.force === '1' });
			return go('/admin/reviews?f=goedgekeurd');
		} catch (e) {
			if (e.waarschuwingen) return back({ ok: false, text: `${e.message} ${e.waarschuwingen.map((w) => `${(w.taal || '').toUpperCase()} ${w.melding}`).join(' · ')}` }, 409);
			if (e.fouten) return back({ ok: false, text: `Niet te publiceren: ${e.fouten.map((w) => w.melding).join(' · ')}` }, 422);
			return back({ ok: false, text: e.message }, e.status || 400);
		}
	}

	/* ---- settings, system, back-ups (administrators) ---- */
	if (req.method === 'GET' && p === '/admin/instellingen') { if (!needAdmin()) return true; return out(200, views.settingsPage(ctx, { values: settings.all(), mail: { smtp: mail.canSend(), team: mail.configured() } })); }
	if (isPost && p === '/admin/instellingen') {
		if (!needAdmin()) return true;
		const input = { ...form };
		for (const k of ['banner_aan', 'onderhoud_aan']) input[k] = form[k] === '1';
		try { settings.save(input, user); } catch (e) { return out(e.status || 400, views.settingsPage({ ...ctx, flash: { ok: false, text: e.message } }, { values: { ...settings.all(), ...input }, mail: { smtp: mail.canSend(), team: mail.configured() } })); }
		return go('/admin/instellingen?f=opgeslagen');
	}
	if (req.method === 'GET' && p === '/admin/systeem') { if (!needAdmin()) return true; return out(200, views.systemPage(ctx, systemInfo())); }
	if (isPost && p === '/admin/systeem/backup') { if (!needAdmin()) return true; try { backup.run(user); } catch (e) { return fail(500, `De back-up is mislukt: ${e.message}`, ctx); } return go('/admin/systeem?f=backup'); }
	if (isPost && (m = /^\/admin\/systeem\/backup\/([\w.-]+)$/.exec(p))) {
		if (!needAdmin()) return true;
		const ok = reauth(form.huidig);
		if (ok !== true) return go('/admin/systeem?f=foutwachtwoord');
		const file = backup.fileFor(m[1]);
		if (!file) return fail(404, 'Back-up niet gevonden.', ctx);
		audit.log({ user, actie: 'backup.gedownload', entiteit: 'systeem', nieuw: { bestand: m[1] } });
		res.writeHead(200, headers(nonce, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'Content-Disposition': `attachment; filename="${m[1]}"`, 'Cache-Control': 'no-store' }));
		fs.createReadStream(file).pipe(res);
		return true;
	}
	if (isPost && (m = /^\/admin\/mail\/(\d+)\/opnieuw$/.exec(p))) { if (!needWrite()) return true; outbox.retry(Number(m[1])); return go('/admin/wachtrij'); }

	/* ---- users (administrators) ---- */
	if (p.startsWith('/admin/gebruikers')) {
		if (!needAdmin()) return true;
		if (req.method === 'GET' && p === '/admin/gebruikers') return out(200, views.usersPage(ctx, { list: users.list(), sessions: users.sessionCounts() }));
		if (isPost && p === '/admin/gebruikers') {
			const ok = reauth(form.huidig);
			if (ok !== true) return go('/admin/gebruikers?f=foutwachtwoord');
			const invite = !String(form.wachtwoord || '').trim();
			let newId = null;
			try { newId = users.create({ email: form.email, naam: form.naam, rol: form.rol, wachtwoord: invite ? users.unusablePassword() : form.wachtwoord }, user); } catch (e) { return out(e.status || 400, views.usersPage({ ...ctx, flash: { ok: false, text: e.message } }, { list: users.list(), sessions: users.sessionCounts() })); }
			if (invite) {
				const d = deliverToken(req, users.byId(newId), 'uitnodiging', users.createToken(newId, 'uitnodiging'));
				audit.log({ user, actie: 'gebruiker.uitgenodigd', entiteit: `gebruiker:${newId}`, nieuw: { gemaild: d.mailed } });
				const s2 = users.rotateSession(session, req, ip);
				return out(200, views.usersPage({ ...ctx, session: { ...session, id: s2.id, csrf: s2.csrf }, flash: { ok: true, text: d.mailed ? 'Uitnodiging verstuurd per e-mail.' : 'Uitnodiging klaar. Er is geen mailserver ingesteld: geef de link hieronder zelf door.' } }, { list: users.list(), sessions: users.sessionCounts(), link: d.link }), { 'Set-Cookie': users.cookieHeader(s2.id, 8 * 3600) });
			}
			return rotated('/admin/gebruikers?f=gemaakt');
		}
		if (isPost && (m = /^\/admin\/gebruikers\/(\d+)$/.exec(p))) {
			try { users.update(Number(m[1]), { naam: form.naam, rol: form.rol, actief: form.actief === '1' }, user); } catch (e) { return out(e.status || 400, views.usersPage({ ...ctx, flash: { ok: false, text: e.message } }, { list: users.list(), sessions: users.sessionCounts() })); }
			return go('/admin/gebruikers?f=opgeslagen');
		}
		if (isPost && (m = /^\/admin\/gebruikers\/(\d+)\/wachtwoord$/.exec(p))) {
			if (reauth(form.huidig) !== true) return go('/admin/gebruikers?f=foutwachtwoord');
			try { users.setPassword(Number(m[1]), form.nieuw, user); users.destroyOthers(Number(m[1]), ''); } catch (e) { return out(e.status || 400, views.usersPage({ ...ctx, flash: { ok: false, text: e.message } }, { list: users.list(), sessions: users.sessionCounts() })); }
			return rotated('/admin/gebruikers?f=opgeslagen');
		}
		if (isPost && (m = /^\/admin\/gebruikers\/(\d+)\/herstellink$/.exec(p))) {
			if (reauth(form.huidig) !== true) return go('/admin/gebruikers?f=foutwachtwoord');
			const target = users.byId(Number(m[1]));
			if (!target || !target.actief) return fail(404, 'Gebruiker niet gevonden.', ctx);
			const d = deliverToken(req, target, 'herstel', users.createToken(target.id, 'herstel'));
			audit.log({ user, actie: 'gebruiker.herstellink', entiteit: `gebruiker:${target.id}`, nieuw: { gemaild: d.mailed } });
			const s2 = users.rotateSession(session, req, ip);
			return out(200, views.usersPage({ ...ctx, session: { ...session, id: s2.id, csrf: s2.csrf }, flash: { ok: true, text: d.mailed ? `Herstellink gemaild aan ${target.email}.` : 'Herstellink klaar. Er is geen mailserver ingesteld: geef de link hieronder zelf door (een uur geldig).' } }, { list: users.list(), sessions: users.sessionCounts(), link: d.link }), { 'Set-Cookie': users.cookieHeader(s2.id, 8 * 3600) });
		}
		if (isPost && (m = /^\/admin\/gebruikers\/(\d+)\/uitloggen$/.exec(p))) {
			users.destroyOthers(Number(m[1]), Number(m[1]) === user.id ? session.id : '');
			audit.log({ user, actie: 'gebruiker.uitgelogd', entiteit: `gebruiker:${m[1]}` });
			return go('/admin/gebruikers?f=sessies');
		}
		if (isPost && (m = /^\/admin\/gebruikers\/(\d+)\/2fa-uit$/.exec(p))) {
			if (reauth(form.huidig) !== true) return go('/admin/gebruikers?f=foutwachtwoord');
			users.disableTwoFactor(Number(m[1]), user);
			return rotated('/admin/gebruikers?f=opgeslagen');
		}
		return false;
	}

	/* ---- own account ---- */
	const account = (flash2, tf = {}) => out(200, views.accountPage({ ...ctx }, { flash: flash2 || flash, sessions: users.sessionList(user.id, session.id), activity: audit.byUser(user.id, 8), tf: { enabled: !!users.byId(user.id).totp_geheim, left: users.recoveryLeft(user.id), setup: users.pendingTwoFactor(user.id), ...tf } }));
	if (req.method === 'GET' && p === '/admin/account') return account();
	if (isPost && p === '/admin/account/naam') { try { users.setName(user.id, form.naam); } catch (e) { return account({ ok: false, text: e.message }); } return go('/admin/account?f=naam'); }
	if (isPost && p === '/admin/account/meldingen') { users.setPrefs(user.id, { meld_nieuw_bericht: form.meld_nieuw_bericht === '1' && user.rol !== 'lezer', weekrapport: form.weekrapport === '1' && user.rol !== 'lezer' }); return go('/admin/account?f=opgeslagen'); }
	if (isPost && p === '/admin/account/sessies-uit') { users.destroyOthers(user.id, session.id); audit.log({ user, actie: 'gebruiker.uitgelogd', entiteit: `gebruiker:${user.id}` }); return go('/admin/account?f=sessies'); }
	if (isPost && p === '/admin/account') {
		const ok = reauth(form.current);
		if (ok !== true) return go('/admin/account?f=foutwachtwoord');
		if (String(form.password || '').length < 12) return go('/admin/account?f=kort');
		users.setPassword(user.id, form.password, user);
		const s = users.rotateSession(session, req, ip);
		users.destroyOthers(user.id, s.id);
		return go('/admin/account?f=wachtwoord', { 'Set-Cookie': users.cookieHeader(s.id, 8 * 3600) });
	}
	if (isPost && p === '/admin/2fa/start') {
		if (users.byId(user.id).totp_geheim) return go('/admin/account');
		if (reauth(form.current) !== true) return go('/admin/account?f=foutwachtwoord');
		users.beginTwoFactor(user.id);
		return rotated('/admin/account');
	}
	if (isPost && p === '/admin/2fa/restart') { if (!users.byId(user.id).totp_geheim && users.pendingTwoFactor(user.id)) users.beginTwoFactor(user.id); return go('/admin/account'); }
	if (isPost && p === '/admin/2fa/confirm') {
		if (users.lockState(ip, `2fa:${user.email}`).locked) return go('/admin/account?f=geblokkeerd');
		const codes = users.confirmTwoFactor(user.id, form.code);
		if (!codes) { users.failedAttempt(ip, `2fa:${user.email}`); return account({ ok: false, text: 'Die code klopt niet. Controleer de sleutel en de tijd op je telefoon.' }); }
		users.clearAttempts(ip, `2fa:${user.email}`);
		const s = users.rotateSession(session, req, ip);
		users.destroyOthers(user.id, s.id);
		res.setHeader('Set-Cookie', users.cookieHeader(s.id, 8 * 3600));
		return account({ ok: true, text: 'Tweestapsverificatie staat aan.' }, { codes });
	}
	if (isPost && p === '/admin/2fa/recovery') {
		if (reauth(form.current) !== true || !users.verifySecondFactor(user.id, form.code)) return account({ ok: false, text: 'Wachtwoord of code klopt niet.' });
		return account({ ok: true, text: 'Nieuwe herstelcodes gemaakt. De oude werken niet meer.' }, { codes: users.regenerateRecovery(user.id) });
	}
	if (isPost && p === '/admin/2fa/disable') {
		if (reauth(form.current) !== true || !users.verifySecondFactor(user.id, form.code)) return account({ ok: false, text: 'Wachtwoord of code klopt niet.' });
		users.disableTwoFactor(user.id, user);
		const s = users.rotateSession(session, req, ip);
		users.destroyOthers(user.id, s.id);
		return go('/admin/account', { 'Set-Cookie': users.cookieHeader(s.id, 8 * 3600) });
	}

	return false;
}

/** Defence in depth next to SameSite=Strict and the CSRF token: a cross-site Origin on an admin POST is refused. */
function sameOrigin(req) {
	const origin = req.headers.origin;
	if (!origin || origin === 'null') return !origin;
	try {
		const host = new URL(origin).host;
		return host === String(req.headers.host || '') || (!!cfg.SITE_URL && host === new URL(cfg.SITE_URL).host);
	} catch (e) {
		return false;
	}
}

module.exports = { handleAdmin, headers };
