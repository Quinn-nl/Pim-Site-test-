'use strict';
/** HTML of the admin (server-rendered, Dutch). Interactivity is in public/js/admin.js. Every value is escaped. */
const { GROUPS, IMAGE_SLOTS, ROLES: CONTACT_ROLES } = require('../fields');
const { LANGS, LANG_NAMES } = require('../i18n');
const { esc, asset } = require('../views');
const { qrSvg } = require('../qr');
const { SECTIONS, TEMPLATES } = require('./templates');
const content = require('./content');
const pagesApi = require('./pages');
const media = require('./media');

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

function shell(ctx, { title, active = '', body, wide = false, script = true }) {
	const { session, nonce, badges = {} } = ctx;
	const tab = (href, label, key, badge) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}${badge ? `<span class="badge" data-badge="${esc(key)}">${badge}</span>` : `<span class="badge" data-badge="${esc(key)}" hidden></span>`}</a>`;
	const nav = session ? `
<nav aria-label="Beheer">${tab('/admin', 'Dashboard', 'dash')}${tab('/admin/paginas', 'Pagina’s', 'paginas')}${tab('/admin/media', 'Media', 'media')}${tab('/admin/berichten', 'Berichten', 'berichten', badges.berichten || '')}${tab('/admin/redirects', 'Redirects', 'redirects')}${tab('/admin/stats', 'Statistieken', 'stats')}${session.user.rol === 'beheerder' ? `${tab('/admin/gebruikers', 'Gebruikers', 'gebruikers')}${tab('/admin/audit', 'Auditlog', 'audit')}` : ''}${tab('/admin/account', esc(session.user.naam), 'account')}
<form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><button class="link" type="submit">Uitloggen</button></form></nav>` : '';
	return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><link rel="icon" href="/img/favicon.svg" type="image/svg+xml"><title>${esc(title)} | Aethra beheer</title>
<link rel="stylesheet" href="${asset('/css/design-tokens.css')}"><link rel="stylesheet" href="${asset('/css/admin.css')}"></head>
<body data-csrf="${session ? esc(session.csrf) : ''}" data-user="${session ? esc(session.user.naam) : ''}" data-rol="${session ? esc(session.user.rol) : ''}">
<header class="bar"><strong>Aethra beheer</strong>${nav}</header>
<p id="alarm" class="flash err" role="alert" hidden></p>
<main${wide ? ' class="wide"' : ''}>${ctx.flash ? `<p class="flash ${ctx.flash.ok ? 'ok' : 'err'}" role="${ctx.flash.ok ? 'status' : 'alert'}">${esc(ctx.flash.text)}</p>` : ''}${body}</main>
${session && script ? `<script src="${asset('/js/admin.js')}" nonce="${esc(nonce)}" defer></script>` : ''}
</body></html>`;
}

/* ---- sign in ---- */
function loginPage(ctx, { flash, setup } = {}) {
	return shell({ ...ctx, session: null, flash }, { title: 'Inloggen', body: `<section class="card narrow"><h1>Inloggen</h1>
${setup ? '<p class="err-text">Er is nog geen account. Maak het eerste account op de server met <code>npm run user:create -- --email=jij@voorbeeld.nl --naam="Jouw naam"</code>.</p>' : ''}
<form method="post" action="/admin/login"><div class="row"><label for="em">E-mailadres</label><input id="em" name="email" type="email" autocomplete="username" required autofocus></div><div class="row"><label for="pw">Wachtwoord</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div><button type="submit">Inloggen</button></form></section>`, script: false });
}
function codePage(ctx, ticket, flash) {
	return shell({ ...ctx, session: null, flash }, { title: 'Verificatie', body: `<section class="card narrow"><h1>Tweestapsverificatie</h1>
<p class="hint">Vul de 6-cijferige code uit je authenticator-app in, of een van je herstelcodes.</p>
<form method="post" action="/admin/login/code"><input type="hidden" name="ticket" value="${esc(ticket)}"><div class="row"><label for="code">Code</label><input id="code" name="code" type="text" autocomplete="one-time-code" autocapitalize="none" required autofocus></div><button type="submit">Bevestigen</button></form></section>`, script: false });
}

/* ---- dashboard ---- */
function dashboardPage(ctx, d) {
	const card = (title, inner) => `<section class="card"><h2>${title}</h2>${inner}</section>`;
	const warn = d.gezondheid.length ? `<ul class="plain">${d.gezondheid.map((w) => `<li class="${w.ernst === 'info' ? 'hint' : ''}">${esc(w.bericht)}</li>`).join('')}</ul>` : '<p class="hint">Geen waarschuwingen.</p>';
	const locks = Object.keys(d.locks).length ? `<ul class="plain">${Object.entries(d.locks).map(([o, n]) => `<li><strong>${esc(n)}</strong> bewerkt ${esc(o)}</li>`).join('')}</ul>` : '<p class="hint">Niemand is aan het bewerken.</p>';
	const recent = d.recent.length ? `<ul class="plain">${d.recent.map((a) => `<li><span class="meta">${esc(when(a.timestamp))}</span> ${esc(a.gebruiker || 'systeem')}: ${esc(a.actie)} <code>${esc(a.entiteit)}</code></li>`).join('')}</ul>` : '<p class="hint">Nog geen wijzigingen.</p>';
	return shell(ctx, { title: 'Dashboard', active: 'dash', body: `<h1>Dashboard</h1>
<div class="kpis">
<a class="kpi kpi-link" href="/admin/berichten?status=nieuw"><span class="kpi-v" data-kpi="berichten">${nf(d.nieuw)}</span><span>nieuwe berichten</span></a>
<a class="kpi kpi-link" href="/admin/wachtrij"><span class="kpi-v" data-kpi="mail">${nf(d.mailMislukt)}</span><span>mails die vastlopen</span></a>
<a class="kpi kpi-link" href="/admin/paginas"><span class="kpi-v">${nf(d.concepten)}</span><span>pagina’s in concept</span></a>
<div class="kpi"><span class="kpi-v">${nf(d.publiek)}</span><span>extra pagina’s live</span></div>
</div>
<div class="cols">${card('Aandachtspunten', warn)}${card('Wie is aan het bewerken', locks)}</div>
${card('Laatste wijzigingen', recent)}
<p class="hint">Database: ${d.dbOk ? 'in orde' : '<strong>niet bereikbaar: de site toont opgeslagen pagina’s, wijzigen kan tijdelijk niet</strong>'} · cache: ${nf(d.cache.size)} pagina’s · versie ${esc(d.versie)}</p>` });
}

