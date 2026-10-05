'use strict';
/** Shared pieces of the admin views: icons, the page shell, small formatting helpers. */
const { esc, asset } = require('../../views');
const { ROLES: CONTACT_ROLES } = require('../../fields');
const content = require('../content');
const media = require('../media');

const nf = (n) => new Intl.NumberFormat('nl-NL').format(n);
const when = (iso) => { try { return new Date(iso).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return String(iso || ''); } };
const json = (o) => esc(JSON.stringify(o));

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
	link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
	reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>',
	help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.1"/>',
	cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
	server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
	eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const sprite = `<svg class="sprite" aria-hidden="true" focusable="false">${Object.entries(ICON_PATHS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')}</svg>`;
const icon = (name, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

const HELP = require('../help');
const contextHelp = (key) => (HELP.CONTEXT[key] ? `<details class="help" data-help="${esc(key)}"><summary>${icon('info')} Uitleg bij dit scherm</summary><p>${esc(HELP.CONTEXT[key])} <a href="/admin/help">Alle uitleg</a></p></details>` : '');
function shell(ctx, { title, active = '', body, wide = false, script = true, scripts = [] }) {
	const { session, nonce, badges = {} } = ctx;
	const head = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><meta name="color-scheme" content="light dark"><link rel="icon" href="/img/favicon.svg" type="image/svg+xml"><title>${esc(title)} | Aethra beheer</title>
<script nonce="${esc(nonce)}">try{var t=localStorage.getItem("aethra_theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
<link rel="stylesheet" href="${asset('/css/admin.css')}"></head>`;
	const flash = ctx.flash ? `<p class="flash ${ctx.flash.ok ? 'ok' : 'err'}" role="${ctx.flash.ok ? 'status' : 'alert'}">${icon(ctx.flash.ok ? 'check' : 'alert')}<span>${esc(ctx.flash.text)}</span></p>` : '';
	if (!session) {
		return `${head}
<body>${sprite}<div class="auth"><div><div class="brand"><span class="logo">${icon('orbit')}</span><span>AETHRA<small>Beheer van de website</small></span></div>${flash}${body}</div></div>${scripts.map((f) => `<script src="${asset(f)}" nonce="${esc(nonce)}" defer></script>`).join('')}</body></html>`;
	}
	const item = (key, href, label, ic, badge) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${key === 'berichten' || key === 'reviews' ? `<span class="badge" data-badge="${key}"${badge ? '' : ' hidden'}>${badge || ''}</span>` : ''}</a>`;
	const groups = [
		['Inhoud', [['dash', '/admin', 'Dashboard', 'dash'], ['paginas', '/admin/paginas', 'Pagina’s en teksten', 'pages'], ['media', '/admin/media', 'Media', 'media'], ['reviews', '/admin/reviews', session.user.rol === 'redacteur' ? 'Mijn voorstellen' : 'Te beoordelen', 'check', badges.reviews], ['planning', '/admin/planning', 'Planning', 'clock'], ['vertalingen', '/admin/vertalingen', 'Vertalingen', 'globe'], ['prullenbak', '/admin/prullenbak', 'Prullenbak', 'trash']]],
		['Inbox', [['berichten', '/admin/berichten', 'Berichten', 'mail', badges.berichten], ['sjablonen', '/admin/sjablonen', 'Antwoordsjablonen', 'reply'], ['wachtrij', '/admin/wachtrij', 'Mailwachtrij', 'send']]],
		['Site', [['menu', '/admin/menu', 'Menu', 'menu'], ['seo', '/admin/seo', 'Zoekmachines', 'search'], ['links', '/admin/links', 'Linkcontrole', 'link'], ['redirects', '/admin/redirects', 'Redirects', 'redirect'], ['stats', '/admin/stats', 'Statistieken', 'stats']]],
		...(session.user.rol === 'beheerder' ? [['Beheer', [['gebruikers', '/admin/gebruikers', 'Gebruikers', 'users'], ['instellingen', '/admin/instellingen', 'Instellingen', 'cog'], ['regels', '/admin/regels', 'Redactionele regels', 'shield'], ['systeem', '/admin/systeem', 'Systeem', 'server'], ['beveiliging', '/admin/beveiligingsrapport', 'Beveiliging', 'lock'], ['audit', '/admin/audit', 'Auditlog', 'shield']]]] : []),
	];
	const nav = groups.map(([name, items]) => `<div class="nav-group"><h2>${name}</h2>${items.map((i) => item(...i)).join('')}</div>`).join('');
	return `${head}
<body data-csrf="${esc(session.csrf)}" data-user="${esc(session.user.naam)}" data-rol="${esc(session.user.rol)}">${sprite}
<a class="skip" href="#main">Naar de inhoud</a>
<div class="app">
<aside class="side" id="side" data-open="false" aria-label="Beheer">
<a class="brand" href="/admin"><span class="logo">${icon('orbit')}</span><span>AETHRA<small>Beheer van de website</small></span></a>
<button type="button" class="searchbtn" id="searchbtn" aria-label="Zoeken in het beheer (Ctrl K)">${icon('search')}<span>Zoeken…</span><kbd>Ctrl K</kbd></button>
<nav class="nav" aria-label="Hoofdmenu">${nav}</nav>
<div class="who nav"><strong>${esc(session.user.naam)}</strong><span>${esc(session.user.rol)}</span>
<a href="/admin/account"${active === 'account' ? ' aria-current="page"' : ''}>${icon('user')}<span>Mijn account</span></a>
<a href="/admin/help"${active === 'help' ? ' aria-current="page"' : ''}>${icon('help')}<span>Help en sneltoetsen</span></a>
<button type="button" id="themebtn" class="navbtn" aria-label="Thema wisselen">${icon('sun')}<span>Thema: automatisch</span></button>
<form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><button type="submit">${icon('logout')}<span>Uitloggen</span></button></form></div>
</aside>
<div class="mainwrap">
<header class="topbar"><button type="button" id="navtoggle" aria-controls="side" aria-expanded="false" aria-label="Menu openen">${icon('menu')}</button><strong>AETHRA</strong></header>
${ctx.mfa ? `<p class="flash err" role="status">${icon('lock')}<span>Tweestapsverificatie is verplicht voor jouw rol. Je hebt nog ${ctx.mfa.daysLeft} dag${ctx.mfa.daysLeft === 1 ? '' : 'en'} om het in te stellen. <a href="/admin/account">Nu instellen</a></span></p>` : ''}${ctx.maintenance ? `<p class="flash err" role="status">${icon('alert')}<span>De onderhoudsmodus staat aan: bezoekers zien een onderhoudspagina. <a href="/admin/instellingen">Uitzetten</a></span></p>` : ''}
<p id="alarm" class="flash err" role="alert" hidden></p>
<main id="main"${wide ? ' class="wide"' : ''}>${flash}${wide ? '' : contextHelp(active)}${body}</main>
</div></div>
<span id="live" class="sr" role="status" aria-atomic="true"></span><div id="toasts" role="status" aria-live="polite"></div>
${script ? `<script src="${asset('/js/admin.js')}" nonce="${esc(nonce)}" defer></script>` : ''}${scripts.map((f) => `<script src="${asset(f)}" nonce="${esc(nonce)}" defer></script>`).join('')}
</body></html>`;
}

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
/* statistics (same figures as before) */
const table = (headers, rows, empty) => (!rows.length ? `<p class="hint">${esc(empty)}</p>` : `<div class="scroll"><table><thead><tr>${headers.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="num">${esc(typeof c === 'number' ? nf(c) : c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`);
const errorPage = (ctx, status, text) => shell({ ...ctx, session: ctx.session || null }, { title: 'Fout', body: `<section class="card narrow"><h1>${esc(String(status))}</h1><p>${esc(text)}</p><p><a href="/admin">Terug naar het begin</a></p></section>`, script: false });


module.exports = { nf, when, json, STATUS_LABEL, ICON_PATHS, sprite, icon, HELP, contextHelp, shell, initials, avatar, relTime, table, errorPage, CONTACT_ROLES };
