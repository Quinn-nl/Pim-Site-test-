'use strict';
/** HTML of the admin (server-rendered, Dutch). Interactivity is in public/js/admin.js. Every value is escaped. */
const { GROUPS, IMAGE_SLOTS, ROLES: CONTACT_ROLES } = require('../fields');
const { labelOf, SLOTS } = require('./labels');
const { LANGS, LANG_NAMES } = require('../i18n');
const { esc, asset } = require('../views');
const { qrSvg } = require('../qr');
const { SECTIONS, TEMPLATES } = require('./templates');
const content = require('./content');
const pagesApi = require('./pages');
const media = require('./media');
const messagesApi = require('./messages');

const nf = (n) => new Intl.NumberFormat('nl-NL').format(n);
const when = (iso) => { try { return new Date(iso).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return String(iso || ''); } };
const json = (o) => esc(JSON.stringify(o));

/** Where every text group lives on the site: dashboard section, Dutch label, preview address. */
const PLACE = {
	hero: { sectie: 'Home', label: 'Home: banner (hero)', path: '/', uitleg: 'Het eerste wat bezoekers op de homepage zien.' },
	home: { sectie: 'Home', label: 'Home: teasers en afsluitende oproep', path: '/', uitleg: 'Korte regels op de homepage en het afsluitende blok.' },
	status: { sectie: 'Home', label: 'Home: status van het project', path: '/', uitleg: 'Eerlijke status van het prototype. Geen beloftes over resultaten.' },
	about: { sectie: 'Home', label: 'Wie zit erachter (optioneel)', path: '/', uitleg: 'Verschijnt pas als het is ingevuld. Gebruik alleen echte namen.' },
	problem: { sectie: 'Het probleem', label: 'Het probleem: tekst, feiten en bronnen', path: '/problem', uitleg: 'Elk cijfer heeft een bron nodig. Zonder bron kun je niet publiceren.' },
	steps: { sectie: 'Hoe het werkt', label: 'Hoe het werkt: drie stappen', path: '/how-it-works', uitleg: 'Ook als samenvatting op de homepage zichtbaar.' },
	apps: { sectie: 'Toepassingen', label: 'Toepassingen: overzicht', path: '/applications', uitleg: 'Ook als samenvatting op de homepage zichtbaar.' },
	contact: { sectie: 'Contact', label: 'Contactpagina', path: '/contact', uitleg: 'Teksten rond het formulier. Berichten komen onder Berichten binnen.' },
	aud_municipalities: { sectie: 'Doelgroeppagina’s', label: 'Voor gemeenten', path: '/for/municipalities', uitleg: 'Landingspagina voor gemeenten.' },
	aud_fleets: { sectie: 'Doelgroeppagina’s', label: 'Voor wagenparkbeheerders', path: '/for/fleets', uitleg: 'Landingspagina voor wagenparkbeheerders.' },
	aud_manufacturers: { sectie: 'Doelgroeppagina’s', label: 'Voor voertuigfabrikanten', path: '/for/manufacturers', uitleg: 'Landingspagina voor voertuigfabrikanten.' },
	aud_platforms: { sectie: 'Doelgroeppagina’s', label: 'Voor mobiliteitsplatforms', path: '/for/platforms', uitleg: 'Landingspagina voor mobiliteitsplatforms.' },
	aud_investors: { sectie: 'Doelgroeppagina’s', label: 'Voor investeerders', path: '/for/investors', uitleg: 'Geen aanbod van aandelen of rendement. De verklaring “geen aanbod” moet blijven staan.' },
	today: { sectie: 'Extra pagina’s', label: 'Pagina: eco-modus vandaag', path: '/eco-mode-today', uitleg: 'Blijft verborgen tot het schakelveld op “yes” staat. Controleer eerst de bronnen.' },
	seo: { sectie: 'Instellingen', label: 'Zoekmachinetitels per pagina', path: '/', uitleg: 'Ongeveer 50 tekens per titel. De sitenaam wordt automatisch toegevoegd.' },
	site: { sectie: 'Instellingen', label: 'Sitenaam, zoekbeschrijving en footer', path: '/', uitleg: 'Wordt op elke pagina gebruikt.' },
};
const ORDER = ['hero', 'home', 'status', 'about', 'problem', 'steps', 'apps', 'contact', 'aud_municipalities', 'aud_fleets', 'aud_manufacturers', 'aud_platforms', 'aud_investors', 'today', 'seo', 'site'];
const PREVIEW_PAGES = [['/', 'Home'], ['/problem', 'Het probleem'], ['/how-it-works', 'Hoe het werkt'], ['/applications', 'Toepassingen'], ['/contact', 'Contact'], ['/for/municipalities', 'Gemeenten'], ['/for/fleets', 'Wagenparken'], ['/for/manufacturers', 'Fabrikanten'], ['/for/platforms', 'Platforms'], ['/for/investors', 'Investeerders'], ['/privacy', 'Privacy'], ['/eco-mode-today', 'Eco-modus vandaag']];
const STATUS_LABEL = { leeg: 'leeg', eerste_versie: 'eerste versie', nagekeken: 'nagekeken', standaard: 'standaardtekst' };

const ICON_PATHS = {
	orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-28 12 12)"/>',
	dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
	pages: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
	media: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 9"/>',
	mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
	send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
	redirect: '<path d="M15 14l5-5-5-5"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
	stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
	users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2A6.5 6.5 0 0 1 21.5 20"/>',
	shield: '<path d="M12 3l8 3v6c0 4.5-3.3 8-8 9-4.7-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5L16 9.5"/>',
	user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
	logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
	menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	check: '<path d="M4 12.5l5 5L20 6.5"/>',
	alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18.2v.1"/>',
	info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/>',
	lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
	history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
	chev: '<path d="M6 9l6 6 6-6"/>',
	monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
	tablet: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>',
	phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
	search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
	clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
	globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
	trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
	share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/>',
	cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
	server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
	eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const sprite = `<svg class="sprite" aria-hidden="true" focusable="false">${Object.entries(ICON_PATHS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')}</svg>`;
const icon = (name, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

function shell(ctx, { title, active = '', body, wide = false, script = true }) {
	const { session, nonce, badges = {} } = ctx;
	const head = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><meta name="color-scheme" content="light dark"><link rel="icon" href="/img/favicon.svg" type="image/svg+xml"><title>${esc(title)} | Aethra beheer</title>
<link rel="stylesheet" href="${asset('/css/admin.css')}"></head>`;
	const flash = ctx.flash ? `<p class="flash ${ctx.flash.ok ? 'ok' : 'err'}" role="${ctx.flash.ok ? 'status' : 'alert'}">${icon(ctx.flash.ok ? 'check' : 'alert')}<span>${esc(ctx.flash.text)}</span></p>` : '';
	if (!session) {
		return `${head}
<body>${sprite}<div class="auth"><div><div class="brand"><span class="logo">${icon('orbit')}</span><span>AETHRA<small>Beheer van de website</small></span></div>${flash}${body}</div></div></body></html>`;
	}
	const item = (key, href, label, ic, badge) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${key === 'berichten' || key === 'reviews' ? `<span class="badge" data-badge="${key}"${badge ? '' : ' hidden'}>${badge || ''}</span>` : ''}</a>`;
	const groups = [
		['Inhoud', [['dash', '/admin', 'Dashboard', 'dash'], ['paginas', '/admin/paginas', 'Pagina’s en teksten', 'pages'], ['media', '/admin/media', 'Media', 'media'], ['reviews', '/admin/reviews', session.user.rol === 'redacteur' ? 'Mijn voorstellen' : 'Te beoordelen', 'check', badges.reviews], ['planning', '/admin/planning', 'Planning', 'clock'], ['vertalingen', '/admin/vertalingen', 'Vertalingen', 'globe'], ['prullenbak', '/admin/prullenbak', 'Prullenbak', 'trash']]],
		['Inbox', [['berichten', '/admin/berichten', 'Berichten', 'mail', badges.berichten], ['wachtrij', '/admin/wachtrij', 'Mailwachtrij', 'send']]],
		['Site', [['menu', '/admin/menu', 'Menu', 'menu'], ['redirects', '/admin/redirects', 'Redirects', 'redirect'], ['stats', '/admin/stats', 'Statistieken', 'stats']]],
		...(session.user.rol === 'beheerder' ? [['Beheer', [['gebruikers', '/admin/gebruikers', 'Gebruikers', 'users'], ['instellingen', '/admin/instellingen', 'Instellingen', 'cog'], ['systeem', '/admin/systeem', 'Systeem', 'server'], ['audit', '/admin/audit', 'Auditlog', 'shield']]]] : []),
	];
	const nav = groups.map(([name, items]) => `<div class="nav-group"><h2>${name}</h2>${items.map((i) => item(...i)).join('')}</div>`).join('');
	return `${head}
<body data-csrf="${esc(session.csrf)}" data-user="${esc(session.user.naam)}" data-rol="${esc(session.user.rol)}">${sprite}
<a class="skip" href="#main">Naar de inhoud</a>
<div class="app">
<aside class="side" id="side" data-open="false" aria-label="Beheer">
<a class="brand" href="/admin"><span class="logo">${icon('orbit')}</span><span>AETHRA<small>Beheer van de website</small></span></a>
<nav class="nav" aria-label="Hoofdmenu">${nav}</nav>
<div class="who nav"><strong>${esc(session.user.naam)}</strong><span>${esc(session.user.rol)}</span>
<a href="/admin/account"${active === 'account' ? ' aria-current="page"' : ''}>${icon('user')}<span>Mijn account</span></a>
<form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><button type="submit">${icon('logout')}<span>Uitloggen</span></button></form></div>
</aside>
<div class="mainwrap">
<header class="topbar"><button type="button" id="navtoggle" aria-controls="side" aria-expanded="false" aria-label="Menu openen">${icon('menu')}</button><strong>AETHRA</strong></header>
${ctx.maintenance ? `<p class="flash err" role="status">${icon('alert')}<span>De onderhoudsmodus staat aan: bezoekers zien een onderhoudspagina. <a href="/admin/instellingen">Uitzetten</a></span></p>` : ''}
<p id="alarm" class="flash err" role="alert" hidden></p>
<main id="main"${wide ? ' class="wide"' : ''}>${flash}${body}</main>
</div></div>
<span id="live" class="sr" role="status" aria-atomic="true"></span><div id="toasts" role="status" aria-live="polite"></div>
${script ? `<script src="${asset('/js/admin.js')}" nonce="${esc(nonce)}" defer></script>` : ''}
</body></html>`;
}

/* ---- sign in ---- */
function loginPage(ctx, { flash, setup } = {}) {
	return shell({ ...ctx, session: null, flash }, { title: 'Inloggen', body: `<section class="card narrow"><h1>Inloggen</h1>
${setup ? '<p class="err-text">Er is nog geen account. Maak het eerste account op de server met <code>npm run user:create -- --email=jij@voorbeeld.nl --naam="Jouw naam"</code>.</p>' : ''}
<form method="post" action="/admin/login"><div class="row"><label for="em">E-mailadres</label><input id="em" name="email" type="email" autocomplete="username" required autofocus></div><div class="row"><label for="pw">Wachtwoord</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div><button type="submit">Inloggen</button></form><p class="hint"><a href="/admin/vergeten">Wachtwoord vergeten?</a></p></section>`, script: false });
}
function forgotPage(ctx, { flash, done } = {}) {
	return shell({ ...ctx, session: null, flash }, { title: 'Wachtwoord vergeten', body: `<section class="card narrow"><h1>Wachtwoord vergeten</h1>${done ? '<p>Als dit e-mailadres bij een account hoort, is er een mail met een link gestuurd. De link is een uur geldig. Geen mail binnen een paar minuten? Vraag een beheerder om een herstellink.</p><p><a href="/admin">Terug naar inloggen</a></p>' : `<p class="hint">Vul je e-mailadres in. Je krijgt een link om een nieuw wachtwoord te kiezen.</p><form method="post" action="/admin/vergeten"><div class="row"><label for="fe">E-mailadres</label><input id="fe" name="email" type="email" autocomplete="username" required autofocus></div><button type="submit">Stuur een link</button></form><p class="hint"><a href="/admin">Terug naar inloggen</a></p>`}</section>`, script: false });
}
function resetPage(ctx, { token, user, invalid, flash } = {}) {
	if (invalid) return shell({ ...ctx, session: null, flash }, { title: 'Link verlopen', body: '<section class="card narrow"><h1>Deze link werkt niet meer</h1><p>De link is al gebruikt of verlopen. Vraag een nieuwe aan via “Wachtwoord vergeten” of bij een beheerder.</p><p><a href="/admin/vergeten">Nieuwe link aanvragen</a></p></section>', script: false });
	const invite = user.token_soort === 'uitnodiging';
	return shell({ ...ctx, session: null, flash }, { title: invite ? 'Welkom' : 'Nieuw wachtwoord', body: `<section class="card narrow"><h1>${invite ? `Welkom, ${esc(user.naam)}` : 'Nieuw wachtwoord'}</h1><p class="hint">${invite ? 'Kies een wachtwoord om te beginnen.' : `Kies een nieuw wachtwoord voor ${esc(user.email)}.`} Minstens 12 tekens; een zin van een paar woorden werkt het best.</p>
<form method="post" action="/admin/herstel"><input type="hidden" name="token" value="${esc(token)}"><div class="row"><label for="rp">Nieuw wachtwoord</label><input id="rp" name="password" type="password" autocomplete="new-password" minlength="12" required autofocus></div><div class="row"><label for="rp2">Nog een keer</label><input id="rp2" name="password2" type="password" autocomplete="new-password" minlength="12" required></div>
${user.totp_geheim && !invite ? '<div class="row"><label for="rc">Code uit je authenticator-app (of een herstelcode)</label><input id="rc" name="code" autocomplete="one-time-code" required></div>' : ''}<button type="submit">Wachtwoord instellen</button></form></section>`, script: false });
}
function codePage(ctx, ticket, flash) {
	return shell({ ...ctx, session: null, flash }, { title: 'Verificatie', body: `<section class="card narrow"><h1>Tweestapsverificatie</h1>
<p class="hint">Vul de 6-cijferige code uit je authenticator-app in, of een van je herstelcodes.</p>
<form method="post" action="/admin/login/code"><input type="hidden" name="ticket" value="${esc(ticket)}"><div class="row"><label for="code">Code</label><input id="code" name="code" type="text" autocomplete="one-time-code" autocapitalize="none" required autofocus></div><button type="submit">Bevestigen</button></form></section>`, script: false });
}

/* ---- dashboard ---- */
function dashboardPage(ctx, d) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const card = (title, inner) => `<section class="card"><h2>${title}</h2>${inner}</section>`;
	const warn = d.gezondheid.length ? `<ul class="plain">${d.gezondheid.map((w) => `<li class="sev ${w.ernst === 'info' ? 'info' : ''}">${icon(w.ernst === 'info' ? 'info' : 'alert')}<span>${esc(w.bericht)}</span></li>`).join('')}</ul>` : `<p class="hint">${icon('check')} Geen aandachtspunten.</p>`;
	const locks = Object.keys(d.locks).length ? `<ul class="plain">${Object.entries(d.locks).map(([o, n]) => `<li class="sev">${icon('lock')}<span><strong>${esc(n)}</strong> bewerkt <code>${esc(o)}</code></span></li>`).join('')}</ul>` : '<p class="hint">Niemand is aan het bewerken.</p>';
	const recent = d.recent.length ? `<div class="scroll"><table><thead><tr><th>Wanneer</th><th>Wie</th><th>Wat</th><th>Onderdeel</th></tr></thead><tbody>${d.recent.map((a) => `<tr><td>${esc(when(a.timestamp))}</td><td>${esc(a.gebruiker || 'systeem')}</td><td>${esc(a.actie)}</td><td><code>${esc(a.entiteit)}</code></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nog geen wijzigingen.</p>';
	const kpi = (href, ic, value, label, key, alert) => `<a class="kpi kpi-link${alert ? ' alert' : ''}" href="${href}">${icon(ic)}<span class="kpi-v"${key ? ` data-kpi="${key}"` : ''}>${nf(value)}</span><span>${label}</span></a>`;
	return shell(ctx, { title: 'Dashboard', active: 'dash', body: `<h1>Welkom, ${esc(ctx.session.user.naam.split(' ')[0])}</h1><p class="hint">Dit is de stand van zaken van de website.</p>
${canWrite ? `<div class="quick"><a class="btn-link" href="/admin/paginas/nieuw">${icon('plus')} Nieuwe pagina</a><a class="btn-link secondary" href="/admin/media">${icon('media')} Foto uploaden</a><a class="btn-link secondary" href="/admin/berichten?status=nieuw">${icon('mail')} Nieuwe berichten</a></div>` : ''}
<div class="kpis">
${kpi('/admin/berichten?status=nieuw', 'mail', d.nieuw, 'nieuwe berichten', 'berichten', false)}
${kpi('/admin/wachtrij', 'send', d.mailMislukt, 'mails die vastlopen', 'mail', d.mailMislukt > 0)}
${kpi('/admin/paginas', 'pages', d.concepten, 'pagina’s in concept', '', false)}
<div class="kpi">${icon('eye')}<span class="kpi-v">${nf(d.publiek)}</span><span>extra pagina’s live</span></div>
</div>
<div class="cols">${card('Aandachtspunten', warn)}${card('Wie is aan het bewerken', locks)}</div>
${card('Laatste wijzigingen', recent)}
<p class="meta">Database: ${d.dbOk ? 'in orde' : '<strong>niet bereikbaar: de site toont opgeslagen pagina’s, wijzigen kan tijdelijk niet</strong>'} · cache: ${nf(d.cache.size)} pagina’s · versie ${esc(d.versie)}</p>` });
}