/* ---- pages overview ---- */
function pagesPage(ctx, { extra, locks }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const groups = {};
	for (const id of ORDER) (groups[PLACE[id].sectie] = groups[PLACE[id].sectie] || []).push(id);
	const lockNote = (o) => (locks[o] ? ` <span class="lock" title="Wordt bewerkt">🔒 ${esc(locks[o])}</span>` : '');
	const fixed = Object.entries(groups).map(([sectie, ids]) => `<section class="card"><h2>${esc(sectie)}</h2><ul class="plain">${ids.map((id) => `<li><a href="/admin/tekst/${esc(id)}">${esc(PLACE[id].label)}</a>${lockNote(`tekst:${id}`)}</li>`).join('')}${sectie === 'Extra pagina’s' ? `<li><a href="/admin/privacy">Privacyverklaring</a>${lockNote('privacy')}</li>` : ''}</ul></section>`).join('');
	const rows = extra.length ? `<div class="scroll"><table><thead><tr><th>Titel</th><th>Sjabloon</th><th>Talen</th><th>Status</th><th></th></tr></thead><tbody>${extra.map((p) => {
		const talen = Object.keys(p.titels);
		const titel = p.titels.en || p.titels.nl || Object.values(p.titels)[0] || '(zonder titel)';
		return `<tr><td><a href="/admin/paginas/${p.id}">${esc(titel)}</a>${lockNote(`pagina:${p.id}`)}</td><td>${esc(TEMPLATES[p.sjabloon] ? TEMPLATES[p.sjabloon].label : p.sjabloon)}</td><td>${talen.map((l) => l.toUpperCase()).join(' ') || '-'}</td><td><span class="pill ${p.status === 'gepubliceerd' ? 'ok' : ''}">${p.status === 'gepubliceerd' ? 'live' : 'concept'}</span></td><td class="num"><a href="/admin/historie?object=${encodeURIComponent(`pagina:${p.id}`)}">geschiedenis</a></td></tr>`;
	}).join('')}</tbody></table></div>` : '<p class="hint">Nog geen extra pagina’s.</p>';
	return shell(ctx, { title: 'Pagina’s', active: 'paginas', body: `<h1>Pagina’s en teksten</h1>
<p class="hint">Links staan alle vaste teksten van de website per pagina. Hieronder staan de extra pagina’s die je zelf maakt met een sjabloon.</p>
<section class="card"><h2>Extra pagina’s</h2>${rows}${canWrite ? '<p><a class="btn-link" href="/admin/paginas/nieuw">Nieuwe pagina maken</a></p>' : ''}</section>
<div class="cols3">${fixed}</div>` });
}
function newPagePage(ctx) {
	return shell(ctx, { title: 'Nieuwe pagina', active: 'paginas', body: `<h1>Nieuwe pagina</h1><p class="hint">Kies eerst een sjabloon. Het sjabloon bepaalt welke bouwstenen de pagina heeft en welke volgorde is toegestaan.</p>
<form method="post" action="/admin/paginas/nieuw"><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">
<div class="cols3">${Object.entries(TEMPLATES).map(([id, t], i) => `<label class="card tpl"><input type="radio" name="sjabloon" value="${esc(id)}"${i === 0 ? ' checked' : ''}> <strong>${esc(t.label)}</strong><span class="hint">${esc(t.uitleg)}</span><span class="meta">${t.standaard.map((x) => esc(SECTIONS[x].label)).join(' → ')}</span></label>`).join('')}</div>
<button type="submit">Pagina maken</button></form>` });
}

/* ---- editors ---- */
const maxLen = (type) => (type === 'textarea' ? 2000 : type === 'rich' ? 50000 : 300);
const statusPill = (st) => (st ? `<span class="pill st-${esc(st)}">${esc(STATUS_LABEL[st] || st)}</span>` : '');

function control(f, lang, value, status) {
	const common = `data-lang="${lang}" data-key="${esc(f.key)}" lang="${lang}" aria-label="${esc(f.label)} (${esc(LANG_NAMES[lang])})"`;
	if (f.type === 'rich') return `<div class="rte" data-lang="${lang}" data-key="${esc(f.key)}"><div class="rte-bar" role="toolbar" aria-label="Opmaak"><button type="button" data-cmd="bold" title="Vet"><b>B</b></button><button type="button" data-cmd="italic" title="Cursief"><i>I</i></button><button type="button" data-cmd="h2">H2</button><button type="button" data-cmd="h3">H3</button><button type="button" data-cmd="ul">• Lijst</button><button type="button" data-cmd="ol">1. Lijst</button><button type="button" data-cmd="quote">“ ”</button><button type="button" data-cmd="link">Link</button><button type="button" data-cmd="clear">Wis opmaak</button></div><div class="rte-area" contenteditable="true" role="textbox" aria-multiline="true" ${common}>${value || ''}</div></div>`;
	if (f.type === 'textarea') return `<textarea ${common} rows="3" maxlength="${maxLen('textarea')}">${esc(value)}</textarea>`;
	if (f.type === 'media') return `<select ${common} data-media="1"><option value="">(geen foto)</option>${media.list().map((m) => `<option value="${m.id}"${String(value) === String(m.id) ? ' selected' : ''}>#${m.id} ${esc(m.alt.en || m.bestand)}</option>`).join('')}</select>`;
	return `<input ${common} type="${f.type === 'url' ? 'text' : 'text'}" maxlength="${maxLen(f.type)}" value="${esc(value)}"${f.type === 'url' ? ' inputmode="url" placeholder="https://…"' : ''}>`;
}

