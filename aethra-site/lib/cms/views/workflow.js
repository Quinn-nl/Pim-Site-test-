'use strict';
/** Review flow, translations, planning and preview links. */
const { LANGS, LANG_NAMES } = require('../../i18n');
const { esc, asset } = require('../../views');
const { relTime, shell, table, when } = require('./common');

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


module.exports = { REVIEW_PILL, reviewPill, reviewsPage, reviewPage, translationsPage, planningPage, shareLinksPage };