/* ---- pages overview ---- */
const ago = (iso) => { const d = Math.round((Date.now() - Date.parse(iso)) / 86400000); return d <= 0 ? 'vandaag' : d === 1 ? 'gisteren' : d < 30 ? `${d} dagen geleden` : when(iso); };
function pagesPage(ctx, { extra, locks, info = {} }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const groups = {};
	for (const id of ORDER) (groups[PLACE[id].sectie] = groups[PLACE[id].sectie] || []).push(id);
	const lockNote = (o) => (locks[o] ? `<span class="lock" title="Wordt bewerkt">${icon('lock')} ${esc(locks[o])}</span>` : '');
	const edited = (o) => (info[o] ? `<span class="meta">Aangepast ${esc(ago(info[o].gewijzigd_op))}${info[o].naam ? ` door ${esc(info[o].naam)}` : ''}</span>` : '<span class="meta">Standaardtekst</span>');
	const row = (href, title, sub, right) => `<a class="rowlink" href="${href}" data-filter-item="${esc(`${title} ${sub}`.toLowerCase())}"><span class="rl-main"><strong>${esc(title)}</strong><span class="meta">${esc(sub)}</span></span><span class="rl-side">${right}</span></a>`;
	const fixed = Object.entries(groups).map(([sectie, ids]) => `<section class="card rl-card" data-filter-group><h2>${esc(sectie)}</h2>${ids.map((id) => row(`/admin/tekst/${esc(id)}`, PLACE[id].label, PLACE[id].uitleg, `${lockNote(`tekst:${id}`)}${edited(`tekst:${id}`)}`)).join('')}${sectie === 'Extra pagina’s' ? row('/admin/privacy', 'Privacyverklaring', 'De tekst van /privacy.', `${lockNote('privacy')}${edited('privacy')}`) : ''}</section>`).join('');
	const extras = extra.length ? extra.map((p) => {
		const talen = LANGS.filter((l) => p.titels[l]);
		const titel = p.titels.nl || p.titels.en || Object.values(p.titels)[0] || '(zonder titel)';
		return row(`/admin/paginas/${p.id}`, titel, `${TEMPLATES[p.sjabloon] ? TEMPLATES[p.sjabloon].label : p.sjabloon}`, `${lockNote(`pagina:${p.id}`)}<span class="meta">${talen.map((l) => l.toUpperCase()).join(' · ') || 'geen taal'}</span><span class="pill ${p.status === 'gepubliceerd' ? 'ok' : ''}">${p.status === 'gepubliceerd' ? 'live' : 'concept'}</span>`);
	}).join('') : `<div class="empty">${icon('pages')}<p>Je hebt nog geen eigen pagina’s gemaakt.</p>${canWrite ? '<a class="btn-link" href="/admin/paginas/nieuw">Eerste pagina maken</a>' : ''}</div>`;
	return shell(ctx, { title: 'Pagina’s en teksten', active: 'paginas', body: `<div class="page-head"><div><h1>Pagina’s en teksten</h1><p class="hint">Kies wat je wilt aanpassen. Alles wat je publiceert staat meteen op de website.</p></div>${canWrite ? `<a class="btn-link" href="/admin/paginas/nieuw">${icon('plus')} Nieuwe pagina</a>` : ''}</div>
<div class="searchbar"><label class="sr" for="pf">Zoek een pagina</label>${icon('search')}<input id="pf" type="search" placeholder="Zoek een pagina of tekst…" data-filter autocomplete="off"></div>
<section class="card rl-card" data-filter-group><h2>Eigen pagina’s</h2>${extras}</section>
<h2 class="sub">Vaste pagina’s van de website</h2>
<div class="cols">${fixed}</div><p class="empty hidden" id="nofilter">Niets gevonden.</p>` });
}
function newPagePage(ctx, { existing = [] } = {}) {
	return shell(ctx, { title: 'Nieuwe pagina', active: 'paginas', body: `<h1>Nieuwe pagina</h1><p class="hint">Kies eerst een sjabloon. Het sjabloon bepaalt welke bouwstenen de pagina heeft en in welke volgorde.</p>
<form method="post" action="/admin/paginas/nieuw"><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">
<div class="cols3">${Object.entries(TEMPLATES).map(([id, t], i) => `<label class="card tpl"><span class="tpl-top"><input type="radio" name="sjabloon" value="${esc(id)}"${i === 0 ? ' checked' : ''}> <strong>${esc(t.label)}</strong></span><span class="hint">${esc(t.uitleg)}</span><span class="meta">${t.standaard.map((x) => esc(SECTIONS[x].label)).join(' → ')}</span></label>`).join('')}</div>
${existing.length ? `<details class="card fold"><summary>Of begin met een kopie van een bestaande pagina</summary><div class="row"><label for="kv">Kopieer</label><select id="kv" name="kopie_van"><option value="">(geen kopie, gebruik het gekozen sjabloon)</option>${existing.map((p) => `<option value="${p.id}">${esc(p.titels.nl || p.titels.en || `Pagina ${p.id}`)}</option>`).join('')}</select><p class="fhint">Je krijgt een concept met dezelfde indeling en teksten. De kop krijgt “(kopie)” erbij en het adres een eigen variant.</p></div></details>` : ''}
<div class="actions"><button type="submit">Pagina maken</button><a class="btn-link secondary" href="/admin/paginas">Annuleren</a></div></form>` });
}

/* ---- editors ---- */
const maxLen = (type) => (type === 'textarea' ? 2000 : type === 'rich' ? 50000 : 300);
const OPTIONAL_RE = require('../fields').OPTIONAL;

function control(f, lang, value) {
	const common = `data-lang="${lang}" data-key="${esc(f.key)}" lang="${lang}"${f.req ? ' data-req="1"' : ''} aria-label="${esc(f.label)} (${esc(LANG_NAMES[lang])})"`;
	if (f.type === 'rich') return `<div class="rte" data-lang="${lang}" data-key="${esc(f.key)}"><div class="rte-bar" role="toolbar" aria-label="Opmaak"><button type="button" data-cmd="bold" title="Vet" aria-label="Vet"><b>B</b></button><button type="button" data-cmd="italic" title="Cursief" aria-label="Cursief"><i>I</i></button><button type="button" data-cmd="h2">Kop</button><button type="button" data-cmd="h3">Subkop</button><button type="button" data-cmd="ul">Lijst</button><button type="button" data-cmd="ol">Genummerd</button><button type="button" data-cmd="quote">Citaat</button><button type="button" data-cmd="link">Link</button><button type="button" data-cmd="clear">Wis opmaak</button></div><div class="rte-area" contenteditable="true" role="textbox" aria-multiline="true" ${common}>${value || ''}</div></div>`;
	if (f.type === 'textarea') return `<textarea ${common} rows="3" maxlength="${maxLen('textarea')}">${esc(value)}</textarea>`;
	if (f.type === 'media') return `<select ${common} data-media="1"><option value="">(geen foto)</option>${media.list().map((m) => `<option value="${m.id}"${String(value) === String(m.id) ? ' selected' : ''}>#${m.id} ${esc(m.alt.en || m.bestand)}</option>`).join('')}</select>`;
	return `<input ${common} type="text" maxlength="${maxLen(f.type)}" value="${esc(value)}"${f.type === 'url' ? ' inputmode="url" placeholder="https://…"' : ''}>`;
}

/** One field, in all four languages (the editor shows one of them at a time, or all side by side). */
function fieldRow(f, values) {
	return `<div class="field" data-fieldkey="${esc(f.key)}"><div class="flabel">${esc(f.label)}</div>${f.hint ? `<p class="fhint">${esc(f.hint)}</p>` : ''}<div class="fcols">${LANGS.map((l) => `<div class="fcol" data-col="${l}"><span class="lang-tag">${esc(LANG_NAMES[l])}</span>${control(f, l, (values[l] || {})[f.key])}</div>`).join('')}</div><p class="ref" data-ref hidden></p></div>`;
}

/** 'standaard' (nothing edited yet), 'eerste_versie' or 'nagekeken' for one language of an object. */
function langState(statuses, l) {
	const rows = Object.values((statuses && statuses[l]) || {}).filter((r) => r.versie_nummer > 0 && r.status !== 'leeg');
	if (!rows.length) return 'standaard';
	return rows.every((r) => r.status === 'nagekeken') ? 'nagekeken' : 'eerste_versie';
}
const STATE_LABEL = { standaard: 'standaardtekst', eerste_versie: 'eerste versie', nagekeken: 'nagekeken' };

function langTabs(statuses, canWrite) {
	return `<div class="langtabs"><div role="tablist" aria-label="Taal van de invoer" class="lt-list">${LANGS.map((l) => {
		const st = l === 'en' ? '' : langState(statuses, l);
		return `<button type="button" role="tab" class="lt" data-lang-tab="${l}" aria-selected="false"><span class="lt-name">${esc(LANG_NAMES[l])}</span><span class="lt-prog" data-prog="${l}"></span>${st ? `<span class="pill st-${st}" data-state="${l}">${STATE_LABEL[st]}</span>` : ''}</button>`;
	}).join('')}</div><span class="spacer"></span>${canWrite ? '<button type="button" class="secondary small" id="review-btn" hidden></button>' : ''}<label class="chk"><input type="checkbox" id="alllangs"> Alle talen naast elkaar</label></div>`;
}

