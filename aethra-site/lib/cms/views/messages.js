'use strict';
/** Contact messages, the mail queue, privacy requests and reply templates. */
const { LANGS, LANG_NAMES } = require('../../i18n');
const { esc, asset } = require('../../views');
const messagesApi = require('../messages');

const { avatar, icon, json, nf, relTime, shell, table, when } = require('./common');

/* ---- messages ---- */
const ST = messagesApi.STATUS_LABELS;
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
function messagePage(ctx, { m, gebruikers, aantalVanAdres, flash, templates = [], chosen = null, neighbors = {} }) {
	const me = ctx.session.user;
	const canWrite = me.rol !== 'lezer';
	const subject = encodeURIComponent(chosen && chosen.onderwerp ? chosen.onderwerp : 'Re: je bericht via de website van Aethra');
	const quote = encodeURIComponent(`${chosen && chosen.tekst ? chosen.tekst + '\n' : ''}\n\n> ${String(m.tekst).split('\n').join('\n> ')}`);
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const mail = `mailto:${esc(m.email)}?subject=${subject}&amp;body=${quote}`;
	const who = gebruikers.find((u) => u.id === m.toegewezen_aan);
	const flow = ['nieuw', 'gelezen', 'in_behandeling', 'beantwoord', 'afgesloten'];
	const stepper = canWrite ? `<form method="post" action="/admin/berichten/${m.id}/status" class="stepper" aria-label="Status">${csrf}${flow.map((s) => `<button type="submit" name="status" value="${s}" data-status-btn="${s}" class="step" aria-pressed="${m.status === s}">${esc(ST[s])}</button>`).join('')}</form>` : statusPill(m.status);
	const next = m.status === 'nieuw' || m.status === 'gelezen' ? ['in_behandeling', 'Neem in behandeling'] : m.status === 'in_behandeling' ? ['afgesloten', 'Markeer als afgerond'] : m.status === 'beantwoord' ? ['afgesloten', 'Markeer als afgerond'] : null;
	return shell({ ...ctx, flash }, { title: m.naam, active: 'berichten', body: `<p class="crumb crumb-nav"><a href="/admin/berichten">← Alle berichten</a><span class="pager-mini">${neighbors.newer ? `<a href="/admin/berichten/${neighbors.newer}" rel="prev" data-key-prev>↑ Nieuwer (K)</a>` : ''}${neighbors.older ? `<a href="/admin/berichten/${neighbors.older}" rel="next" data-key-next>↓ Ouder (J)</a>` : ''}</span></p>
<div class="page-head"><div class="who-head">${avatar(m.naam, 'lg')}<div><h1>${esc(m.naam)}</h1><p class="hint"><a href="${mail}">${esc(m.email)}</a>${m.organisatie ? ' · ' + esc(m.organisatie) : ''} · ${esc(m.rol)} · ${esc(m.taal.toUpperCase())}</p></div></div>${statusPill(m.status)}</div>
<div class="split">
<div><section class="card"><p class="meta">${esc(when(m.tijd))}${m.bron && m.bron !== 'direct' ? ' · via ' + esc(m.bron) + (m.campagne ? ' / ' + esc(m.campagne) : '') : ''}</p><p class="msg-text">${esc(m.tekst).replace(/\n/g, '<br>')}</p>
${canWrite && templates.length ? `<form method="get" action="/admin/berichten/${m.id}" class="inline tpl-pick"><label for="tplsel" class="sr">Antwoordsjabloon</label><select id="tplsel" name="sjabloon" data-autosubmit><option value="">Antwoord met een sjabloon…</option>${templates.map((t) => `<option value="${t.id}"${chosen && chosen.id === t.id ? ' selected' : ''}>${esc(t.naam)}</option>`).join('')}</select><noscript><button class="small" type="submit">Toepassen</button></noscript></form>` : ''}
<div class="actions"><a class="btn-link" href="${mail}" data-key-reply>${icon('send')} Beantwoorden per e-mail${chosen ? ' met sjabloon' : ''}</a>${canWrite && next ? `<form method="post" action="/admin/berichten/${m.id}/status" class="inline">${csrf}<button type="submit" name="status" value="${next[0]}" class="secondary">${next[1]}</button></form>` : ''}</div>
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

function privacyOverviewPage(ctx, { retention, backups, secure }) {
	const row = (a, b, c) => `<tr><th scope="row">${a}</th><td>${b}</td><td>${c}</td></tr>`;
	return shell(ctx, { title: 'Privacy en cookies', active: 'help', body: `<div class="page-head"><div><h1>Privacy en cookies</h1><p class="hint">Wat de website en het beheer bewaren. Dit overzicht komt uit de werking van de software; leg de uitkomst naast de privacyverklaring en laat die controleren door een jurist.</p></div></div>
<section class="card"><h2>De publieke website</h2><div class="scroll"><table><thead><tr><th>Wat</th><th>Waarvoor</th><th>Hoe lang</th></tr></thead><tbody>
${row('Cookie <code>aethra_lang</code>', 'Onthoudt de gekozen taal. Wordt alleen gezet als iemand zelf de taal wisselt. Functioneel, geen tracking.', '1 jaar')}
${row('Paginaweergaven', 'Anoniem geteld per pagina, taal en bron. Geen cookies, geen IP-adressen, geen vingerafdruk. Bezoekers met Do Not Track worden niet geteld.', 'Alleen totalen per dag')}
${row('Contactformulier', 'Naam, e-mailadres, organisatie, rol, bericht en (als aanwezig) de bron van het bezoek. Alleen na toestemming (vinkje).', `${retention} dagen, daarna automatisch verwijderd`)}
${row('Automatische bevestiging', 'Een bevestigingsmail naar de afzender, als er een mailserver is ingesteld.', 'Niet bewaard na verzending (verzonden mails 7 dagen in de wachtrij)')}
${row('Externe diensten', 'Geen lettertypes, scripts, kaarten of video’s van derden. Alles komt van de eigen server.', '-')}
</tbody></table></div></section>
<section class="card"><h2>Het beheer</h2><div class="scroll"><table><thead><tr><th>Wat</th><th>Waarvoor</th><th>Hoe lang</th></tr></thead><tbody>
${row('Cookie <code>aethra_sid</code>', `Houdt je ingelogd. Alleen voor het beheer, niet leesbaar door scripts${secure ? ', alleen via https' : ''}.`, 'Maximaal 8 uur, of tot je uitlogt')}
${row('Browseropslag (localStorage)', 'Alleen jouw voorkeuren in dit beheer: gekozen taal-tab, thema, meldingen aan/uit en uitgeklapte uitleg. Wordt niet verstuurd.', 'Tot je het wist')}
${row('Accounts', 'Naam, e-mailadres, rol, versleutelde wachtwoordhash, tijdstip van laatste login en voorkeuren voor meldingen.', 'Tot een beheerder het account verwijdert')}
${row('Inlogpogingen', 'Een teller per adres en e-mailadres om te veel pogingen te remmen. Sessies bewaren alleen het netwerkdeel van het adres (/24) en een hash van de browser.', 'Tot de blokkade afloopt; sessies maximaal 8 uur')}
${row('Auditlog', 'Wie wat wanneer wijzigde. Kan niet worden aangepast.', '180 dagen in de database, daarna in een gezipt archief op de server')}
${row('Back-ups', 'Een kopie van de database inclusief berichten en accounts.', `De laatste ${backups}`)}
${row('Voorbeeldlinks', 'Geheime links naar concepten, met de inhoud van het concept.', 'Tot de ingestelde einddatum (maximaal 14 dagen)')}
${row('Mails in de wachtrij', 'Uitnodigingen, herstellinks, meldingen en het weekrapport (geen berichttekst).', 'Verzonden of opgegeven mails: 7 dagen')}
</tbody></table></div></section>
<section class="card"><h2>Inzage en verwijdering</h2><p>Vraagt iemand om inzage of verwijdering van zijn of haar berichten? Gebruik <a href="/admin/berichten/privacy">Privacyverzoek</a>: je zoekt op e-mailadres, exporteert alles als bestand of wist het in één keer. Ook uit de mailwachtrij verdwijnt de inhoud binnen een week en uit de back-ups zodra die worden vervangen.</p></section>` });
}
function repliesPage(ctx, { list, edit, draft = null, canWrite }) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
	const val = (k, l) => esc(draft ? draft[`${k}_${l}`] : edit && edit.teksten[l] ? edit.teksten[l][k] : '');
	const naam = esc(draft ? draft.naam : edit ? edit.naam : '');
	const form = canWrite ? `<section class="card" id="vorm"><h2>${edit ? `Sjabloon bewerken` : 'Nieuw sjabloon'}</h2><form method="post" action="/admin/sjablonen">${csrf}<input type="hidden" name="id" value="${edit ? edit.id : ''}"><div class="row"><label for="sn">Naam (voor jezelf)</label><input id="sn" name="naam" maxlength="80" required value="${naam}"></div>
<p class="hint">Je kunt <code>{naam}</code> en <code>{organisatie}</code> gebruiken; die worden ingevuld met de gegevens van de afzender. Het sjabloon in de taal van de afzender wordt gebruikt, anders het Engelse.</p>
${LANGS.map((l) => `<details class="fold-lite"${(edit && edit.teksten[l]) || (draft && (draft[`tekst_${l}`] || draft[`onderwerp_${l}`])) || l === 'nl' ? ' open' : ''}><summary>${esc(LANG_NAMES[l])}</summary><div class="row"><label for="so${l}">Onderwerp</label><input id="so${l}" name="onderwerp_${l}" maxlength="150" lang="${l}" value="${val('onderwerp', l)}"></div><div class="row"><label for="st${l}">Tekst</label><textarea id="st${l}" name="tekst_${l}" rows="6" maxlength="4000" lang="${l}">${val('tekst', l)}</textarea></div></details>`).join('')}
<button type="submit">Opslaan</button> ${edit ? '<a class="btn-link secondary" href="/admin/sjablonen">Annuleren</a>' : ''}</form></section>` : '';
	return shell(ctx, { title: 'Antwoordsjablonen', active: 'sjablonen', body: `<div class="page-head"><div><h1>Antwoordsjablonen</h1><p class="hint">Standaardantwoorden voor berichten. Open een bericht en kies “Antwoord met een sjabloon”.</p></div></div>
<section class="card flush">${list.length ? `<ul class="msglist">${list.map((t) => `<li class="msg-row"><span class="msg-main"><span class="msg-top"><strong>${esc(t.naam)}</strong></span><span class="msg-snip">Talen: ${Object.keys(t.teksten).map((l) => l.toUpperCase()).join(', ')}</span></span><span class="msg-side">${canWrite ? `<a class="btn-link secondary small" href="/admin/sjablonen?bewerk=${t.id}#vorm">Bewerken</a><form method="post" action="/admin/sjablonen/${t.id}/verwijderen" class="inline" data-confirm="Dit sjabloon verwijderen?">${csrf}<button class="small danger" type="submit">Verwijderen</button></form>` : ''}</span></li>`).join('')}</ul>` : '<p class="hint pad">Nog geen sjablonen.</p>'}</section>${form}` });
}


module.exports = { ST, statusPill, messagesPage, messagePage, privacyRequestPage, queuePage, privacyOverviewPage, repliesPage };