/** One field in all languages side by side. */
const rowStatus = (statuses, l, key) => { const r = statuses && statuses[l] && statuses[l][key]; return r ? (r.versie_nummer === 0 ? 'standaard' : r.status) : ''; };
function fieldRow(f, values, statuses, { hidden = false } = {}) {
	return `<div class="frow${hidden ? ' hidden' : ''}" data-fieldkey="${esc(f.key)}"><div class="flabel">${esc(f.label)}</div><div class="fcols">${LANGS.map((l) => `<div class="fcol" data-col="${l}"><span class="lang-tag">${l.toUpperCase()}${statusPill(rowStatus(statuses, l, f.key))}</span>${control(f, l, (values[l] || {})[f.key], statuses)}</div>`).join('')}</div></div>`;
}

function langBar(object, canWrite) {
	return `<div class="langbar" role="group" aria-label="Talen"><span class="hint">Toon:</span>${LANGS.map((l) => `<label class="chk"><input type="checkbox" data-showlang="${l}" checked> ${esc(LANG_NAMES[l])}</label>`).join('')}
${canWrite && object ? `<span class="spacer"></span><span class="hint">Nagekeken door een moedertaalspreker:</span>${LANGS.filter((l) => l !== 'en').map((l) => `<button type="button" class="secondary small" data-reviewed="${l}">${l.toUpperCase()} nagekeken</button>`).join('')}` : ''}</div>`;
}