function previewPane(defaultPath, kind) {
	return `<aside class="preview-pane" aria-label="Voorbeeld"><div class="pv-bar"><strong>Voorbeeld</strong>
${kind === 'tekst' ? `<label class="pv-path"><span class="sr">Pagina</span><select data-pv="path">${PREVIEW_PAGES.map(([p, n]) => `<option value="${esc(p)}"${p === defaultPath ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : `<input type="hidden" data-pv="path" value="${esc(defaultPath)}">`}
<input type="hidden" data-pv="lang" value="en"><input type="hidden" data-pv="width" value="1200">
<span class="spacer"></span><div class="seg" role="group" aria-label="Schermbreedte"><button type="button" class="seg-b" data-pv-width="1200" aria-pressed="true" title="Bureaublad">${icon('monitor')}<span class="sr">Bureaublad</span></button><button type="button" class="seg-b" data-pv-width="768" aria-pressed="false" title="Tablet">${icon('tablet')}<span class="sr">Tablet</span></button><button type="button" class="seg-b" data-pv-width="390" aria-pressed="false" title="Telefoon">${icon('phone')}<span class="sr">Telefoon</span></button></div></div>
<div class="pv-frame"><iframe title="Voorbeeld van de pagina" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" name="pv" id="pv"></iframe></div>
<form id="pvform" method="post" action="/admin/preview" target="pv" hidden><input type="hidden" name="csrf"><input type="hidden" name="payload"></form></aside>`;
}

function editorHead(ctx, { titel, uitleg, object, canWrite, extraButtons = '', status = '' }) {
	return `<div class="ed-head"><div class="ed-title"><h1>${esc(titel)} ${status}</h1>${uitleg ? `<p class="hint">${esc(uitleg)}</p>` : ''}</div>
<div class="ed-actions"><span id="savestate" class="savestate" data-state="saved" role="status">Alles opgeslagen</span>${canWrite ? `<button type="button" class="secondary btn-link icon-only" id="btn-share" title="Voorbeeldlink delen" aria-label="Voorbeeldlink delen">${icon('share')}</button>${['beheerder', 'editor'].includes(ctx.session.user.rol) ? `<button type="button" class="secondary btn-link icon-only" id="btn-plan" title="Publicatie plannen" aria-label="Publicatie plannen">${icon('clock')}</button>` : ''}` : ''}${canWrite ? extraButtons : ''}<a class="secondary btn-link icon-only" href="/admin/historie?object=${encodeURIComponent(object)}" title="Geschiedenis" aria-label="Geschiedenis">${icon('history')}</a></div></div>
<div id="lockbanner" class="flash err" role="status" hidden></div>
<div id="plannote" class="flash" role="status" hidden></div>
<div id="draftbanner" class="flash" role="status" hidden><span>Niet-opgeslagen concept van <span id="draftwhen"></span> gevonden.</span> <button type="button" class="secondary small" id="draftrestore">Terugzetten</button> <button type="button" class="secondary small" id="draftdiscard">Weggooien</button></div>
<div id="result" role="status" aria-live="polite"></div>`;
}

/** Groups the fields of a text group into small cards with a heading, so a long form reads as a few clear blocks. */
function textBlocks(group) {
	const f = (k) => group.fields.find((x) => x.key === k);
	const pick = (keys) => keys.map(f).filter(Boolean);
	const id = group.id;
	if (id.startsWith('aud_')) return [['Kop en inleiding', pick([`${id}_seo`, `${id}_title`, `${id}_lead`])], ['De drie punten', pick([1, 2, 3].map((n) => `${id}_p${n}`))], ['Veelgestelde vragen', pick([1, 2, 3].flatMap((n) => [`${id}_q${n}`, `${id}_a${n}`]))]];
	if (id === 'problem') return [['Tekst', pick(['problem_title', 'problem_text'])], ['Feit 1', pick(['fact1_value', 'fact1_label', 'fact1_source', 'fact1_url'])], ['Feit 2', pick(['fact2_value', 'fact2_label', 'fact2_source', 'fact2_url'])]];
	if (id === 'steps') return [['Kop', pick(['steps_title'])], ...[1, 2, 3].map((n) => [`Stap ${n}`, pick([`step${n}_title`, `step${n}_text`])])];
	if (id === 'apps') return [['Kop', pick(['apps_title'])], ...[1, 2, 3, 4].map((n) => [`Kaart ${n}`, pick([`app${n}_title`, `app${n}_text`])])];
	if (id === 'about') return [['Het blok', pick(['about_title', 'about_text', 'company_details'])], ['Persoon 1', pick(['p1_name', 'p1_role', 'p1_bio', 'p1_link'])], ['Persoon 2', pick(['p2_name', 'p2_role', 'p2_bio', 'p2_link'])]];
	if (id === 'today') return [['Publiceren', pick(['today_enabled', 'seo_today'])], ['Tekst', pick(['today_title', 'today_lead', 'today_exists_title', 'today_item1', 'today_item2', 'today_item3', 'today_gap_title', 'today_gap_text'])]];
	if (id === 'contact') return [['Contactpagina', pick(['contact_title', 'contact_text', 'contact_reply'])], ['Bedrijf', pick(['linkedin_url'])]];
	return [['', group.fields]];
}

function textEditorPage(ctx, groupId, { values, statuses, versie, draft }) {
	const group = GROUPS.find((g) => g.id === groupId);
	const place = PLACE[groupId];
	const canWrite = ctx.session.user.rol !== 'lezer';
	const object = content.textObject(groupId);
	const blocks = textBlocks(group).map(([heading, fields]) => `<section class="card fgroup">${heading ? `<h2>${esc(heading)}</h2>` : ''}${fields.map((fl) => { const { label, hint } = labelOf(fl); return fieldRow({ key: fl.key, label, hint, type: fl.type, req: !OPTIONAL_RE.test(fl.key) }, values); }).join('')}</section>`).join('');
	return shell(ctx, { title: place.label, active: 'paginas', wide: true, body: `<p class="crumb"><a href="/admin/paginas">${icon('chev', 'back')} Pagina’s en teksten</a></p>${editorHead(ctx, { titel: place.label, uitleg: place.uitleg, object, canWrite, extraButtons: `<button type="button" id="btn-save">${ctx.session.user.rol === 'redacteur' ? 'Ter beoordeling indienen' : 'Publiceren'}</button>` })}
${langTabs(statuses, canWrite)}
<div class="ed-grid"><form id="editor" class="ed" data-all="0" data-kind="tekst" data-id="${esc(groupId)}" data-object="${esc(object)}" data-version="${versie}" data-readonly="${canWrite ? '0' : '1'}" data-draft="${json(draft || null)}" onsubmit="return false">${blocks}</form>${previewPane(place.path, 'tekst')}</div>` });
}
function privacyEditorPage(ctx, { values, versie, draft, statuses }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const f = { key: 'text', label: 'Privacyverklaring', hint: 'Een regel die begint met # is een kop. Een lege regel begint een nieuwe alinea. Laat de tekst controleren door een jurist en vervang alles tussen [haken].', type: 'privacy' };
	const row = `<div class="field"><div class="flabel">${esc(f.label)}</div><p class="fhint">${esc(f.hint)}</p><div class="fcols">${LANGS.map((l) => `<div class="fcol" data-col="${l}"><span class="lang-tag">${esc(LANG_NAMES[l])}</span><textarea data-lang="${l}" data-key="text" data-req="1" lang="${l}" rows="24" maxlength="20000" aria-label="Privacyverklaring (${esc(LANG_NAMES[l])})">${esc(values[l] || '')}</textarea></div>`).join('')}</div><p class="ref" data-ref hidden></p></div>`;
	return shell(ctx, { title: 'Privacyverklaring', active: 'paginas', wide: true, body: `<p class="crumb"><a href="/admin/paginas">${icon('chev', 'back')} Pagina’s en teksten</a></p>${editorHead(ctx, { titel: 'Privacyverklaring', uitleg: '', object: 'privacy', canWrite, extraButtons: `<button type="button" id="btn-save">${ctx.session.user.rol === 'redacteur' ? 'Ter beoordeling indienen' : 'Publiceren'}</button>` })}
${langTabs(statuses || {}, canWrite)}
<div class="ed-grid"><form id="editor" class="ed" data-all="0" data-kind="privacy" data-object="privacy" data-version="${versie}" data-readonly="${canWrite ? '0' : '1'}" data-draft="${json(draft || null)}" onsubmit="return false"><section class="card fgroup">${row}</section></form>${previewPane('/privacy', 'privacy')}</div>` });
}

/** A section card for the page editor. */
function sectionCard(section, values) {
	const def = SECTIONS[section.type];
	const id = section.id;
	const base = def.velden.map((f) => fieldRow({ key: `s.${id}.${f.key}`, label: f.label, type: f.type }, values)).join('');
	let itemsHtml = '';
	if (def.items) {
		const filled = (n) => LANGS.some((l) => def.items.velden.some((f) => ((values[l] || {})[`s.${id}.items.${n}.${f.key}`] || '').trim()));
		itemsHtml = `<div class="items" data-max="${def.items.max}">${Array.from({ length: def.items.max }, (_, i) => i + 1).map((n) => `<div class="item${filled(n) || n === 1 ? '' : ' hidden'}" data-item="${n}"><div class="item-head"><strong>${esc(def.items.label)} ${n}</strong><span class="spacer"></span><button type="button" class="secondary small" data-item-clear="${n}">Verwijderen</button></div>${def.items.velden.map((f) => fieldRow({ key: `s.${id}.items.${n}.${f.key}`, label: f.label, type: f.type }, values)).join('')}</div>`).join('')}<button type="button" class="secondary small" data-item-add>${icon('plus')} ${esc(def.items.label)} toevoegen</button></div>`;
	}
	return `<section class="sec card" data-sid="${esc(id)}" data-type="${esc(section.type)}"><div class="sec-head" data-sec-toggle>${icon('chev', 'chev')}<strong>${esc(def.label)}</strong><span class="sec-sum" data-sec-sum></span><span class="spacer"></span>
<button type="button" class="secondary small icon-only" data-sec-up aria-label="Omhoog" title="Omhoog">↑</button><button type="button" class="secondary small icon-only" data-sec-down aria-label="Omlaag" title="Omlaag">↓</button><button type="button" class="secondary small" data-sec-remove>Verwijderen</button></div><div class="sec-body">${base}${itemsHtml}</div></section>`;
}

function pageEditorPage(ctx, id, p) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const tpl = TEMPLATES[p.meta.sjabloon];
	const object = pagesApi.object(id);
	const baseOf = (keys) => pagesApi.BASE.filter((f) => keys.includes(f.key)).map((f) => fieldRow(f, p.velden)).join('');
	const sections = p.meta.indeling.map((s) => sectionCard(s, p.velden)).join('');
	const addOptions = tpl.toegestaan.map((t) => `<option value="${esc(t)}">${esc(SECTIONS[t].label)}</option>`).join('');
	const templates = tpl.toegestaan.map((t) => `<template id="tpl-${esc(t)}">${sectionCard({ id: '__ID__', type: t }, {})}</template>`).join('');
	const live = p.meta.status === 'gepubliceerd';
	const title = (p.velden.nl && p.velden.nl.titel) || (p.velden.en && p.velden.en.titel) || 'Nieuwe pagina';
	const proposer = ctx.session.user.rol === 'redacteur';
	const buttons = proposer
		? (live ? '<button type="button" id="btn-save">Wijzigingen ter beoordeling indienen</button>' : '<button type="button" class="secondary" id="btn-save">Opslaan als concept</button><button type="button" id="btn-publish">Ter beoordeling indienen</button>')
		: live
			? '<button type="button" id="btn-save">Wijzigingen opslaan</button><button type="button" class="secondary" id="btn-unpublish">Offline halen</button>'
			: '<button type="button" class="secondary" id="btn-save">Opslaan als concept</button><button type="button" id="btn-publish">Publiceren</button>';
	const isNew = p.versie === 0;
	return shell(ctx, { title, active: 'paginas', wide: true, body: `<p class="crumb"><a href="/admin/paginas">${icon('chev', 'back')} Pagina’s en teksten</a></p>${editorHead(ctx, { titel: title, uitleg: `${tpl.label}. ${tpl.uitleg}`, object, canWrite, extraButtons: buttons, status: `<span class="pill ${live ? 'ok' : ''}">${live ? 'live' : 'concept'}</span>` })}
${langTabs(p.status, canWrite)}
<div class="ed-grid"><form id="editor" class="ed" data-all="0" data-kind="pagina" data-id="${id}" data-object="${esc(object)}" data-version="${p.versie}" data-new="${isNew ? '1' : '0'}" data-status="${esc(p.meta.status)}" data-template="${esc(p.meta.sjabloon)}" data-readonly="${canWrite ? '0' : '1'}" data-draft="${json(p.draft || null)}" data-rules="${json({ toegestaan: tpl.toegestaan, verplicht: tpl.verplicht, max: tpl.max || {}, vrij: !!tpl.vrij })}" onsubmit="return false">
<section class="card fgroup"><h2>Basis</h2>${baseOf(['titel', 'slug', 'lead'])}</section>
<details class="card fold"><summary>Zoekmachines (SEO)</summary>${baseOf(['seo_title', 'seo_description'])}</details>
<details class="card fold"><summary>Instellingen van de pagina</summary><div class="opts"><label class="chk"><input type="checkbox" data-meta="in_footer"${p.meta.in_footer ? ' checked' : ''}> Link in de footer</label><label class="chk"><input type="checkbox" data-meta="indexeren"${p.meta.indexeren ? ' checked' : ''}> Zichtbaar voor zoekmachines</label><label class="chk">Volgorde in de footer <input type="number" data-meta="volgorde" min="0" max="9999" value="${p.meta.volgorde}" class="narrow-num"></label></div></details>
${canWrite ? `<div class="page-tools"><form method="post" action="/admin/paginas/${id}/dupliceren"><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}"><button type="submit" class="secondary small">Pagina dupliceren</button></form></div>` : ''}
<div class="sec-title"><h2>Inhoud van de pagina</h2><div class="actions"><button type="button" class="secondary small" id="collapse-all">Alles inklappen</button><button type="button" class="secondary small" id="expand-all">Alles uitklappen</button></div></div>
<div id="sections">${sections}</div>
${canWrite ? `<div class="addbar"><label for="addtype">Bouwsteen toevoegen</label><select id="addtype">${addOptions}</select><button type="button" class="secondary" id="addsec">${icon('plus')} Toevoegen</button></div>` : ''}
</form>${previewPane(`/${(p.velden.nl && p.velden.nl.slug) || (p.velden.en && p.velden.en.slug) || 'voorbeeld'}`, 'pagina')}</div>${templates}
${canWrite && ['beheerder', 'editor'].includes(ctx.session.user.rol) ? `<form method="post" action="/admin/paginas/${id}/verwijderen" class="card danger-zone" data-confirm="Deze pagina naar de prullenbak? Je kunt hem 30 dagen terugzetten."><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}"><button class="danger" type="submit">Pagina naar de prullenbak</button></form>` : ''}` });
}

/* ---- history ---- */
function historyPage(ctx, { object, entries }) {
	const rows = entries.length ? `<div class="scroll"><table><thead><tr><th>Versie</th><th>Wanneer</th><th>Door</th><th>Reden</th><th></th></tr></thead><tbody>${entries.map((e) => `<tr><td>${e.versie_nummer}</td><td>${esc(when(e.tijdstip))}</td><td>${esc(e.gebruiker || 'systeem')}</td><td>${esc(e.reden || '')}</td><td class="num"><a href="/admin/historie/${e.id}">vergelijk</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nog geen eerdere versies.</p>';
	return shell(ctx, { title: 'Geschiedenis', active: 'paginas', body: `<h1>Geschiedenis</h1><p class="hint"><code>${esc(object)}</code>. Bij elke publicatie wordt de vorige staat bewaard.</p><section class="card">${rows}</section>` });
}
function diffPage(ctx, { entry, diff, object, huidigeVersie, kind, pageId }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const sideBySide = (regels) => {
		const rows = [];
		for (let i = 0; i < regels.length;) {
			if (regels[i].t === '=') { rows.push([regels[i].tekst, regels[i].tekst, 'eq']); i += 1; continue; }
			const del = []; const add = [];
			while (i < regels.length && regels[i].t !== '=') { (regels[i].t === '-' ? del : add).push(regels[i].tekst); i += 1; }
			for (let k = 0; k < Math.max(del.length, add.length); k += 1) rows.push([del[k], add[k], 'chg']);
		}
		return `<div class="sbs" role="table" aria-label="Verschillen"><div class="sbs-head" role="row"><span role="columnheader">Toen (versie ${entry.versie_nummer})</span><span role="columnheader">Nu</span></div>${rows.map(([a, b, k]) => `<div class="sbs-row ${k}" role="row"><span class="sbs-l${a == null ? ' none' : ''}${k === 'chg' && a != null ? ' del' : ''}" role="cell">${a == null ? '' : esc(a) || '&nbsp;'}</span><span class="sbs-r${b == null ? ' none' : ''}${k === 'chg' && b != null ? ' add' : ''}" role="cell">${b == null ? '' : esc(b) || '&nbsp;'}</span></div>`).join('')}</div>`;
	};
	const blocks = diff.length ? diff.map((d) => `<section class="card"><h2>${esc(d.taal.toUpperCase())}: <code>${esc(d.veld)}</code></h2>${sideBySide(d.regels)}</section>`).join('') : '<p class="hint">Deze versie is gelijk aan de huidige.</p>';
	return shell(ctx, { title: 'Vergelijken', active: 'paginas', body: `<h1>Versie ${entry.versie_nummer} tegenover nu</h1><p class="hint"><code>${esc(object)}</code>, vastgelegd ${esc(when(entry.tijdstip))}. Links wat er toen stond, rechts wat er nu staat. <span class="ddel">Rood</span> is weggehaald, <span class="dadd">groen</span> is erbij gekomen.</p>
${canWrite && ['beheerder', 'editor'].includes(ctx.session.user.rol) ? `<form method="post" action="/admin/historie/${entry.id}/terugzetten" data-confirm="Deze versie terugzetten? De huidige staat blijft in de geschiedenis."><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}"><input type="hidden" name="basis" value="${huidigeVersie}"><button type="submit">Eén klik: terugzetten naar versie ${entry.versie_nummer}</button></form>` : ''}${blocks}
<p><a href="/admin/historie?object=${encodeURIComponent(object)}">← terug naar de geschiedenis</a></p>` });
}

/* ---- media ---- */
function mediaPage(ctx, { items, slots, enc, usage = {} }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const canPublish = ['beheerder', 'editor'].includes(ctx.session.user.rol);
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const rightsLabel = { eigen: 'Eigen foto', gelicentieerd: 'Gelicentieerd', ai_sfeer: 'AI-sfeerbeeld' };
	const rightsLong = { eigen: 'Eigen foto', gelicentieerd: 'Gelicentieerd', ai_sfeer: 'AI-sfeerbeeld (alleen als illustratie)' };
	const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);
	const altOther = (alt, idp) => LANGS.filter((l) => l !== 'en').map((l) => `<div class="row"><label for="${idp}${l}">Omschrijving ${esc(LANG_NAMES[l])}</label><input id="${idp}${l}" name="alt_${l}" maxlength="200" lang="${l}" value="${esc((alt || {})[l] || '')}"></div>`).join('');
	const altFields = (alt, idp) => `<div class="row"><label for="${idp}en">Omschrijving voor slechtzienden (Engels) *</label><input id="${idp}en" name="alt_en" maxlength="200" lang="en" required value="${esc((alt || {}).en || '')}"><p class="fhint">Beschrijf wat er te zien is, bijvoorbeeld “Een elektrische bus rijdt door een stadscentrum”.</p></div>
<details class="fold-lite"><summary>Omschrijving in andere talen</summary>${altOther(alt, idp)}</details>`;
	const rightsSel = (value, id) => `<select id="${id}" name="rechten">${media.RIGHTS.map((r) => `<option value="${r}"${value === r ? ' selected' : ''}>${esc(rightsLong[r])}</option>`).join('')}</select>`;
	const total = items.reduce((n, m) => n + (m.grootte || 0), 0);
	const unused = items.filter((m) => !(usage[m.id] || []).length).length;
	const byId = Object.fromEntries(items.map((m) => [m.id, m]));
	const thumb = (m, cls = '') => (m ? `<img class="${cls}" src="/uploads/${esc(m.bestand)}" alt="${esc(m.alt.en || '')}" loading="lazy" width="${m.breedte}" height="${m.hoogte}">` : `<span class="ph ${cls}">${icon('media')}<span>Geen foto</span></span>`);
	const slotCards = IMAGE_SLOTS.map((s) => {
		const cur = byId[slots[s.slot]];
		return `<form method="post" action="/admin/media/plek" class="card slot">${csrf}<input type="hidden" name="plek" value="${esc(s.slot)}">
<div class="slot-img">${thumb(cur)}</div><div class="slot-body"><strong>${esc(SLOTS[s.slot] || s.label)}</strong>
<select name="media" aria-label="Foto voor ${esc(SLOTS[s.slot] || s.label)}" data-autosubmit${canPublish ? '' : ' disabled'}><option value="">(geen foto)</option>${items.map((m) => `<option value="${m.id}"${slots[s.slot] === m.id ? ' selected' : ''}>#${m.id} ${esc((m.alt.en || m.bestand).slice(0, 40))}</option>`).join('')}</select>
${canPublish ? '<noscript><button type="submit" class="small">Opslaan</button></noscript>' : ''}</div></form>`;
	}).join('');
	const upload = canWrite ? `<section class="card" id="upload"><h2>Foto toevoegen</h2>
<form method="post" action="/admin/media/upload" enctype="multipart/form-data" class="upl">${csrf}
<label class="drop" id="drop" for="file"><input id="file" type="file" name="file" accept="image/jpeg,image/png,image/webp" required><span class="drop-empty">${icon('media')}<strong>Sleep een foto hierheen</strong><span>of klik om te kiezen · JPG, PNG of WebP · maximaal 5 MB</span></span><img class="drop-prev" alt="" hidden><span class="drop-name" hidden></span></label>
<div class="upl-fields">${altFields(null, 'u-')}
<div class="row"><label for="u-rechten">Rechten</label>${rightsSel('eigen', 'u-rechten')}</div>
<div class="row"><label for="u-bron">Bron of licentie (optioneel)</label><input id="u-bron" name="bron" maxlength="200"></div>
<button type="submit">${icon('plus')} Uploaden</button></div></form>
<p class="hint">Locatiegegevens (GPS) worden uit de foto gehaald. ${enc.webp || enc.avif ? `Er worden automatisch ${[enc.webp && 'WebP (1x en 2x)', enc.avif && 'AVIF'].filter(Boolean).join(' en ')}-versies gemaakt.` : 'Voor kleinere WebP- en AVIF-versies zijn <code>cwebp</code> en <code>avifenc</code> nodig op de server; zonder blijft het origineel in gebruik.'}</p></section>` : '';
	const card = (m) => {
		const used = usage[m.id] || [];
		const missing = LANGS.filter((l) => !m.alt[l]).length;
		const useLabel = used.map((u) => (u.soort === 'plek' ? SLOTS[u.naam] || u.naam : 'Pagina')).join(', ');
		return `<figure class="card mitem" data-media data-search="${esc(`${m.id} ${m.alt.en || ''} ${m.bron || ''}`.toLowerCase())}" data-use="${used.length ? 1 : 0}" data-rights="${esc(m.rechten)}">
<button type="button" class="thumb" data-dialog="m${m.id}" aria-label="Foto ${m.id} bekijken en bewerken">${thumb(m)}</button>
<figcaption><strong>${esc(m.alt.en || m.bestand)}</strong><span class="meta">${m.breedte}×${m.hoogte} · ${fmtSize(m.grootte)}${m.varianten.length ? ` · ${m.varianten.length} versies` : ''}</span>
<span class="tags">${used.length ? `<span class="pill ok" title="${esc(useLabel)}">In gebruik</span>` : '<span class="pill st-standaard">Ongebruikt</span>'}<span class="pill${m.rechten === 'ai_sfeer' ? ' st-warn' : ' st-standaard'}">${esc(rightsLabel[m.rechten])}</span>${missing ? `<span class="pill st-warn" title="Omschrijving ontbreekt in ${missing} taal/talen">${missing} omschr. mist</span>` : ''}</span></figcaption></figure>`;
	};
	const dialog = (m) => {
		const used = usage[m.id] || [];
		return `<dialog id="m${m.id}" class="dlg" aria-label="Foto ${m.id}"><div class="dlg-head"><h2>Foto #${m.id}</h2><button type="button" class="secondary small" data-close aria-label="Sluiten">Sluiten</button></div>
<div class="dlg-body"><div class="dlg-img">${thumb(m)}<p class="meta">${esc(m.bestand)} · ${m.breedte}×${m.hoogte} · ${fmtSize(m.grootte)}</p>${used.length ? `<p class="meta">In gebruik als: ${esc(used.map((u) => (u.soort === 'plek' ? SLOTS[u.naam] || u.naam : 'Pagina')).join(', '))}</p>` : '<p class="meta">Wordt nergens gebruikt.</p>'}</div>
${canPublish ? `<div><form method="post" action="/admin/media/${m.id}">${csrf}${altFields(m.alt, `e${m.id}-`)}<div class="row"><span class="flabel">Waar moet de foto scherp blijven als hij wordt bijgesneden?</span><div class="focus" data-focus><div class="focus-img"><img src="/uploads/${esc(m.bestand)}" alt="" width="${m.breedte}" height="${m.hoogte}"><span class="focus-dot" data-x="${m.focus_x == null ? 50 : m.focus_x}" data-y="${m.focus_y == null ? 50 : m.focus_y}"></span></div><input type="hidden" name="focus_x" value="${m.focus_x == null ? 50 : m.focus_x}"><input type="hidden" name="focus_y" value="${m.focus_y == null ? 50 : m.focus_y}"><p class="fhint">Klik op het belangrijkste deel (een gezicht, het voertuig). Op smalle of brede plekken blijft dat deel in beeld.</p></div></div>
<div class="row"><label for="e${m.id}-r">Rechten</label>${rightsSel(m.rechten, `e${m.id}-r`)}</div><div class="row"><label for="e${m.id}-b">Bron of licentie</label><input id="e${m.id}-b" name="bron" maxlength="200" value="${esc(m.bron)}"></div><button type="submit">Opslaan</button></form>
<form method="post" action="/admin/media/${m.id}/verwijderen" data-confirm="Deze foto definitief verwijderen?" class="dz">${csrf}<button type="submit" class="danger small"${used.length ? ' disabled title="Haal de foto eerst weg waar hij gebruikt wordt"' : ''}>Verwijderen</button>${used.length ? '<span class="meta"> Eerst vervangen waar hij gebruikt wordt.</span>' : ''}</form></div>` : ''}</div></dialog>`;
	};
	const library = items.length ? `<div class="toolbar"><div class="searchbar">${icon('search')}<input type="search" id="mq" placeholder="Zoek in omschrijving of bron" aria-label="Zoek foto’s"></div>
<div class="chips" role="group" aria-label="Filter"><button type="button" class="chip" data-mfilter="all" aria-pressed="true">Alle <span class="n">${items.length}</span></button><button type="button" class="chip" data-mfilter="used" aria-pressed="false">In gebruik <span class="n">${items.length - unused}</span></button><button type="button" class="chip" data-mfilter="unused" aria-pressed="false">Ongebruikt <span class="n">${unused}</span></button></div></div>
<div class="mgrid" id="mgrid">${items.map(card).join('')}</div><p class="hint" id="mnone" hidden>Geen foto’s gevonden met deze filter.</p>${items.map(dialog).join('')}` : `<div class="empty">${icon('media')}<p><strong>Nog geen foto’s.</strong></p><p class="hint">Upload hierboven je eerste foto. Gebruik alleen foto’s waarvoor je de rechten hebt.</p></div>`;
	return shell(ctx, { title: 'Media', active: 'media', body: `<div class="page-head"><div><h1>Media</h1><p class="hint">${nf(items.length)} foto${items.length === 1 ? '' : '’s'} · ${fmtSize(total)} in totaal${unused ? ` · ${unused} ongebruikt` : ''}. AI-beelden zijn alleen sfeer en nooit het prototype zelf.</p></div>${canWrite ? '<a class="btn-link" href="#upload">' + icon('plus') + ' Foto toevoegen</a>' : ''}</div>
<section class="card"><h2>Foto’s op de site</h2><p class="hint">Kies welke foto waar op de website komt. Een wijziging is direct zichtbaar.</p><div class="slots">${slotCards}</div></section>${upload}<section class="card"><h2>Bibliotheek</h2>${library}</section>` });
}

/* ---- messages ---- */
const ST = messagesApi.STATUS_LABELS;
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
const avatar = (name, cls = '') => `<span class="avatar${cls ? ' ' + cls : ''}" aria-hidden="true">${esc(initials(name))}</span>`;
function relTime(v) {
	const t = typeof v === 'number' ? v : Date.parse(v);
	if (!t) return '-';
	const min = Math.round((Date.now() - t) / 60000);
	if (min < 1) return 'zojuist';
	if (min < 60) return `${min} min geleden`;
	if (min < 1440) return `${Math.round(min / 60)} uur geleden`;
	const d = Math.round(min / 1440);
	return d === 1 ? 'gisteren' : d < 14 ? `${d} dagen geleden` : when(new Date(t).toISOString());
}
const statusPill = (s) => `<span class="pill st-${esc(s)}">${esc(ST[s] || s)}</span>`;
function messagesPage(ctx, { list, total, page, pages, filter, counts, people, sources, roles, retention, queueProblems = 0, flash }) {
	const me = ctx.session.user;
	const canWrite = me.rol !== 'lezer';
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const q = (extra = {}) => new URLSearchParams(Object.entries({ ...filter, ...extra }).filter(([, v]) => v)).toString();
	const href = (extra) => `/admin/berichten${q(extra) ? '?' + q(extra) : ''}`;
	const all = Object.values(counts).reduce((a, b) => a + b, 0);
	const tabs = [['', 'Alle', all], ...messagesApi.STATUSES.map((s) => [s, ST[s], counts[s]])];
	const chips = `<nav class="chips" aria-label="Status">${tabs.map(([v, l, n]) => `<a class="chip${v === 'nieuw' && n ? ' hot' : ''}" href="${href({ status: v, page: '' })}"${(filter.status || '') === v ? ' aria-current="page"' : ''}>${esc(l)} <span class="n">${nf(n)}</span></a>`).join('')}</nav>`;
	const mineVal = String(me.id);
	const assignSel = `<select name="toegewezen" aria-label="Toegewezen aan" data-autosubmit><option value="">Iedereen</option><option value="${mineVal}"${filter.toegewezen === mineVal ? ' selected' : ''}>Aan mij toegewezen</option><option value="niemand"${filter.toegewezen === 'niemand' ? ' selected' : ''}>Niet toegewezen</option>${people.filter((u) => u.id !== me.id).map((u) => `<option value="${u.id}"${filter.toegewezen === String(u.id) ? ' selected' : ''}>${esc(u.naam)}</option>`).join('')}</select>`;
	const sel = (name, label, options, value) => `<label>${label}<select name="${name}"><option value="">alle</option>${options.map(([v, l]) => `<option value="${esc(v)}"${value === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
	const extraOpen = ['rol', 'taal', 'bron', 'van', 'tot'].some((k) => filter[k]);
	const bar = `<form method="get" action="/admin/berichten" class="toolbar">${filter.status ? `<input type="hidden" name="status" value="${esc(filter.status)}">` : ''}<div class="searchbar">${icon('search')}<input type="search" name="q" value="${esc(filter.q || '')}" placeholder="Zoek op naam, e-mail of tekst" aria-label="Zoeken"></div>${assignSel}
<details class="morefilters"${extraOpen ? ' open' : ''}><summary class="btn-link secondary small">Meer filters${extraOpen ? ' •' : ''}</summary><div class="morebox">${sel('rol', 'Rol', roles.map((r) => [r, r]), filter.rol || '')}${sel('taal', 'Taal', LANGS.map((l) => [l, l.toUpperCase()]), filter.taal || '')}${sel('bron', 'Bron', sources.map((s) => [s, s]), filter.bron || '')}<label>Van<input type="date" name="van" value="${esc(filter.van || '')}"></label><label>Tot<input type="date" name="tot" value="${esc(filter.tot || '')}"></label></div></details>
<button type="submit" class="small">Zoeken</button>${Object.values(filter).some(Boolean) ? `<a href="/admin/berichten" class="clear">Alles wissen</a>` : ''}</form>`;
	const row = (m) => {
		const who = people.find((u) => u.id === m.toegewezen_aan);
		return `<li class="msg-row${m.status === 'nieuw' ? ' unread' : ''}">${canWrite ? `<label class="selbox"><input type="checkbox" name="sel_${m.id}" value="1" data-sel aria-label="Selecteer bericht van ${esc(m.naam)}"></label>` : ''}
<a class="msg-main" href="/admin/berichten/${m.id}"><span class="msg-top"><strong>${esc(m.naam)}</strong>${m.organisatie ? `<span class="meta"> · ${esc(m.organisatie)}</span>` : ''}<span class="meta"> · ${esc(m.rol)} · ${esc(m.taal.toUpperCase())}</span></span><span class="msg-snip">${esc(m.tekst.replace(/\s+/g, ' ').slice(0, 140))}${m.tekst.length > 140 ? '…' : ''}</span></a>
<span class="msg-side">${statusPill(m.status)}${who ? `<span class="who-chip" title="Toegewezen aan ${esc(who.naam)}">${avatar(who.naam)}<span>${esc(who.naam.split(' ')[0])}</span></span>` : ''}<time class="meta" datetime="${esc(m.tijd)}" title="${esc(when(m.tijd))}">${esc(relTime(m.tijd))}</time></span></li>`;
	};
	const actions = canWrite ? `<div class="bulkbar" id="bulkbar"><label class="selbox"><input type="checkbox" id="selall" aria-label="Alles op deze pagina selecteren"></label><span id="selcount" class="meta">Niets geselecteerd</span>
<select name="actie" id="bulkact" aria-label="Actie voor de selectie" disabled><option value="">Kies een actie…</option><optgroup label="Zet status op">${messagesApi.STATUSES.map((s) => `<option value="status:${s}">${esc(ST[s])}</option>`).join('')}</optgroup><optgroup label="Toewijzen aan"><option value="toewijzen:${me.id}">Mij</option>${people.filter((u) => u.id !== me.id).map((u) => `<option value="toewijzen:${u.id}">${esc(u.naam)}</option>`).join('')}<option value="toewijzen:">Niemand</option></optgroup><option value="verwijderen">Verwijderen…</option></select>
<button type="submit" class="small" id="bulkgo" disabled>Uitvoeren</button></div>` : '';
	const emptyText = Object.values(filter).some(Boolean) ? 'Geen berichten die bij deze filters passen.' : 'Er zijn nog geen berichten binnengekomen via het contactformulier.';
	const listHtml = list.length ? `<form method="post" action="/admin/berichten/bulk" id="bulkform" data-confirm-delete="Alle geselecteerde berichten definitief verwijderen?">${csrf}<input type="hidden" name="terug" value="${esc(href({}))}">${actions}<ul class="msglist">${list.map(row).join('')}</ul></form>` : `<div class="empty">${icon('mail')}<p><strong>${esc(emptyText)}</strong></p></div>`;
	const pager = pages > 1 ? `<nav class="tabs" aria-label="Paginering">${Array.from({ length: pages }, (_, i) => i + 1).map((n) => `<a href="${href({ page: n })}"${n === page ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>` : '';
	return shell({ ...ctx, flash }, { title: 'Berichten', active: 'berichten', body: `<div class="page-head"><div><h1>Berichten</h1><p class="hint">Via het contactformulier. Berichten blijven ${retention} dagen bewaard en worden daarna automatisch verwijderd.</p></div>
<div class="head-actions"><a class="btn-link secondary small" href="/admin/berichten.csv?${esc(q())}">${icon('send')} Exporteren</a><a class="btn-link secondary small" href="/admin/berichten/privacy">${icon('shield')} Privacyverzoek</a><a class="btn-link secondary small" href="/admin/wachtrij">${icon('mail')} Mailwachtrij${queueProblems ? ` <span class="badge">${queueProblems}</span>` : ''}</a></div></div>
${chips}${bar}<section class="card flush">${listHtml}${pager}</section>` });
}
function messagePage(ctx, { m, gebruikers, aantalVanAdres, flash }) {
	const me = ctx.session.user;
	const canWrite = me.rol !== 'lezer';
	const subject = encodeURIComponent('Re: je bericht via de website van Aethra');
	const quote = encodeURIComponent(`\n\n> ${String(m.tekst).split('\n').join('\n> ')}`);
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const mail = `mailto:${esc(m.email)}?subject=${subject}&amp;body=${quote}`;
	const who = gebruikers.find((u) => u.id === m.toegewezen_aan);
	const flow = ['nieuw', 'gelezen', 'in_behandeling', 'beantwoord', 'afgesloten'];
	const stepper = canWrite ? `<form method="post" action="/admin/berichten/${m.id}/status" class="stepper" aria-label="Status">${csrf}${flow.map((s) => `<button type="submit" name="status" value="${s}" class="step" aria-pressed="${m.status === s}">${esc(ST[s])}</button>`).join('')}</form>` : statusPill(m.status);
	const next = m.status === 'nieuw' || m.status === 'gelezen' ? ['in_behandeling', 'Neem in behandeling'] : m.status === 'in_behandeling' ? ['afgesloten', 'Markeer als afgerond'] : m.status === 'beantwoord' ? ['afgesloten', 'Markeer als afgerond'] : null;
	return shell({ ...ctx, flash }, { title: m.naam, active: 'berichten', body: `<p class="crumb"><a href="/admin/berichten">← Alle berichten</a></p>
<div class="page-head"><div class="who-head">${avatar(m.naam, 'lg')}<div><h1>${esc(m.naam)}</h1><p class="hint"><a href="${mail}">${esc(m.email)}</a>${m.organisatie ? ' · ' + esc(m.organisatie) : ''} · ${esc(m.rol)} · ${esc(m.taal.toUpperCase())}</p></div></div>${statusPill(m.status)}</div>
<div class="split">
<div><section class="card"><p class="meta">${esc(when(m.tijd))}${m.bron && m.bron !== 'direct' ? ' · via ' + esc(m.bron) + (m.campagne ? ' / ' + esc(m.campagne) : '') : ''}</p><p class="msg-text">${esc(m.tekst).replace(/\n/g, '<br>')}</p>
<div class="actions"><a class="btn-link" href="${mail}">${icon('send')} Beantwoorden per e-mail</a>${canWrite && next ? `<form method="post" action="/admin/berichten/${m.id}/status" class="inline">${csrf}<button type="submit" name="status" value="${next[0]}" class="secondary">${next[1]}</button></form>` : ''}</div>
${canWrite && m.status !== 'beantwoord' && m.status !== 'afgesloten' ? '<p class="hint">Na het beantwoorden kun je hieronder de status op “Beantwoord” zetten.</p>' : ''}</section>
${canWrite ? `<section class="card"><h2>Interne notitie</h2><form method="post" action="/admin/berichten/${m.id}/notitie">${csrf}<div class="row"><label for="note" class="sr">Notitie</label><textarea id="note" name="notitie" rows="4" maxlength="5000" placeholder="Alleen zichtbaar voor het team">${esc(m.notitie)}</textarea></div><button type="submit" class="small">Notitie opslaan</button></form></section>` : (m.notitie ? `<section class="card"><h2>Interne notitie</h2><p>${esc(m.notitie)}</p></section>` : '')}</div>
<aside>${canWrite ? `<section class="card"><h2>Opvolging</h2><p class="label-sm">Status</p>${stepper}
<p class="label-sm">Toegewezen aan</p><form method="post" action="/admin/berichten/${m.id}/toewijzen" class="inline">${csrf}<select name="gebruiker" aria-label="Toegewezen aan" data-autosubmit><option value="">Niemand</option>${gebruikers.map((u) => `<option value="${u.id}"${m.toegewezen_aan === u.id ? ' selected' : ''}>${esc(u.naam)}${u.id === me.id ? ' (jij)' : ''}</option>`).join('')}</select><noscript><button type="submit" class="small">Opslaan</button></noscript>${m.toegewezen_aan !== me.id ? `<button type="submit" name="gebruiker" value="${me.id}" class="secondary small">Aan mij</button>` : ''}</form>
${who ? `<p class="meta">Nu bij ${esc(who.naam)}.</p>` : ''}</section>
<section class="card"><h2>Privacy</h2><p class="hint">${aantalVanAdres} bericht${aantalVanAdres === 1 ? '' : 'en'} van dit e-mailadres. <a href="/admin/berichten/privacy?email=${encodeURIComponent(m.email)}">Bekijken, exporteren of wissen</a>.</p>
<form method="post" action="/admin/berichten/${m.id}/verwijderen" data-confirm="Dit bericht definitief verwijderen?">${csrf}<button type="submit" class="danger small">Dit bericht verwijderen</button></form></section>` : `<section class="card"><p class="meta">Je hebt alleen leesrechten. Status: ${statusPill(m.status)}</p></section>`}</aside></div>` });
}
function privacyRequestPage(ctx, { email, list, flash }) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const canWrite = ctx.session.user.rol !== 'lezer';
	return shell({ ...ctx, flash }, { title: 'Privacyverzoek', active: 'berichten', body: `<h1>Privacyverzoek</h1><p class="hint">Zoek alles wat één persoon heeft gestuurd. Je kunt het exporteren (inzageverzoek) en wissen (verwijderverzoek).</p>
<form method="get" action="/admin/berichten/privacy" class="card"><div class="row"><label for="pe">E-mailadres</label><input id="pe" type="email" name="email" value="${esc(email)}" required></div><button type="submit" class="small">Zoeken</button></form>
${email ? `<section class="card"><h2>${list.length} bericht${list.length === 1 ? '' : 'en'} van ${esc(email)}</h2>${list.length ? `<ul class="plain">${list.map((m) => `<li><a href="/admin/berichten/${m.id}">${esc(when(m.tijd))}</a> · ${esc(m.rol)} · ${esc(m.tekst.slice(0, 80))}${m.tekst.length > 80 ? '…' : ''}</li>`).join('')}</ul>
<p><a class="btn-link" href="/admin/berichten/privacy.json?email=${encodeURIComponent(email)}">Exporteren (JSON)</a></p>${canWrite ? `<form method="post" action="/admin/berichten/privacy/wissen" data-confirm="Alle berichten van dit adres definitief wissen?">${csrf}<input type="hidden" name="email" value="${esc(email)}"><button type="submit" class="danger">Alles van dit adres wissen</button></form>` : ''}` : ''}</section>` : ''}` });
}
function queuePage(ctx, { rows, stats, outbox = [], outboxStats = {}, smtp = false }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const table = rows.length ? `<div class="scroll"><table data-sortable><thead><tr><th>Bericht</th><th>Soort</th><th>Status</th><th>Pogingen</th><th>Volgende poging</th><th>Fout</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.bericht_id ? `<a href="/admin/berichten/${r.bericht_id}">${esc(r.naam || '#' + r.bericht_id)}</a>` : '-'}</td><td>${esc(r.soort)}</td><td><span class="pill ${r.status === 'verzonden' ? 'ok' : r.status === 'gefaald' ? 'st-warn' : ''}">${esc(r.status)}</span></td><td>${r.aantal_pogingen}</td><td>${r.status === 'mislukt' ? esc(when(r.volgende_poging)) : '-'}</td><td>${esc(r.foutmelding || '')}</td><td>${canWrite && (r.status === 'mislukt' || r.status === 'gefaald') ? `<form method="post" action="/admin/wachtrij/${r.id}/opnieuw">${csrf}<button class="small" type="submit">Opnieuw proberen</button></form>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">De wachtrij is leeg.</p>';
	const other = outbox.length ? `<div class="scroll"><table data-sortable><thead><tr><th>Soort</th><th>Onderwerp</th><th>Aan</th><th>Status</th><th>Pogingen</th><th></th></tr></thead><tbody>${outbox.map((r) => `<tr><td>${esc(r.soort)}</td><td>${esc(r.onderwerp)}</td><td>${esc(r.aan)}</td><td><span class="pill ${r.status === 'verzonden' ? 'ok' : r.status === 'gefaald' ? 'st-warn' : ''}">${esc(r.status)}</span></td><td>${r.pogingen}</td><td>${canWrite && (r.status === 'mislukt' || r.status === 'gefaald') ? `<form method="post" action="/admin/mail/${r.id}/opnieuw">${csrf}<button class="small" type="submit">Opnieuw proberen</button></form>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nog geen andere mails verstuurd.</p>';
	return shell(ctx, { title: 'Mailwachtrij', active: 'wachtrij', body: `<div class="page-head"><div><h1>Mailwachtrij</h1><p class="hint">Een bericht staat altijd eerst in de database. Mails gaan via deze wachtrij: bij een storing probeert het systeem het opnieuw (na 10, 20, 40 en 80 minuten) en geeft na 5 pogingen op. ${Object.entries(stats).map(([k, v]) => `${esc(k)}: ${v}`).join(' · ')}</p></div></div>
${smtp ? '' : '<p class="flash err" role="alert">' + icon('alert') + '<span>Er is geen mailserver ingesteld (SMTP_HOST en MAIL_FROM). Mails blijven in de wachtrij staan tot dat is gedaan.</span></p>'}
<section class="card"><h2>Berichten van het contactformulier</h2>${table}</section><section class="card"><h2>Overige mails</h2><p class="hint">Uitnodigingen, herstellinks, meldingen en het weekrapport. ${Object.entries(outboxStats).map(([k, v]) => `${esc(k)}: ${v}`).join(' · ')}</p>${other}</section>` });
}

/* ---- redirects, users, audit, account, stats ---- */
function redirectsPage(ctx, list) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const canWrite = ['beheerder', 'editor'].includes(ctx.session.user.rol);
	const table = list.length ? `<div class="scroll"><table><thead><tr><th>Van</th><th>Naar</th><th>Gebruikt</th><th></th></tr></thead><tbody>${list.map((r) => `<tr><td><code>${esc(r.van)}</code></td><td><code>${esc(r.naar)}</code></td><td>${r.hits}</td><td>${canWrite ? `<form method="post" action="/admin/redirects/verwijderen">${csrf}<input type="hidden" name="van" value="${esc(r.van)}"><button class="danger small" type="submit">Verwijderen</button></form>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nog geen redirects. Ze ontstaan vanzelf als je het adres van een gepubliceerde pagina wijzigt.</p>';
	return shell(ctx, { title: 'Redirects', active: 'redirects', body: `<h1>Redirects</h1><p class="hint">Een oud adres stuurt bezoekers permanent (301) naar het nieuwe adres. Dat gebeurt automatisch als een adres van een gepubliceerde pagina verandert.</p><section class="card">${table}</section>
${canWrite ? `<section class="card"><h2>Redirect toevoegen</h2><form method="post" action="/admin/redirects">${csrf}<div class="row"><label for="rv">Van (bijvoorbeeld /nl/oude-pagina)</label><input id="rv" name="van" required></div><div class="row"><label for="rn">Naar (bijvoorbeeld /nl/nieuwe-pagina)</label><input id="rn" name="naar" required></div><button type="submit">Toevoegen</button></form></section>` : ''}` });
}
const ROLE_INFO = { beheerder: ['Beheerder', 'Alles, ook gebruikers, instellingen en auditlog.'], editor: ['Editor', 'Teksten, pagina’s, media en berichten; mag publiceren en voorstellen beoordelen.'], redacteur: ['Redacteur', 'Schrijft en bewaart concepten; dient wijzigingen in ter beoordeling, publiceert niet zelf.'], lezer: ['Lezer', 'Alleen kijken, niets wijzigen.'] };
function usersPage(ctx, { list, sessions = {}, flash, link = null }) {
	const me = ctx.session.user;
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const roleSel = (value, id, disabled) => `<select id="${id}" name="rol"${disabled ? ' disabled' : ''}>${Object.keys(ROLE_INFO).map((r) => `<option value="${r}"${value === r ? ' selected' : ''}>${esc(ROLE_INFO[r][0])}</option>`).join('')}</select>`;
	const legend = `<div class="rolecards">${Object.entries(ROLE_INFO).map(([r, [l, d]]) => `<div class="card mini"><strong>${esc(l)}</strong><span class="meta">${esc(d)}</span><span class="meta">${list.filter((u) => u.rol === r && u.actief).length} actief</span></div>`).join('')}</div>`;
	const card = (u) => {
		const self = u.id === me.id;
		const n = sessions[u.id] || 0;
		return `<article class="card ucard${u.actief ? '' : ' off'}">
<div class="u-head">${avatar(u.naam, 'lg')}<div class="u-id"><strong>${esc(u.naam)}${self ? ' <span class="pill st-standaard">Jij</span>' : ''}</strong><span class="meta">${esc(u.email)}</span></div>
<div class="u-tags"><span class="pill st-role">${esc(ROLE_INFO[u.rol][0])}</span>${u.tweestaps ? '<span class="pill ok">2FA aan</span>' : '<span class="pill st-warn">Geen 2FA</span>'}${u.actief ? '' : '<span class="pill st-leeg">Uitgeschakeld</span>'}</div></div>
<p class="meta u-meta">Laatste login: ${u.laatste_login ? esc(relTime(u.laatste_login)) : 'nog nooit'} · ${n} actieve sessie${n === 1 ? '' : 's'}</p>
<details class="manage"><summary class="btn-link secondary small">Beheren</summary><div class="manage-grid">
<form method="post" action="/admin/gebruikers/${u.id}" class="mbox">${csrf}<h3>Gegevens</h3><div class="row"><label for="n${u.id}">Naam</label><input id="n${u.id}" name="naam" value="${esc(u.naam)}" maxlength="80" required></div><div class="row"><label for="r${u.id}">Rol</label>${roleSel(u.rol, `r${u.id}`, self)}${self ? '<p class="fhint">Je kunt je eigen rol niet wijzigen.</p>' : ''}</div>
${self ? '<input type="hidden" name="actief" value="1">' : `<label class="chk"><input type="checkbox" name="actief" value="1"${u.actief ? ' checked' : ''}> Account actief</label>`}<button class="small" type="submit">Opslaan</button></form>
<form method="post" action="/admin/gebruikers/${u.id}/wachtwoord" class="mbox">${csrf}<h3>Wachtwoord</h3><div class="row"><label for="w${u.id}">Nieuw wachtwoord</label><input id="w${u.id}" name="nieuw" type="password" minlength="12" autocomplete="new-password" required><p class="fhint">Minstens 12 tekens. Alle sessies van deze gebruiker worden uitgelogd.</p></div><div class="row"><label for="h${u.id}">Jouw wachtwoord ter bevestiging</label><input id="h${u.id}" name="huidig" type="password" autocomplete="current-password" required></div><button class="small" type="submit">Wachtwoord instellen</button></form>
<div class="mbox"><h3>Beveiliging</h3>${u.tweestaps ? `<form method="post" action="/admin/gebruikers/${u.id}/2fa-uit" data-confirm="Tweestapsverificatie voor deze gebruiker uitzetten?">${csrf}<div class="row"><label for="t${u.id}">Jouw wachtwoord ter bevestiging</label><input id="t${u.id}" name="huidig" type="password" autocomplete="current-password" required></div><button class="small danger" type="submit">2FA uitzetten</button></form>` : '<p class="hint">Deze gebruiker heeft geen tweestapsverificatie. Dat kan alleen de gebruiker zelf aanzetten onder Mijn account.</p>'}
${u.actief ? `<form method="post" action="/admin/gebruikers/${u.id}/herstellink" class="mt">${csrf}<div class="row"><label for="hl${u.id}">Jouw wachtwoord ter bevestiging</label><input id="hl${u.id}" name="huidig" type="password" autocomplete="current-password" required></div><button class="small secondary" type="submit">Herstellink maken</button><p class="fhint">Stuurt een mail met een link om een nieuw wachtwoord te kiezen, of toont de link als er geen mailserver is.</p></form>` : ''}
${n && !self ? `<form method="post" action="/admin/gebruikers/${u.id}/uitloggen" data-confirm="Alle sessies van ${esc(u.naam)} beëindigen?">${csrf}<button class="small secondary" type="submit">Overal uitloggen (${n})</button></form>` : ''}</div></div></details></article>`;
	};
	const open = flash && !flash.ok;
	return shell({ ...ctx, flash }, { title: 'Gebruikers', active: 'gebruikers', body: `<div class="page-head"><div><h1>Gebruikers</h1><p class="hint">${list.length} account${list.length === 1 ? '' : 's'}. Wie mag wat staat hieronder.</p></div></div>${legend}
${link ? `<section class="card"><h2>Link om door te geven</h2><p class="hint">Eenmalig en tijdelijk. Stuur hem alleen aan de persoon zelf, bij voorkeur niet per gewone e-mail of chat die anderen kunnen lezen.</p><p><input type="text" readonly value="${esc(link)}" aria-label="Link" onclick="this.select()"></p></section>` : ''}<div class="ulist">${list.map(card).join('')}</div>
<details class="card fold adduser"${open ? ' open' : ''}><summary>${icon('plus')} Gebruiker toevoegen</summary><form method="post" action="/admin/gebruikers">${csrf}<div class="two"><div class="row"><label for="ue">E-mailadres</label><input id="ue" name="email" type="email" required></div><div class="row"><label for="un">Naam</label><input id="un" name="naam" required maxlength="80"></div></div>
<div class="row"><label for="ur">Rol</label>${roleSel('editor', 'ur')}</div><div class="row"><label for="up">Startwachtwoord (optioneel)</label><input id="up" name="wachtwoord" type="password" minlength="12" autocomplete="new-password"><p class="fhint">Laat leeg om de persoon per e-mail uit te nodigen: die kiest dan zelf een wachtwoord via een link (drie dagen geldig). Vul je wel iets in (minstens 12 tekens), dan geef je dat wachtwoord zelf door.</p></div><div class="row"><label for="uh">Jouw wachtwoord ter bevestiging</label><input id="uh" name="huidig" type="password" autocomplete="current-password" required></div><button type="submit">Toevoegen</button></form></details>` });
}
function auditPage(ctx, { rows, total, page, filter, people }) {
	const pages = Math.max(1, Math.ceil(total / 100));
	const q = (extra = {}) => new URLSearchParams(Object.entries({ ...filter, ...extra }).filter(([, v]) => v)).toString();
	const f = filter;
	return shell(ctx, { title: 'Auditlog', active: 'audit', body: `<div class="page-head"><div><h1>Auditlog</h1><p class="hint">Elke wijziging, publicatie, override en inlogpoging. De tabel is append-only: de applicatie kan niets wijzigen of wissen (rijen ouder dan 180 dagen gaan maandelijks naar een gezipt archief).</p></div><a class="btn-link secondary small" href="/admin/audit.csv?${esc(q())}">${icon('send')} Exporteren (CSV)</a></div>
<form method="get" action="/admin/audit" class="toolbar"><label class="fl">Wie<select name="gebruiker"><option value="">iedereen</option><option value="systeem"${f.gebruiker === 'systeem' ? ' selected' : ''}>systeem</option>${people.map((u) => `<option value="${u.id}"${f.gebruiker === String(u.id) ? ' selected' : ''}>${esc(u.naam)}</option>`).join('')}</select></label>
<label class="fl">Actie bevat<input name="actie" value="${esc(f.actie)}" placeholder="bijv. publiceer"></label><label class="fl">Onderdeel bevat<input name="entiteit" value="${esc(f.entiteit)}" placeholder="bijv. pagina:3"></label>
<label class="fl">Van<input type="date" name="van" value="${esc(f.van)}"></label><label class="fl">Tot<input type="date" name="tot" value="${esc(f.tot)}"></label><button class="small" type="submit">Filteren</button>${Object.values(f).some(Boolean) ? '<a class="clear" href="/admin/audit">Wissen</a>' : ''}</form>
<p class="hint">${nf(total)} regel${total === 1 ? '' : 's'}.</p>
<section class="card flush"><div class="scroll"><table data-sortable><thead><tr><th>Tijd</th><th>Wie</th><th>Actie</th><th>Onderdeel</th><th>Details</th><th>Reden</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(when(r.timestamp))}</td><td>${esc(r.naam || r.gebruiker || 'systeem')}</td><td>${esc(r.actie)}</td><td><code>${esc(r.entiteit)}</code></td><td class="detail">${esc(String(r.nieuwe_waarde || r.oude_waarde || '').slice(0, 160))}</td><td>${esc(r.override_reden || '')}</td></tr>`).join('')}</tbody></table></div>
${pages > 1 ? `<nav class="tabs" aria-label="Paginering">${Array.from({ length: Math.min(pages, 30) }, (_, i) => i + 1).map((n) => `<a href="/admin/audit?${q({ page: n })}"${n === page ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>` : ''}</section>` });
}
const ACTION_NL = { 'login.gelukt': 'Ingelogd', 'login.code_mislukt': 'Foute 2FA-code', logout: 'Uitgelogd', 'gebruiker.wachtwoord': 'Wachtwoord gewijzigd', 'gebruiker.gewijzigd': 'Account gewijzigd', 'gebruiker.uitgelogd': 'Andere apparaten uitgelogd', 'tekst.gepubliceerd': 'Tekst gepubliceerd', 'pagina.gepubliceerd': 'Pagina gepubliceerd', 'media.gewijzigd': 'Foto gewijzigd', 'media.verwijderd': 'Foto verwijderd', 'bericht.status': 'Status van bericht gewijzigd', 'bericht.verwijderd': 'Bericht verwijderd', 'media.geupload': 'Foto geüpload', 'media.plek': 'Foto op de site gewijzigd', 'pagina.aangemaakt': 'Pagina aangemaakt', 'pagina.verwijderd': 'Pagina verwijderd', 'bericht.toegewezen': 'Bericht toegewezen', 'bericht.notitie': 'Notitie bij bericht' };
function accountPage(ctx, { flash, tf = {}, sessions = [], activity = [] }) {
	const me = ctx.session.user;
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	let two;
	if (tf.codes) two = `<section class="card"><h2>Herstelcodes</h2><p class="hint">Tweestapsverificatie staat aan. Bewaar deze codes veilig (wachtwoordmanager of geprint). Elke code werkt één keer als je je telefoon kwijt bent. Ze worden alleen nu getoond.</p><ul class="codes">${tf.codes.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul></section>`;
	else if (tf.setup) two = `<section class="card"><h2>Tweestapsverificatie instellen</h2><ol class="steps-list"><li>Open een authenticator-app op je telefoon en kies om een account toe te voegen.</li><li>Scan deze QR-code.<div class="qr-wrap">${qrSvg(tf.setup.uri, 'QR-code om het Aethra-account toe te voegen aan een authenticator-app')}</div><details class="alt"><summary>Scannen lukt niet?</summary><p>Kies “sleutel invoeren” (tijdgebonden) en typ: <code class="key">${esc(tf.setup.secret.replace(/(.{4})/g, '$1 ').trim())}</code></p></details></li><li>Vul de 6-cijferige code uit de app in.</li></ol>
<form method="post" action="/admin/2fa/confirm" class="inline">${csrf}<div class="row"><label for="c2">Code uit de app</label><input id="c2" name="code" inputmode="numeric" autocomplete="one-time-code" required></div><button type="submit">Bevestigen</button></form>
<form method="post" action="/admin/2fa/restart">${csrf}<button type="submit" class="secondary small">Nieuwe QR-code</button></form></section>`;
	else if (tf.enabled) two = `<section class="card"><div class="card-title"><h2>Tweestapsverificatie</h2><span class="pill ok">Aan</span></div><p class="hint">Je hebt nog ${tf.left} herstelcode${tf.left === 1 ? '' : 's'}. Uitzetten of nieuwe herstelcodes vragen je wachtwoord en een code uit de app.</p>
<form method="post" action="/admin/2fa/disable">${csrf}<div class="two"><div class="row"><label for="dp">Huidig wachtwoord</label><input id="dp" name="current" type="password" autocomplete="current-password" required></div><div class="row"><label for="dc">Code uit de app</label><input id="dc" name="code" autocomplete="one-time-code" required></div></div><div class="actions"><button type="submit" class="danger">Uitzetten</button> <button type="submit" formaction="/admin/2fa/recovery" class="secondary">Nieuwe herstelcodes</button></div></form></section>`;
	else two = `<section class="card"><div class="card-title"><h2>Tweestapsverificatie</h2><span class="pill st-warn">Uit</span></div><p class="hint">Sterk aanbevolen: een gestolen wachtwoord geeft dan geen toegang meer.</p><form method="post" action="/admin/2fa/start">${csrf}<div class="row"><label for="sp">Bevestig met je huidige wachtwoord</label><input id="sp" name="current" type="password" autocomplete="current-password" required></div><button type="submit">Instellen</button></form></section>`;
	const sess = `<section class="card"><h2>Ingelogd op</h2><ul class="plain sess">${sessions.map((s) => `<li>${icon('monitor')}<span><strong>${s.huidig ? 'Dit apparaat' : 'Ander apparaat'}</strong><span class="meta"> · ingelogd ${esc(relTime(s.aangemaakt))} · laatst actief ${esc(relTime(s.laatst_gezien))}</span></span></li>`).join('')}</ul>
${sessions.length > 1 ? `<form method="post" action="/admin/account/sessies-uit" data-confirm="Alle andere apparaten uitloggen?">${csrf}<button type="submit" class="secondary small">Alle andere apparaten uitloggen</button></form>` : '<p class="hint">Je bent alleen hier ingelogd.</p>'}</section>`;
	const act = activity.length ? `<section class="card"><h2>Jouw recente activiteit</h2><ul class="plain act">${activity.map((a) => `<li><span>${esc(ACTION_NL[a.actie] || a.actie)}</span><time class="meta">${esc(relTime(a.timestamp))}</time></li>`).join('')}</ul></section>` : '';
	return shell({ ...ctx, flash }, { title: 'Mijn account', active: 'account', body: `<div class="page-head"><div class="who-head">${avatar(me.naam, 'lg')}<div><h1>${esc(me.naam)}</h1><p class="hint">${esc(me.email)} · ${esc(ROLE_INFO[me.rol][0])}: ${esc(ROLE_INFO[me.rol][1].toLowerCase())}</p></div></div></div>
<div class="acc-grid"><div>
<section class="card"><h2>Naam</h2><form method="post" action="/admin/account/naam" class="inline">${csrf}<label for="an" class="sr">Naam</label><input id="an" name="naam" value="${esc(me.naam)}" maxlength="80" required><button type="submit" class="small">Opslaan</button></form></section>
${me.rol !== 'lezer' ? `<form method="post" action="/admin/account/meldingen" class="card">${csrf}<h2>Meldingen</h2><label class="chk"><input type="checkbox" name="meld_nieuw_bericht" value="1"${me.meld_nieuw_bericht ? ' checked' : ''}> E-mail bij een nieuw bericht via de website</label><label class="chk"><input type="checkbox" name="weekrapport" value="1"${me.weekrapport ? ' checked' : ''}> Weekrapport per e-mail (maandagochtend)</label><p class="fhint">Mails komen binnen via de mailwachtrij. In de mail staat geen berichttekst, alleen een link naar het beheer.</p><div class="actions"><button type="submit" class="small">Opslaan</button><button type="button" class="secondary small" id="notifybtn" hidden>Meldingen in de browser aanzetten</button></div></form>` : ''}
<form method="post" action="/admin/account" class="card">${csrf}<h2>Wachtwoord wijzigen</h2><div class="row"><label for="cur">Huidig wachtwoord</label><input id="cur" name="current" type="password" autocomplete="current-password" required></div><div class="row"><label for="new">Nieuw wachtwoord</label><input id="new" name="password" type="password" autocomplete="new-password" minlength="12" required data-strength><div class="meter" id="meter" hidden><span></span></div><p class="fhint" id="meter-t">Minstens 12 tekens. Een zin van een paar woorden werkt het best.</p></div><div class="actions spread"><label class="chk"><input type="checkbox" data-showpw> Wachtwoorden tonen</label><button type="submit">Wijzigen</button></div></form>
${sess}</div><div>${two}${act}</div></div>` });
}

/* statistics (same figures as before) */
const table = (headers, rows, empty) => (!rows.length ? `<p class="hint">${esc(empty)}</p>` : `<div class="scroll"><table><thead><tr>${headers.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="num">${esc(typeof c === 'number' ? nf(c) : c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`);
function statsPage(ctx, sum, days) {
	const top = (obj, limit = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limit);
	const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
	const w = 720, h = 140, max = Math.max(1, ...sum.perDay), n = sum.perDay.length, gap = 2, bw = Math.max(2, (w - gap * (n - 1)) / n);
	const bars = sum.perDay.map((v, i) => { const bh = Math.round((v / max) * (h - 8)); return `<rect class="bar-rect" x="${(i * (bw + gap)).toFixed(1)}" y="${h - bh}" width="${bw.toFixed(1)}" height="${Math.max(bh, v ? 1 : 0)}"><title>${esc(sum.days[i])}: ${v}</title></rect>`; }).join('');
	const chart = `<svg class="chart" viewBox="0 0 ${w} ${h + 18}" role="img" aria-label="Paginaweergaven per dag, piek ${max}"><text x="0" y="10" class="axis">${max}</text>${bars}<text x="0" y="${h + 14}" class="axis">${esc(sum.days[0])}</text><text x="${w}" y="${h + 14}" class="axis" text-anchor="end">${esc(sum.days[n - 1])}</text></svg>`;
	const ranges = [7, 30, 90].map((d) => `<a href="/admin/stats?days=${d}"${d === days ? ' aria-current="page"' : ''}>${d} dagen</a>`).join('');
	return shell(ctx, { title: 'Statistieken', active: 'stats', body: `<h1>Statistieken</h1><p class="hint">Anonieme paginaweergaven, geteld zonder cookies of IP-adressen. Bezoekers met Do Not Track worden niet geteld. Gebruik de cijfers voor trends, niet als exacte aantallen.</p><nav class="tabs" aria-label="Periode">${ranges}</nav>
<div class="kpis"><div class="kpi"><span class="kpi-v">${nf(sum.views)}</span><span>Paginaweergaven</span></div><div class="kpi"><span class="kpi-v">${nf(sum.contactViews)}</span><span>Weergaven contactpagina</span></div><div class="kpi"><span class="kpi-v">${nf(sum.sent)}</span><span>Berichten verstuurd</span></div><div class="kpi"><span class="kpi-v">${pct(sum.sent, sum.contactViews)}</span><span>Contactpagina naar bericht</span></div></div>
<section class="card"><h2>Weergaven per dag</h2>${chart}</section><section class="card"><h2>Populaire pagina’s</h2>${table(['Pagina', 'Weergaven'], top(sum.pages).map(([k, v]) => [k, v]), 'Nog geen weergaven.')}</section>
<section class="card"><h2>Waar bezoekers vandaan komen</h2>${table(['Bron / campagne', 'Weergaven'], top(sum.sources).map(([k, v]) => [k, v]), 'Nog geen weergaven.')}<p class="hint">Voorzie links van tags om campagnes te zien, bijvoorbeeld <code>https://jouwsite.nl/nl/?utm_source=linkedin&amp;utm_campaign=lancering</code>.</p></section>
<section class="card"><h2>Taal</h2>${table(['Taal', 'Weergaven'], top(sum.langs).map(([k, v]) => [k.toUpperCase(), v]), 'Nog geen weergaven.')}</section><section class="card"><h2>Berichten per rol</h2>${table(['Rol', 'Berichten'], top(sum.roles).map(([k, v]) => [k, v]), 'Geen berichten in deze periode.')}</section>` });
}

const errorPage = (ctx, status, text) => shell({ ...ctx, session: ctx.session || null }, { title: 'Fout', body: `<section class="card narrow"><h1>${esc(String(status))}</h1><p>${esc(text)}</p><p><a href="/admin">Terug naar het begin</a></p></section>`, script: false });

module.exports = { trashPage, translationsPage, planningPage, shareLinksPage, forgotPage, resetPage, reviewsPage, reviewPage, settingsPage, systemPage, menuPage, PLACE, ORDER, loginPage, codePage, dashboardPage, pagesPage, newPagePage, textEditorPage, privacyEditorPage, pageEditorPage, sectionCard, historyPage, diffPage, mediaPage, messagesPage, messagePage, privacyRequestPage, queuePage, redirectsPage, usersPage, auditPage, accountPage, statsPage, errorPage, CONTACT_ROLES };

/* ---- menu editor ---- */
function menuPage(ctx, data) {
	const canWrite = ['beheerder', 'editor'].includes(ctx.session.user.rol);
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const state = { menu: data.menu, fixed: data.fixed, pages: data.pages, langs: data.langs, names: LANG_NAMES, max: { header: 8, footer: 24 }, canWrite };
	const list = (id, title, hint, extra = '') => `<section class="card mnu" data-list="${id}"><div class="card-title"><h2>${title}</h2><span class="meta" data-count></span></div><p class="hint">${hint}</p>${extra}<ul class="mlist" data-items aria-label="${title}"></ul><p class="hint" data-empty hidden>Nog niets in dit menu.</p>${canWrite ? '<div class="addrow"><label class="sr" for="add-' + id + '">Toevoegen</label><select id="add-' + id + '" data-add-select></select><button type="button" class="secondary small" data-add>' + icon('plus') + ' Toevoegen</button></div>' : ''}</section>`;
	return shell({ ...ctx }, { title: 'Menu', active: 'menu', body: `<div class="page-head"><div><h1>Menu</h1><p class="hint">Bepaal welke links in het hoofdmenu en de voettekst staan, in welke volgorde en met welke tekst. Wijzigingen zijn pas zichtbaar na opslaan.</p></div>${data.custom ? '<span class="pill ok">Aangepast menu</span>' : '<span class="pill st-standaard">Standaardmenu</span>'}</div>
<div class="card mock"><div class="mock-bar"><strong>Zo ziet het eruit</strong><div class="chips" role="group" aria-label="Taal van het voorbeeld">${data.langs.map((l) => `<button type="button" class="chip" data-mlang="${l}" aria-pressed="${l === 'nl'}">${l.toUpperCase()}</button>`).join('')}</div></div>
<div class="mock-site"><span class="mock-brand">AETHRA</span><nav class="mock-nav" data-mock="header" aria-label="Voorbeeld hoofdmenu"></nav><span class="mock-btn" data-mock="cta"></span></div><div class="mock-foot"><span class="meta">Voettekst:</span><nav class="mock-nav" data-mock="footer" aria-label="Voorbeeld voettekst"></nav></div></div>
<form method="post" action="/admin/menu" id="menuform" data-state="${esc(JSON.stringify(state))}">${csrf}<input type="hidden" name="menu" id="menuinput">
<div class="mgrid2">${list('header', 'Hoofdmenu', 'Links bovenaan de site. Houd het kort: drie tot vijf links werkt het best.')}
<div>${list('footer', 'Voettekst', 'Links onderaan elke pagina.')}
<section class="card mnu" data-cta><div class="card-title"><h2>Knop rechtsboven</h2></div><p class="hint">Eén opvallende knop naast het hoofdmenu, bijvoorbeeld “Contact”.</p><div data-cta-box></div></section></div></div>
${canWrite ? `<div class="savebar" id="savebar"><span class="meta" id="menustate">Geen wijzigingen</span><button type="submit" id="menusave">Menu opslaan</button></div>` : '<p class="hint">Je hebt alleen leesrechten.</p>'}</form>
${canWrite && data.custom ? `<form method="post" action="/admin/menu/standaard" data-confirm="Terug naar het standaardmenu? Je aanpassingen gaan verloren." class="dz">${csrf}<button type="submit" class="secondary small">Terugzetten naar standaardmenu</button></form>` : ''}
<p class="hint">De rij met doelgroeppagina’s onderaan de voettekst en de taalkeuze staan vast.</p>` });
}

/* ---- settings and system ---- */
const fmtBytes = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1).replace('.', ',')} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);
function settingsPage(ctx, { values: v, mail }) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const langs = LANGS.map((l) => [l, LANG_NAMES[l]]);
	const texts = (prefix, label) => langs.map(([l, n]) => `<div class="row"><label for="${prefix}${l}">${label} (${esc(n)})</label><input id="${prefix}${l}" name="${prefix}${l}" maxlength="${prefix.startsWith('banner') ? 200 : 600}" lang="${l}" value="${esc(v[prefix + l] || '')}"></div>`).join('');
	return shell(ctx, { title: 'Instellingen', active: 'instellingen', body: `<div class="page-head"><div><h1>Instellingen</h1><p class="hint">Dingen die je niet in de code hoeft te wijzigen. Alleen voor beheerders; elke wijziging komt in het auditlog.</p></div></div>
<form method="post" action="/admin/instellingen" class="settings">${csrf}
<section class="card"><h2>Mededeling bovenaan de site</h2><p class="hint">Een smalle balk boven de header, bijvoorbeeld “We zijn op 12 november aanwezig op een beurs”. Houd het feitelijk: dezelfde redactionele regels gelden als voor de rest van de site.</p>
<label class="chk"><input type="checkbox" name="banner_aan" value="1"${v.banner_aan ? ' checked' : ''}> Mededeling tonen</label>
<div class="two"><div class="row"><label for="banner_tot">Tot en met (optioneel)</label><input id="banner_tot" type="date" name="banner_tot" value="${esc(v.banner_tot)}"><p class="fhint">Daarna verdwijnt de balk vanzelf.</p></div><div class="row"><label for="banner_link">Link (optioneel)</label><input id="banner_link" name="banner_link" maxlength="300" value="${esc(v.banner_link)}" placeholder="https://… of /adres"></div></div>
${texts('banner_tekst_', 'Tekst')}<p class="fhint">Laat een taal leeg om de Engelse tekst te gebruiken.</p></section>
<section class="card"><h2>Onderhoudsmodus</h2><p class="hint">Bezoekers zien een nette pagina (HTTP 503, zodat zoekmachines niet denken dat de site weg is). Het beheer blijft gewoon werken. Vergeet hem niet uit te zetten.</p>
<label class="chk"><input type="checkbox" name="onderhoud_aan" value="1"${v.onderhoud_aan ? ' checked' : ''}> Onderhoudsmodus aan</label>${texts('onderhoud_tekst_', 'Uitleg voor bezoekers')}</section>
<section class="card"><h2>Berichten</h2><div class="row"><label for="bewaar">Bewaartermijn van berichten (dagen)</label><input id="bewaar" type="number" name="bewaartermijn_dagen" min="30" max="1825" value="${esc(v.bewaartermijn_dagen)}"><p class="fhint">Daarna worden berichten automatisch verwijderd. Tussen 30 en 1825 dagen. Neem de termijn ook op in de privacyverklaring.</p></div></section>
<section class="card"><h2>E-mail</h2><p>${mail.smtp ? '<span class="pill ok">Mailserver ingesteld</span>' : '<span class="pill st-warn">Geen mailserver</span>'} ${mail.team ? '<span class="pill ok">Teammelding aan</span>' : '<span class="pill st-standaard">Teammelding uit</span>'}</p>
<p class="hint">De mailserver staat om veiligheidsredenen niet in dit scherm maar in de omgeving van de server: <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>MAIL_FROM</code> en optioneel <code>MAIL_TO</code>. Per persoon stel je meldingen in onder Mijn account.</p></section>
<div class="savebar"><button type="submit">Instellingen opslaan</button></div></form>` });
}
function systemPage(ctx, d) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const up = d.uptime >= 86400 ? `${Math.floor(d.uptime / 86400)} d ${Math.floor((d.uptime % 86400) / 3600)} u` : d.uptime >= 3600 ? `${Math.floor(d.uptime / 3600)} u ${Math.floor((d.uptime % 3600) / 60)} min` : `${Math.max(1, Math.floor(d.uptime / 60))} min`;
	const last = d.backups[0];
	const stale = !last || d.now - Date.parse(last.tijd) > 36 * 3600 * 1000;
	const card = (label, value, hint = '', cls = '') => `<div class="card mini ${cls}"><span class="meta">${esc(label)}</span><strong>${value}</strong>${hint ? `<span class="meta">${hint}</span>` : ''}</div>`;
	const failed = (d.queue.gefaald || 0) + (d.queue.mislukt || 0) + (d.outbox.gefaald || 0) + (d.outbox.mislukt || 0);
	return shell(ctx, { title: 'Systeem', active: 'systeem', body: `<div class="page-head"><div><h1>Systeem</h1><p class="hint">De gezondheid van de website en de database, en de back-ups.</p></div></div>
<div class="rolecards sys">${card('Database', d.dbOk ? 'In orde' : 'Niet bereikbaar', fmtBytes(d.dbBytes), d.dbOk ? '' : 'bad')}${card('Foto’s', `${nf(d.uploads.files)} bestanden`, fmtBytes(d.uploads.bytes))}${card('Schijfruimte', d.disk ? `${fmtBytes(d.disk.vrij)} vrij` : 'onbekend', d.disk ? `van ${fmtBytes(d.disk.totaal)}` : '')}${card('Laatste back-up', last ? esc(when(last.tijd)) : 'nog geen', stale ? 'Ouder dan 36 uur of nog geen: maak er een.' : `${d.backups.length} bewaard (maximaal ${d.keep})`, stale ? 'bad' : '')}
${card('Mailserver', d.smtp ? 'Ingesteld' : 'Niet ingesteld', failed ? `${failed} mail${failed === 1 ? '' : 's'} met problemen` : 'Geen problemen', d.smtp && !failed ? '' : 'bad')}${card('Versie', esc(d.versie), `Node ${esc(d.node)} · draait ${up}`)}${card('Cache', `${nf(d.cache.size)} pagina’s`, `${nf(d.cache.hits)} treffers, ${nf(d.cache.misses)} gemist`)}${card('Verbinding', d.secure ? 'Beveiligde cookies' : 'Cookies zonder Secure', d.siteUrl ? esc(d.siteUrl) : 'SITE_URL niet ingesteld', d.secure ? '' : 'bad')}</div>
${d.gezondheid.length ? `<section class="card"><h2>Aandachtspunten</h2><ul class="plain">${d.gezondheid.map((g) => `<li><span class="pill ${g.ernst === 'info' ? 'st-standaard' : 'st-warn'}">${esc(g.ernst)}</span> ${esc(g.bericht)}</li>`).join('')}</ul></section>` : ''}
<section class="card"><div class="card-title"><h2>Back-ups van de database</h2><form method="post" action="/admin/systeem/backup">${csrf}<button type="submit" class="small">Nu een back-up maken</button></form></div>
<p class="hint">Elke dag automatisch, de laatste ${d.keep} blijven bewaard in de map <code>data/backups</code>. Een back-up bevat alle gegevens, ook de versleutelde inloggegevens: bewaar gedownloade bestanden veilig. Foto’s staan in <code>data/uploads</code>; <code>npm run backup</code> kopieert alles.</p>
${d.backups.length ? `<div class="scroll"><table><thead><tr><th>Bestand</th><th>Gemaakt</th><th>Grootte</th><th>Downloaden</th></tr></thead><tbody>${d.backups.map((b) => `<tr><td><code>${esc(b.naam)}</code></td><td>${esc(when(b.tijd))}</td><td>${fmtBytes(b.grootte)}</td><td><form method="post" action="/admin/systeem/backup/${esc(b.naam)}" class="inline">${csrf}<input type="password" name="huidig" placeholder="jouw wachtwoord" autocomplete="current-password" aria-label="Jouw wachtwoord ter bevestiging" required><button class="small secondary" type="submit">Download</button></form></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nog geen back-ups.</p>'}
<details class="fold-lite"><summary>Hoe zet ik een back-up terug?</summary><ol class="steps-list"><li>Stop de website.</li><li>Voer uit in de projectmap: <code>node scripts/restore.js aethra-20260101-030000.db</code> (de naam uit de lijst, of een pad naar een gedownload bestand).</li><li>Het script controleert het bestand, zet de huidige database opzij als <code>aethra.db.before-restore-…</code> en plaatst de back-up.</li><li>Start de website weer.</li></ol></details></section>` });
}

/* ---- review flow ---- */
const REVIEW_PILL = { wacht: ['st-in_behandeling', 'Wacht op beoordeling'], goedgekeurd: ['ok', 'Goedgekeurd'], afgewezen: ['st-warn', 'Afgewezen'], ingetrokken: ['st-standaard', 'Ingetrokken'] };
const reviewPill = (st) => `<span class="pill ${REVIEW_PILL[st][0]}">${REVIEW_PILL[st][1]}</span>`;
function reviewsPage(ctx, { pending, recent, mine, canJudge }) {
	const row = (r) => `<li class="msg-row"><a class="msg-main" href="/admin/reviews/${r.id}"><span class="msg-top"><strong>${esc(r.label)}</strong><span class="meta"> · voorgesteld door ${esc(r.naam_ingediend || 'onbekend')}</span></span><span class="msg-snip">${esc(r.samenvatting)}</span></a><span class="msg-side">${reviewPill(r.status)}<time class="meta" title="${esc(when(r.ingediend_op))}">${esc(relTime(r.ingediend_op))}</time></span></li>`;
	const list = (items, empty) => (items.length ? `<ul class="msglist">${items.map(row).join('')}</ul>` : `<p class="hint pad">${esc(empty)}</p>`);
	return shell(ctx, { title: canJudge ? 'Te beoordelen' : 'Mijn voorstellen', active: 'reviews', body: `<div class="page-head"><div><h1>${canJudge ? 'Te beoordelen' : 'Mijn voorstellen'}</h1><p class="hint">${canJudge ? 'Voorstellen van redacteuren. Goedkeuren publiceert direct, met dezelfde controles als anders. Afwijzen kan met een opmerking.' : 'Wat je ter beoordeling hebt ingediend. Een editor of beheerder publiceert het of geeft je een opmerking.'}</p></div></div>
${canJudge ? `<section class="card flush"><h2 class="pad">Wacht op beoordeling (${pending.length})</h2>${list(pending, 'Niets te beoordelen.')}</section><section class="card flush"><h2 class="pad">Recent behandeld</h2>${list(recent, 'Nog niets behandeld.')}</section>` : `<section class="card flush">${list(mine, 'Je hebt nog niets ingediend. Gebruik “Ter beoordeling indienen” in een editor.')}</section>`}` });
}
function reviewPage(ctx, { r, changes, canJudge }) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const open = r.status === 'wacht';
	const diff = changes.length ? changes.map((c) => `<section class="card"><h3>${esc(c.taal.toUpperCase())}: <code>${esc(c.veld)}</code></h3><div class="cmp"><div><span class="label-sm">Nu live</span><div class="cmp-box old">${c.oud ? esc(c.oud).replace(/\n/g, '<br>') : '<em>leeg</em>'}</div></div><div><span class="label-sm">Voorstel</span><div class="cmp-box new">${c.nieuw ? esc(c.nieuw).replace(/\n/g, '<br>') : '<em>leeg</em>'}</div></div></div></section>`).join('') : '<section class="card"><p class="hint">Er zijn geen tekstverschillen met wat nu live staat.</p></section>';
	return shell(ctx, { title: 'Voorstel', active: 'reviews', body: `<p class="crumb"><a href="/admin/reviews">← Alle voorstellen</a></p>
<div class="page-head"><div><h1>Voorstel voor ${esc(r.label)}</h1><p class="hint">Door ${esc(r.naam_ingediend || 'onbekend')} · ${esc(when(r.ingediend_op))} · ${esc(r.samenvatting)}</p></div>${reviewPill(r.status)}</div>
${r.opmerking ? `<section class="card"><h2>Opmerking van de beoordelaar</h2><p>${esc(r.opmerking)}</p></section>` : ''}
${diff}
${open && canJudge ? `<section class="card"><h2>Beoordelen</h2>
<form method="post" action="/admin/reviews/${r.id}/goedkeuren">${csrf}<label class="chk"><input type="checkbox" name="force" value="1"> Toch publiceren als er intussen iets anders is gewijzigd (die wijziging wordt vervangen)</label><div class="row"><label for="ov">Reden bij waarschuwingen (alleen nodig als de controle om een reden vraagt)</label><input id="ov" name="override_reden" maxlength="300"></div><button type="submit">Goedkeuren en publiceren</button></form>
<form method="post" action="/admin/reviews/${r.id}/afwijzen" class="dz">${csrf}<div class="row"><label for="op">Waarom wijs je dit af?</label><textarea id="op" name="opmerking" rows="3" maxlength="1000" required></textarea></div><button type="submit" class="danger small">Afwijzen</button></form></section>` : ''}
${open && !canJudge ? `<form method="post" action="/admin/reviews/${r.id}/intrekken" data-confirm="Dit voorstel intrekken?">${csrf}<button type="submit" class="secondary small">Voorstel intrekken</button></form>` : ''}` });
}

/* ---- trash, translations, planning, preview links ---- */
function trashPage(ctx, { pages, media: files, canRestore }) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const isAdmin = ctx.session.user.rol === 'beheerder';
	const left = (iso) => Math.max(0, 30 - Math.floor((Date.now() - Date.parse(iso)) / 86400000));
	const actions = (kind, id) => (canRestore ? `<form method="post" action="/admin/prullenbak/${kind}/${id}/terugzetten" class="inline">${csrf}<button class="small secondary" type="submit">Terugzetten</button></form>${isAdmin ? `<form method="post" action="/admin/prullenbak/${kind}/${id}/verwijderen" class="inline" data-confirm="Definitief verwijderen? Dit kan niet worden teruggedraaid.">${csrf}<button class="small danger" type="submit">Definitief verwijderen</button></form>` : ''}` : '');
	const pageRows = pages.map((p) => `<li class="msg-row"><span class="msg-main"><span class="msg-top"><strong>${esc(p.titel)}</strong><span class="meta"> · ${esc(TEMPLATES[p.sjabloon] ? TEMPLATES[p.sjabloon].label : p.sjabloon)}</span></span><span class="msg-snip">Verwijderd ${esc(when(p.verwijderd_op))}, nog ${left(p.verwijderd_op)} dagen te herstellen</span></span><span class="msg-side">${actions('pagina', p.id)}</span></li>`).join('');
	const mediaRows = files.map((m) => `<li class="msg-row"><span class="msg-main"><span class="msg-top"><strong>${esc(m.alt.en || m.bestand)}</strong><span class="meta"> · ${m.breedte}×${m.hoogte}</span></span><span class="msg-snip">Verwijderd ${esc(when(m.verwijderd_op))}, nog ${left(m.verwijderd_op)} dagen te herstellen</span></span><span class="msg-side">${actions('media', m.id)}</span></li>`).join('');
	return shell(ctx, { title: 'Prullenbak', active: 'prullenbak', body: `<div class="page-head"><div><h1>Prullenbak</h1><p class="hint">Verwijderde pagina’s en foto’s blijven 30 dagen bewaard en kunnen worden teruggezet. Daarna verdwijnen ze definitief.${canRestore ? '' : ' Terugzetten kan een editor of beheerder.'}</p></div></div>
<section class="card flush"><h2 class="pad">Pagina’s (${pages.length})</h2>${pages.length ? `<ul class="msglist">${pageRows}</ul>` : '<p class="hint pad">Geen verwijderde pagina’s.</p>'}</section>
<section class="card flush"><h2 class="pad">Foto’s (${files.length})</h2>${files.length ? `<ul class="msglist">${mediaRows}</ul>` : '<p class="hint pad">Geen verwijderde foto’s.</p>'}</section>` });
}
function translationsPage(ctx, { rows, totals }) {
	const label = { nagekeken: 'nagekeken', eerste_versie: 'eerste versie', standaard: 'standaardtekst', leeg: 'leeg' };
	const cls = { nagekeken: 'ok', eerste_versie: 'st-in_behandeling', standaard: 'st-standaard', leeg: 'st-warn' };
	const cellHtml = (c) => `<span class="pill ${cls[c.state]}">${label[c.state]}</span>${c.outdated ? ` <span class="pill st-warn" title="De Engelse tekst is later gewijzigd dan deze vertaling">${c.outdated} verouderd</span>` : ''}`;
	const kinds = [['tekst', 'Teksten van de site'], ['privacy', 'Privacyverklaring'], ['pagina', 'Eigen pagina’s']];
	const body = kinds.map(([k, title]) => { const items = rows.filter((r) => r.kind === k); return items.length ? `<section class="card flush"><h2 class="pad">${title}</h2><div class="scroll"><table data-sortable><thead><tr><th>Onderdeel</th>${LANGS.map((l) => `<th>${esc(LANG_NAMES[l])}</th>`).join('')}</tr></thead><tbody>${items.map((r) => `<tr><th scope="row"><a href="${esc(r.href)}">${esc(r.label)}</a></th>${LANGS.map((l) => `<td>${cellHtml(r.cells[l])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : ''; }).join('');
	return shell(ctx, { title: 'Vertalingen', active: 'vertalingen', body: `<div class="page-head"><div><h1>Vertalingen</h1><p class="hint">Per onderdeel de stand van elke taal. “Verouderd” betekent dat de Engelse tekst is aangepast nadat de vertaling is geschreven of nagekeken. “Standaardtekst” is de tekst die met de site meekomt. Laat vertalingen altijd nakijken door een moedertaalspreker.</p></div></div>
<div class="rolecards">${LANGS.map((l) => `<div class="card mini"><strong>${esc(LANG_NAMES[l])}</strong><span class="meta">${totals[l].nagekeken} nagekeken · ${totals[l].open} open · ${totals[l].outdated} met verouderde delen</span></div>`).join('')}</div>${body}` });
}
function planningPage(ctx, { items, canPlan }) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const state = { wacht: ['st-in_behandeling', 'Gepland'], klaar: ['ok', 'Uitgevoerd'], mislukt: ['st-warn', 'Mislukt'], geannuleerd: ['st-standaard', 'Geannuleerd'] };
	const what = (r) => `${r.actie === 'publiceren' ? 'Publiceren' : 'Offline halen'}: ${r.soort === 'pagina' ? `pagina ${r.ref}` : r.ref === 'privacy' ? 'privacyverklaring' : `tekst ${r.ref}`}`;
	const row = (r) => `<li class="msg-row"><span class="msg-main"><span class="msg-top"><strong>${esc(what(r))}</strong><span class="meta"> · gepland door ${esc(r.naam || 'onbekend')}</span></span><span class="msg-snip">${esc(new Date(r.wanneer).toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short' }))}${r.fout ? ` · ${esc(r.fout)}` : ''}</span></span><span class="msg-side"><span class="pill ${state[r.status][0]}">${state[r.status][1]}</span>${r.status === 'wacht' && canPlan ? `<form method="post" action="/admin/planning/${r.id}/annuleren" class="inline">${csrf}<button class="small secondary" type="submit">Annuleren</button></form>` : ''}</span></li>`;
	const up = items.filter((r) => r.status === 'wacht');
	const past = items.filter((r) => r.status !== 'wacht');
	return shell(ctx, { title: 'Planning', active: 'planning', body: `<div class="page-head"><div><h1>Planning</h1><p class="hint">Gepland publiceren of offline halen. Plannen doe je in de editor met de klok-knop. Op het gekozen moment gaat het door dezelfde controles als een gewone publicatie; lukt dat niet, dan krijg je een mail.</p></div></div>
<section class="card flush"><h2 class="pad">Komende acties (${up.length})</h2>${up.length ? `<ul class="msglist">${up.map(row).join('')}</ul>` : '<p class="hint pad">Er is niets gepland.</p>'}</section>
<section class="card flush"><h2 class="pad">Eerder</h2>${past.length ? `<ul class="msglist">${past.map(row).join('')}</ul>` : '<p class="hint pad">Nog niets uitgevoerd.</p>'}</section>` });
}
function shareLinksPage(ctx, { links, canRevoke }) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const rows = links.map((l) => `<li class="msg-row"><span class="msg-main"><span class="msg-top"><strong>${esc(l.object)}</strong><span class="meta"> · ${esc(LANG_NAMES[l.taal] || l.taal)} · gemaakt door ${esc(l.naam || 'onbekend')}</span></span><span class="msg-snip">Verloopt ${esc(when(new Date(l.verloopt).toISOString()))}</span></span><span class="msg-side">${canRevoke ? `<form method="post" action="/admin/voorbeeldlinks/${esc(l.token_hash)}/intrekken" class="inline" data-confirm="Deze link intrekken?">${csrf}<button class="small danger" type="submit">Intrekken</button></form>` : ''}</span></li>`).join('');
	return shell(ctx, { title: 'Voorbeeldlinks', active: 'paginas', body: `<div class="page-head"><div><h1>Voorbeeldlinks</h1><p class="hint">Een geheime link naar een concept, voor iemand zonder account. Iedereen met de link kan het voorbeeld lezen tot hij verloopt of wordt ingetrokken. Maken doe je in de editor met de deel-knop.</p></div></div><section class="card flush">${links.length ? `<ul class="msglist">${rows}</ul>` : '<p class="hint pad">Er zijn geen actieve voorbeeldlinks.</p>'}</section>` });
}