function previewPane(defaultPath, kind) {
	return `<aside class="preview-pane" aria-label="Voorbeeld"><div class="pv-bar">
<label>Taal <select data-pv="lang">${LANGS.map((l) => `<option value="${l}">${esc(LANG_NAMES[l])}</option>`).join('')}</select></label>
${kind === 'tekst' ? `<label>Pagina <select data-pv="path">${PREVIEW_PAGES.map(([p, n]) => `<option value="${esc(p)}"${p === defaultPath ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : `<input type="hidden" data-pv="path" value="${esc(defaultPath)}">`}
<label>Breedte <select data-pv="width"><option value="100%">Bureaublad</option><option value="768px">Tablet</option><option value="390px">Telefoon</option></select></label>
</div><div class="pv-frame"><iframe title="Voorbeeld van de pagina" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" name="pv" id="pv"></iframe></div>
<form id="pvform" method="post" action="/admin/preview" target="pv" hidden><input type="hidden" name="csrf"><input type="hidden" name="payload"></form></aside>`;
}

function editorHead(ctx, { titel, uitleg, object, versie, kind, id, draft, locked, canWrite, extraButtons = '', status = '' }) {
	return `<div class="ed-head"><div><h1>${esc(titel)} ${status}</h1><p class="hint">${esc(uitleg)}</p></div>
<div class="ed-actions"><a class="secondary btn-link" href="/admin/historie?object=${encodeURIComponent(object)}">Geschiedenis</a>${canWrite ? extraButtons : ''}</div></div>
<div id="lockbanner" class="flash err" role="status" hidden></div>
<div id="draftbanner" class="flash" role="status" hidden>Er staat een niet-opgeslagen concept van <span id="draftwhen"></span>. <button type="button" class="secondary small" id="draftrestore">Terugzetten</button> <button type="button" class="secondary small" id="draftdiscard">Weggooien</button></div>
<div id="result" role="status" aria-live="polite"></div>`;
}

function textEditorPage(ctx, groupId, { values, statuses, versie, draft, locked }) {
	const group = GROUPS.find((g) => g.id === groupId);
	const place = PLACE[groupId];
	const canWrite = ctx.session.user.rol !== 'lezer';
	const object = content.textObject(groupId);
	const rows = group.fields.map((f) => fieldRow({ key: f.key, label: f.label, type: f.type }, Object.fromEntries(LANGS.map((l) => [l, values[l]])), statuses)).join('');
	return shell(ctx, { title: place.label, active: 'paginas', wide: true, body: `${editorHead(ctx, { titel: place.label, uitleg: place.uitleg, object, versie, kind: 'tekst', id: groupId, draft, locked, canWrite, extraButtons: '<button type="button" id="btn-save">Publiceren</button>' })}
${langBar(object, canWrite)}
<div class="ed-grid"><form id="editor" class="ed" data-kind="tekst" data-id="${esc(groupId)}" data-object="${esc(object)}" data-version="${versie}" data-readonly="${canWrite ? '0' : '1'}" data-draft="${json(draft || null)}" onsubmit="return false">${rows}</form>${previewPane(place.path, 'tekst')}</div>` });
}
function privacyEditorPage(ctx, { values, versie, draft }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const f = { key: 'text', label: 'Privacyverklaring (regel met # = kop, lege regel = nieuwe alinea)', type: 'textarea' };
	const rows = `<div class="frow"><div class="flabel">${esc(f.label)}</div><div class="fcols">${LANGS.map((l) => `<div class="fcol" data-col="${l}"><span class="lang-tag">${l.toUpperCase()}</span><textarea data-lang="${l}" data-key="text" lang="${l}" rows="22" maxlength="20000" aria-label="Privacyverklaring (${esc(LANG_NAMES[l])})">${esc(values[l] || '')}</textarea></div>`).join('')}</div></div>`;
	return shell(ctx, { title: 'Privacyverklaring', active: 'paginas', wide: true, body: `${editorHead(ctx, { titel: 'Privacyverklaring', uitleg: 'Laat deze tekst controleren door een jurist. Vervang alles tussen [haken].', object: 'privacy', versie, kind: 'privacy', canWrite, extraButtons: '<button type="button" id="btn-save">Publiceren</button>' })}
${langBar('', false)}
<div class="ed-grid"><form id="editor" class="ed" data-kind="privacy" data-object="privacy" data-version="${versie}" data-readonly="${canWrite ? '0' : '1'}" data-draft="${json(draft || null)}" onsubmit="return false">${rows}</form>${previewPane('/privacy', 'privacy')}</div>` });
}

/** A section card for the page editor. */
function sectionCard(section, values, statuses, { template = false } = {}) {
	const def = SECTIONS[section.type];
	const id = section.id;
	const base = def.velden.map((f) => fieldRow({ key: `s.${id}.${f.key}`, label: f.label, type: f.type }, values, statuses)).join('');
	let itemsHtml = '';
	if (def.items) {
		const filled = (n) => LANGS.some((l) => def.items.velden.some((f) => ((values[l] || {})[`s.${id}.items.${n}.${f.key}`] || '').trim()));
		itemsHtml = `<div class="items" data-max="${def.items.max}">${Array.from({ length: def.items.max }, (_, i) => i + 1).map((n) => `<div class="item${filled(n) || n === 1 ? '' : ' hidden'}" data-item="${n}"><div class="item-head"><strong>${esc(def.items.label)} ${n}</strong><button type="button" class="secondary small" data-item-clear="${n}">Verwijderen</button></div>${def.items.velden.map((f) => fieldRow({ key: `s.${id}.items.${n}.${f.key}`, label: f.label, type: f.type }, values, statuses)).join('')}</div>`).join('')}<button type="button" class="secondary small" data-item-add>+ ${esc(def.items.label)} toevoegen</button></div>`;
	}
	return `<section class="sec card" data-sid="${esc(id)}" data-type="${esc(section.type)}"><div class="sec-head"><strong>${esc(def.label)}</strong><span class="spacer"></span>
<button type="button" class="secondary small" data-sec-up aria-label="Omhoog">↑</button><button type="button" class="secondary small" data-sec-down aria-label="Omlaag">↓</button><button type="button" class="secondary small" data-sec-remove>Verwijderen</button></div>${base}${itemsHtml}</section>`;
}

function pageEditorPage(ctx, id, p) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const tpl = TEMPLATES[p.meta.sjabloon];
	const object = pagesApi.object(id);
	const baseRows = pagesApi.BASE.map((f) => fieldRow(f, p.velden, p.status)).join('');
	const sections = p.meta.indeling.map((s) => sectionCard(s, p.velden, p.status)).join('');
	const addOptions = tpl.toegestaan.map((t) => `<option value="${esc(t)}">${esc(SECTIONS[t].label)}</option>`).join('');
	const templates = tpl.toegestaan.map((t) => `<template id="tpl-${esc(t)}">${sectionCard({ id: '__ID__', type: t }, {}, {})}</template>`).join('');
	const live = p.meta.status === 'gepubliceerd';
	const title = (p.velden.en && p.velden.en.titel) || (p.velden.nl && p.velden.nl.titel) || 'Nieuwe pagina';
	const buttons = live
		? '<button type="button" id="btn-save">Wijzigingen opslaan</button><button type="button" class="secondary" id="btn-unpublish">Offline halen</button>'
		: '<button type="button" class="secondary" id="btn-save">Opslaan als concept</button><button type="button" id="btn-publish">Publiceren</button>';
	return shell(ctx, { title, active: 'paginas', wide: true, body: `${editorHead(ctx, { titel: title, uitleg: `Sjabloon: ${tpl.label}. ${tpl.uitleg}`, object, versie: p.versie, kind: 'pagina', id, canWrite, extraButtons: buttons, status: `<span class="pill ${live ? 'ok' : ''}">${live ? 'live' : 'concept'}</span>` })}
${langBar(object, canWrite)}
<div class="ed-grid"><form id="editor" class="ed" data-kind="pagina" data-id="${id}" data-object="${esc(object)}" data-version="${p.versie}" data-status="${esc(p.meta.status)}" data-template="${esc(p.meta.sjabloon)}" data-readonly="${canWrite ? '0' : '1'}" data-draft="${json(p.draft || null)}" data-rules="${json({ toegestaan: tpl.toegestaan, verplicht: tpl.verplicht, max: tpl.max || {}, vrij: !!tpl.vrij })}" onsubmit="return false">
<section class="card"><h2>Pagina</h2>${baseRows}
<div class="opts"><label class="chk"><input type="checkbox" data-meta="in_footer"${p.meta.in_footer ? ' checked' : ''}> Link in de footer</label><label class="chk"><input type="checkbox" data-meta="indexeren"${p.meta.indexeren ? ' checked' : ''}> Zichtbaar voor zoekmachines</label><label class="chk">Volgorde <input type="number" data-meta="volgorde" min="0" max="9999" value="${p.meta.volgorde}" class="narrow-num"></label></div></section>
<div id="sections">${sections}</div>
${canWrite ? `<div class="card addbar"><label for="addtype">Bouwsteen toevoegen</label> <select id="addtype">${addOptions}</select> <button type="button" class="secondary" id="addsec">Toevoegen</button></div>` : ''}
</form>${previewPane(`/${(p.velden.en && p.velden.en.slug) || 'voorbeeld'}`, 'pagina')}</div>${templates}
${canWrite ? `<form method="post" action="/admin/paginas/${id}/verwijderen" class="card danger-zone" data-confirm="Deze pagina definitief verwijderen?"><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}"><button class="danger" type="submit">Pagina verwijderen</button></form>` : ''}` });
}

/* ---- history ---- */
function historyPage(ctx, { object, entries }) {
	const rows = entries.length ? `<div class="scroll"><table><thead><tr><th>Versie</th><th>Wanneer</th><th>Door</th><th>Reden</th><th></th></tr></thead><tbody>${entries.map((e) => `<tr><td>${e.versie_nummer}</td><td>${esc(when(e.tijdstip))}</td><td>${esc(e.gebruiker || 'systeem')}</td><td>${esc(e.reden || '')}</td><td class="num"><a href="/admin/historie/${e.id}">vergelijk</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nog geen eerdere versies.</p>';
	return shell(ctx, { title: 'Geschiedenis', active: 'paginas', body: `<h1>Geschiedenis</h1><p class="hint"><code>${esc(object)}</code>. Bij elke publicatie wordt de vorige staat bewaard.</p><section class="card">${rows}</section>` });
}
function diffPage(ctx, { entry, diff, object, huidigeVersie, kind, pageId }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const blocks = diff.length ? diff.map((d) => `<section class="card"><h2>${esc(d.taal.toUpperCase())}: <code>${esc(d.veld)}</code></h2><pre class="diff">${d.regels.map((r) => `<span class="d${r.t === '+' ? 'add' : r.t === '-' ? 'del' : 'eq'}">${r.t === '=' ? '  ' : r.t + ' '}${esc(r.tekst)}</span>`).join('\n')}</pre></section>`).join('') : '<p class="hint">Deze versie is gelijk aan de huidige.</p>';
	return shell(ctx, { title: 'Vergelijken', active: 'paginas', body: `<h1>Versie ${entry.versie_nummer} tegenover nu</h1><p class="hint"><code>${esc(object)}</code>, vastgelegd ${esc(when(entry.tijdstip))}. <span class="dadd">+ regels</span> staan er nu, <span class="ddel">- regels</span> stonden er toen.</p>
${canWrite ? `<form method="post" action="/admin/historie/${entry.id}/terugzetten" data-confirm="Deze versie terugzetten? De huidige staat blijft in de geschiedenis."><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}"><input type="hidden" name="basis" value="${huidigeVersie}"><button type="submit">Eén klik: terugzetten naar versie ${entry.versie_nummer}</button></form>` : ''}${blocks}
<p><a href="/admin/historie?object=${encodeURIComponent(object)}">← terug naar de geschiedenis</a></p>` });
}

/* ---- media ---- */
function mediaPage(ctx, { items, slots, enc }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const rightsLabel = { eigen: 'Eigen foto', gelicentieerd: 'Gelicentieerd', ai_sfeer: 'AI-sfeerbeeld (alleen als illustratie)' };
	const altInputs = (alt) => LANGS.map((l) => `<div class="row"><label for="alt-${l}">Omschrijving ${esc(LANG_NAMES[l])}${l === 'en' ? ' *' : ''}</label><input id="alt-${l}" name="alt_${l}" maxlength="200" lang="${l}" value="${esc((alt || {})[l] || '')}"${l === 'en' ? ' required' : ''}></div>`).join('');
	const upload = canWrite ? `<section class="card"><h2>Foto uploaden</h2><p class="hint">JPG, PNG of WebP, maximaal 5 MB. Locatiegegevens worden verwijderd. ${enc.webp || enc.avif ? `Er worden ook ${[enc.webp && 'WebP (1x en 2x)', enc.avif && 'AVIF'].filter(Boolean).join(' en ')}-versies gemaakt.` : 'Voor WebP en AVIF zijn <code>cwebp</code> en <code>avifenc</code> nodig op de server; zonder blijft het origineel in gebruik.'}</p>
<form method="post" action="/admin/media/upload" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">
<div class="row"><label for="file">Bestand</label><input id="file" type="file" name="file" accept="image/jpeg,image/png,image/webp" required></div>${altInputs()}
<div class="row"><label for="rechten">Rechten</label><select id="rechten" name="rechten">${media.RIGHTS.map((r) => `<option value="${r}">${esc(rightsLabel[r])}</option>`).join('')}</select></div>
<div class="row"><label for="bron">Bron of licentie (optioneel)</label><input id="bron" name="bron" maxlength="200"></div>
<button type="submit">Uploaden</button></form></section>` : '';
	const slotRows = IMAGE_SLOTS.map((s) => `<tr><td>${esc(s.label)}</td><td><form method="post" action="/admin/media/plek" class="inline"><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}"><input type="hidden" name="plek" value="${esc(s.slot)}"><select name="media" aria-label="${esc(s.label)}"${canWrite ? '' : ' disabled'}><option value="">(geen foto)</option>${items.map((m) => `<option value="${m.id}"${slots[s.slot] === m.id ? ' selected' : ''}>#${m.id} ${esc(m.alt.en || m.bestand)}</option>`).join('')}</select>${canWrite ? ' <button type="submit" class="small">Opslaan</button>' : ''}</form></td></tr>`).join('');
	const grid = items.length ? `<div class="mgrid">${items.map((m) => `<figure class="card mitem"><img src="/uploads/${esc(m.bestand)}" alt="${esc(m.alt.en || '')}" loading="lazy" width="${m.breedte}" height="${m.hoogte}"><figcaption><strong>#${m.id}</strong> ${esc(m.alt.en || '')}<br><span class="meta">${m.breedte}×${m.hoogte} · ${esc(rightsLabel[m.rechten])}${m.varianten.length ? ` · ${m.varianten.length} varianten` : ''}</span></figcaption>
${canWrite ? `<details><summary>Wijzigen</summary><form method="post" action="/admin/media/${m.id}"><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">${altInputs(m.alt)}<div class="row"><label>Rechten</label><select name="rechten">${media.RIGHTS.map((r) => `<option value="${r}"${m.rechten === r ? ' selected' : ''}>${esc(rightsLabel[r])}</option>`).join('')}</select></div><div class="row"><label>Bron</label><input name="bron" maxlength="200" value="${esc(m.bron)}"></div><button type="submit" class="small">Opslaan</button></form><form method="post" action="/admin/media/${m.id}/verwijderen" data-confirm="Deze foto verwijderen?"><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}"><button type="submit" class="danger small">Verwijderen</button></form></details>` : ''}</figure>`).join('')}</div>` : '<p class="hint">Nog geen foto’s.</p>';
	return shell(ctx, { title: 'Media', active: 'media', body: `<h1>Media</h1><p class="hint">Gebruik alleen foto’s waarvoor je de rechten hebt. AI-beelden zijn alleen sfeer en nooit het prototype zelf.</p>
<section class="card"><h2>Foto’s op de site</h2><div class="scroll"><table><tbody>${slotRows}</tbody></table></div></section>${upload}<section class="card"><h2>Bibliotheek</h2>${grid}</section>` });
}

/* ---- messages ---- */
function messagesPage(ctx, { list, total, page, pages, filter, sources, roles, retention, flash }) {
	const q = (extra = {}) => new URLSearchParams(Object.entries({ ...filter, ...extra }).filter(([, v]) => v)).toString();
	const select = (name, label, options, value) => `<label>${label} <select name="${name}"><option value="">alle</option>${options.map(([v, l]) => `<option value="${esc(v)}"${value === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
	const f = `<form method="get" action="/admin/berichten" class="filters"><label>Zoeken <input type="search" name="q" value="${esc(filter.q || '')}" placeholder="naam, e-mail, tekst"></label>
${select('status', 'Status', ['nieuw', 'gelezen', 'beantwoord', 'afgesloten'].map((s) => [s, s]), filter.status || '')}${select('rol', 'Rol', roles.map((r) => [r, r]), filter.rol || '')}${select('taal', 'Taal', LANGS.map((l) => [l, l.toUpperCase()]), filter.taal || '')}${select('bron', 'Bron', sources.map((s) => [s, s]), filter.bron || '')}
<label>Van <input type="date" name="van" value="${esc(filter.van || '')}"></label><label>Tot <input type="date" name="tot" value="${esc(filter.tot || '')}"></label><button type="submit" class="small">Filteren</button> <a href="/admin/berichten">wis</a></form>`;
	const rows = list.length ? `<div class="scroll"><table><thead><tr><th>Ontvangen</th><th>Naam</th><th>Organisatie</th><th>Rol</th><th>Taal</th><th>Bron</th><th>Status</th></tr></thead><tbody>${list.map((m) => `<tr class="${m.status === 'nieuw' ? 'unread' : ''}"><td>${esc(when(m.tijd))}</td><td><a href="/admin/berichten/${m.id}">${esc(m.naam)}</a><br><span class="meta">${esc(m.email)}</span></td><td>${esc(m.organisatie)}</td><td>${esc(m.rol)}</td><td>${esc(m.taal.toUpperCase())}</td><td>${esc(m.bron)}${m.campagne ? ' / ' + esc(m.campagne) : ''}</td><td><span class="pill st-${esc(m.status)}">${esc(m.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Geen berichten gevonden.</p>';
	const pager = pages > 1 ? `<nav class="tabs" aria-label="Paginering">${Array.from({ length: pages }, (_, i) => i + 1).map((n) => `<a href="/admin/berichten?${q({ page: n })}"${n === page ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>` : '';
	return shell({ ...ctx, flash }, { title: 'Berichten', active: 'berichten', body: `<h1>Berichten <span class="count">(${nf(total)})</span></h1><p class="hint">Berichten blijven ${retention} dagen bewaard en worden daarna automatisch verwijderd. <a href="/admin/berichten.csv?${esc(q())}">Exporteren (CSV)</a> · <a href="/admin/berichten/privacy">Privacyverzoek</a> · <a href="/admin/wachtrij">Mailwachtrij</a></p>${f}<section class="card">${rows}${pager}</section>` });
}
function messagePage(ctx, { m, gebruikers, aantalVanAdres, flash }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const subject = encodeURIComponent(`Re: je bericht via de website van Aethra`);
	const quote = encodeURIComponent(`\n\n> ${String(m.tekst).split('\n').join('\n> ')}`);
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	return shell({ ...ctx, flash }, { title: m.naam, active: 'berichten', body: `<p><a href="/admin/berichten">← alle berichten</a></p><h1>${esc(m.naam)}</h1>
<section class="card"><p><a href="mailto:${esc(m.email)}?subject=${subject}&amp;body=${quote}">${esc(m.email)}</a> · ${esc(m.rol)}${m.organisatie ? ' · ' + esc(m.organisatie) : ''} · ${esc(m.taal.toUpperCase())}</p>
<p class="meta">${esc(when(m.tijd))}${m.bron && m.bron !== 'direct' ? ' · bron: ' + esc(m.bron) + (m.campagne ? ' / ' + esc(m.campagne) : '') : ''}</p>
<p class="msg-text">${esc(m.tekst).replace(/\n/g, '<br>')}</p>
<p><a class="btn-link" href="mailto:${esc(m.email)}?subject=${subject}&amp;body=${quote}">Beantwoorden per e-mail</a></p></section>
${canWrite ? `<section class="card"><h2>Opvolging</h2>
<form method="post" action="/admin/berichten/${m.id}/status" class="inline">${csrf}<label>Status <select name="status">${['nieuw', 'gelezen', 'beantwoord', 'afgesloten'].map((s) => `<option${m.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label> <button type="submit" class="small">Opslaan</button></form>
<form method="post" action="/admin/berichten/${m.id}/toewijzen" class="inline">${csrf}<label>Toegewezen aan <select name="gebruiker"><option value="">niemand</option>${gebruikers.map((u) => `<option value="${u.id}"${m.toegewezen_aan === u.id ? ' selected' : ''}>${esc(u.naam)}</option>`).join('')}</select></label> <button type="submit" class="small">Opslaan</button></form>
<form method="post" action="/admin/berichten/${m.id}/notitie">${csrf}<div class="row"><label for="note">Interne notitie</label><textarea id="note" name="notitie" rows="3" maxlength="5000">${esc(m.notitie)}</textarea></div><button type="submit" class="small">Notitie opslaan</button></form></section>
<section class="card"><h2>Privacy</h2><p class="hint">${aantalVanAdres} bericht${aantalVanAdres === 1 ? '' : 'en'} van dit e-mailadres. <a href="/admin/berichten/privacy?email=${encodeURIComponent(m.email)}">Alle berichten van dit adres bekijken, exporteren of wissen</a>.</p>
<form method="post" action="/admin/berichten/${m.id}/verwijderen" data-confirm="Dit bericht definitief verwijderen?">${csrf}<button type="submit" class="danger">Dit bericht verwijderen</button></form></section>` : ''}` });
}
function privacyRequestPage(ctx, { email, list, flash }) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const canWrite = ctx.session.user.rol !== 'lezer';
	return shell({ ...ctx, flash }, { title: 'Privacyverzoek', active: 'berichten', body: `<h1>Privacyverzoek</h1><p class="hint">Zoek alles wat één persoon heeft gestuurd. Je kunt het exporteren (inzageverzoek) en wissen (verwijderverzoek).</p>
<form method="get" action="/admin/berichten/privacy" class="card"><div class="row"><label for="pe">E-mailadres</label><input id="pe" type="email" name="email" value="${esc(email)}" required></div><button type="submit" class="small">Zoeken</button></form>
${email ? `<section class="card"><h2>${list.length} bericht${list.length === 1 ? '' : 'en'} van ${esc(email)}</h2>${list.length ? `<ul class="plain">${list.map((m) => `<li><a href="/admin/berichten/${m.id}">${esc(when(m.tijd))}</a> · ${esc(m.rol)} · ${esc(m.tekst.slice(0, 80))}${m.tekst.length > 80 ? '…' : ''}</li>`).join('')}</ul>
<p><a class="btn-link" href="/admin/berichten/privacy.json?email=${encodeURIComponent(email)}">Exporteren (JSON)</a></p>${canWrite ? `<form method="post" action="/admin/berichten/privacy/wissen" data-confirm="Alle berichten van dit adres definitief wissen?">${csrf}<input type="hidden" name="email" value="${esc(email)}"><button type="submit" class="danger">Alles van dit adres wissen</button></form>` : ''}` : ''}</section>` : ''}` });
}
function queuePage(ctx, { rows, stats }) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const table = rows.length ? `<div class="scroll"><table><thead><tr><th>Bericht</th><th>Soort</th><th>Status</th><th>Pogingen</th><th>Volgende poging</th><th>Fout</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.bericht_id ? `<a href="/admin/berichten/${r.bericht_id}">${esc(r.naam || '#' + r.bericht_id)}</a>` : '-'}</td><td>${esc(r.soort)}</td><td><span class="pill ${r.status === 'verzonden' ? 'ok' : ''}">${esc(r.status)}</span></td><td>${r.aantal_pogingen}</td><td>${r.status === 'mislukt' ? esc(when(r.volgende_poging)) : '-'}</td><td>${esc(r.foutmelding || '')}</td><td>${canWrite && (r.status === 'mislukt' || r.status === 'gefaald') ? `<form method="post" action="/admin/wachtrij/${r.id}/opnieuw"><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}"><button class="small" type="submit">Opnieuw proberen</button></form>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">De wachtrij is leeg.</p>';
	return shell(ctx, { title: 'Mailwachtrij', active: 'berichten', body: `<h1>Mailwachtrij</h1><p class="hint">Een bericht staat altijd eerst in de database. Meldingen per e-mail gaan via deze wachtrij: bij een storing probeert het systeem het opnieuw (na 10, 20, 40 en 80 minuten) en geeft na 5 pogingen op. ${Object.entries(stats).map(([k, v]) => `${esc(k)}: ${v}`).join(' · ')}</p><section class="card">${table}</section>` });
}

/* ---- redirects, users, audit, account, stats ---- */
function redirectsPage(ctx, list) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const canWrite = ctx.session.user.rol !== 'lezer';
	const table = list.length ? `<div class="scroll"><table><thead><tr><th>Van</th><th>Naar</th><th>Gebruikt</th><th></th></tr></thead><tbody>${list.map((r) => `<tr><td><code>${esc(r.van)}</code></td><td><code>${esc(r.naar)}</code></td><td>${r.hits}</td><td>${canWrite ? `<form method="post" action="/admin/redirects/verwijderen">${csrf}<input type="hidden" name="van" value="${esc(r.van)}"><button class="danger small" type="submit">Verwijderen</button></form>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nog geen redirects. Ze ontstaan vanzelf als je het adres van een gepubliceerde pagina wijzigt.</p>';
	return shell(ctx, { title: 'Redirects', active: 'redirects', body: `<h1>Redirects</h1><p class="hint">Een oud adres stuurt bezoekers permanent (301) naar het nieuwe adres. Dat gebeurt automatisch als een adres van een gepubliceerde pagina verandert.</p><section class="card">${table}</section>
${canWrite ? `<section class="card"><h2>Redirect toevoegen</h2><form method="post" action="/admin/redirects">${csrf}<div class="row"><label for="rv">Van (bijvoorbeeld /nl/oude-pagina)</label><input id="rv" name="van" required></div><div class="row"><label for="rn">Naar (bijvoorbeeld /nl/nieuwe-pagina)</label><input id="rn" name="naar" required></div><button type="submit">Toevoegen</button></form></section>` : ''}` });
}
function usersPage(ctx, { list, flash }) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const roleSel = (value) => `<select name="rol">${['beheerder', 'editor', 'lezer'].map((r) => `<option value="${r}"${value === r ? ' selected' : ''}>${r}</option>`).join('')}</select>`;
	const rows = list.map((u) => `<tr><td><strong>${esc(u.naam)}</strong><br><span class="meta">${esc(u.email)}</span></td><td>${u.tweestaps ? '2FA aan' : '<span class="meta">geen 2FA</span>'}</td><td>${u.laatste_login ? esc(when(u.laatste_login)) : '-'}</td>
<td><form method="post" action="/admin/gebruikers/${u.id}" class="inline">${csrf}<input name="naam" value="${esc(u.naam)}" aria-label="Naam" maxlength="80"> ${roleSel(u.rol)} <label class="chk"><input type="checkbox" name="actief" value="1"${u.actief ? ' checked' : ''}> actief</label> <button class="small" type="submit">Opslaan</button></form>
<form method="post" action="/admin/gebruikers/${u.id}/wachtwoord" class="inline">${csrf}<input name="nieuw" type="password" placeholder="nieuw wachtwoord" minlength="12" autocomplete="new-password" aria-label="Nieuw wachtwoord voor ${esc(u.naam)}"> <input name="huidig" type="password" placeholder="jouw wachtwoord" autocomplete="current-password" aria-label="Jouw wachtwoord ter bevestiging" required> <button class="small" type="submit">Wachtwoord instellen</button></form>
${u.tweestaps ? `<form method="post" action="/admin/gebruikers/${u.id}/2fa-uit" class="inline" data-confirm="Tweestapsverificatie voor deze gebruiker uitzetten?">${csrf}<input name="huidig" type="password" placeholder="jouw wachtwoord" autocomplete="current-password" required aria-label="Jouw wachtwoord ter bevestiging"> <button class="small danger" type="submit">2FA uitzetten</button></form>` : ''}</td></tr>`).join('');
	return shell({ ...ctx, flash }, { title: 'Gebruikers', active: 'gebruikers', body: `<h1>Gebruikers</h1><p class="hint"><strong>beheerder</strong>: alles, ook gebruikers en auditlog. <strong>editor</strong>: teksten, pagina’s, media en berichten. <strong>lezer</strong>: alleen kijken.</p>
<section class="card"><div class="scroll"><table><thead><tr><th>Gebruiker</th><th>Beveiliging</th><th>Laatste login</th><th>Beheer</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section class="card"><h2>Gebruiker toevoegen</h2><form method="post" action="/admin/gebruikers">${csrf}<div class="row"><label for="ue">E-mailadres</label><input id="ue" name="email" type="email" required></div><div class="row"><label for="un">Naam</label><input id="un" name="naam" required maxlength="80"></div><div class="row"><label for="ur">Rol</label>${roleSel('editor')}</div><div class="row"><label for="up">Startwachtwoord (minstens 12 tekens; de gebruiker wijzigt het zelf)</label><input id="up" name="wachtwoord" type="password" minlength="12" autocomplete="new-password" required></div><div class="row"><label for="uh">Jouw wachtwoord ter bevestiging</label><input id="uh" name="huidig" type="password" autocomplete="current-password" required></div><button type="submit">Toevoegen</button></form></section>` });
}
function auditPage(ctx, { rows, total, page, actie }) {
	const pages = Math.max(1, Math.ceil(total / 100));
	return shell(ctx, { title: 'Auditlog', active: 'audit', body: `<h1>Auditlog</h1><p class="hint">Elke wijziging, publicatie, override en login-poging. De tabel is append-only: de applicatie kan niets wijzigen of wissen (rijen ouder dan 180 dagen gaan maandelijks naar een gezipt archief).</p>
<form method="get" action="/admin/audit" class="filters"><label>Actie bevat <input name="actie" value="${esc(actie)}"></label> <button class="small" type="submit">Filteren</button></form>
<section class="card"><div class="scroll"><table><thead><tr><th>Tijd</th><th>Wie</th><th>Actie</th><th>Onderdeel</th><th>Details</th><th>Reden</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(when(r.timestamp))}</td><td>${esc(r.gebruiker || 'systeem')}</td><td>${esc(r.actie)}</td><td><code>${esc(r.entiteit)}</code></td><td class="detail">${esc(String(r.nieuwe_waarde || r.oude_waarde || '').slice(0, 160))}</td><td>${esc(r.override_reden || '')}</td></tr>`).join('')}</tbody></table></div>
${pages > 1 ? `<nav class="tabs">${Array.from({ length: Math.min(pages, 30) }, (_, i) => i + 1).map((n) => `<a href="/admin/audit?page=${n}&amp;actie=${encodeURIComponent(actie)}"${n === page ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>` : ''}</section>` });
}
function accountPage(ctx, { flash, tf = {} }) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	let two;
	if (tf.codes) two = `<section class="card narrow"><h2>Herstelcodes</h2><p class="hint">Tweestapsverificatie staat aan. Bewaar deze codes veilig (wachtwoordmanager of geprint). Elke code werkt één keer als je je telefoon kwijt bent. Ze worden alleen nu getoond.</p><ul class="codes">${tf.codes.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul></section>`;
	else if (tf.setup) two = `<section class="card narrow"><h2>Tweestapsverificatie instellen</h2><ol class="hint"><li>Open een authenticator-app op je telefoon en kies om een account toe te voegen.</li><li>Scan deze QR-code.<div class="qr-wrap">${qrSvg(tf.setup.uri, 'QR-code om het Aethra-account toe te voegen aan een authenticator-app')}</div><details class="alt"><summary>Scannen lukt niet?</summary><p>Kies “sleutel invoeren” (tijdgebonden) en typ: <code class="key">${esc(tf.setup.secret.replace(/(.{4})/g, '$1 ').trim())}</code></p></details></li><li>Vul de 6-cijferige code uit de app in.</li></ol>
<form method="post" action="/admin/2fa/confirm">${csrf}<div class="row"><label for="c2">Code uit de app</label><input id="c2" name="code" inputmode="numeric" autocomplete="one-time-code" required></div><button type="submit">Bevestigen</button></form>
<form method="post" action="/admin/2fa/restart">${csrf}<button type="submit" class="secondary small">Nieuwe QR-code</button></form></section>`;
	else if (tf.enabled) two = `<section class="card narrow"><h2>Tweestapsverificatie</h2><p class="ok-text">Aan. Je hebt nog ${tf.left} herstelcode${tf.left === 1 ? '' : 's'}.</p><p class="hint">Uitzetten of nieuwe herstelcodes vragen je wachtwoord en een code uit de app.</p>
<form method="post" action="/admin/2fa/disable">${csrf}<div class="row"><label for="dp">Huidig wachtwoord</label><input id="dp" name="current" type="password" autocomplete="current-password" required></div><div class="row"><label for="dc">Code uit de app</label><input id="dc" name="code" autocomplete="one-time-code" required></div><div class="actions"><button type="submit">Uitzetten</button> <button type="submit" formaction="/admin/2fa/recovery" class="secondary">Nieuwe herstelcodes</button></div></form></section>`;
	else two = `<section class="card narrow"><h2>Tweestapsverificatie</h2><p class="hint">Staat uit. Aanzetten is sterk aanbevolen: een gestolen wachtwoord geeft dan geen toegang meer.</p><form method="post" action="/admin/2fa/start">${csrf}<div class="row"><label for="sp">Bevestig met je huidige wachtwoord</label><input id="sp" name="current" type="password" autocomplete="current-password" required></div><button type="submit">Instellen</button></form></section>`;
	return shell({ ...ctx, flash }, { title: 'Account', active: 'account', body: `<h1>${esc(ctx.session.user.naam)}</h1><p class="hint">${esc(ctx.session.user.email)} · rol: ${esc(ctx.session.user.rol)}</p>
<form method="post" action="/admin/account" class="card narrow">${csrf}<h2>Wachtwoord wijzigen</h2><div class="row"><label for="cur">Huidig wachtwoord</label><input id="cur" name="current" type="password" autocomplete="current-password" required></div><div class="row"><label for="new">Nieuw wachtwoord (minstens 12 tekens)</label><input id="new" name="password" type="password" autocomplete="new-password" minlength="12" required></div><button type="submit">Wijzigen</button></form>${two}` });
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

module.exports = { PLACE, ORDER, loginPage, codePage, dashboardPage, pagesPage, newPagePage, textEditorPage, privacyEditorPage, pageEditorPage, sectionCard, historyPage, diffPage, mediaPage, messagesPage, messagePage, privacyRequestPage, queuePage, redirectsPage, usersPage, auditPage, accountPage, statsPage, errorPage, CONTACT_ROLES };
