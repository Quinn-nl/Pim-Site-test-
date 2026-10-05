'use strict';
/** Pages and texts: lists, editors, history, trash. */
const { GROUPS, IMAGE_SLOTS, ROLES: CONTACT_ROLES } = require('../../fields');
const { labelOf, SLOTS } = require('../labels');
const { LANGS, LANG_NAMES } = require('../../i18n');
const { esc, asset } = require('../../views');
const { SECTIONS, TEMPLATES } = require('../templates');
const content = require('../content');
const pagesApi = require('../pages');
const media = require('../media');
const { icon, json, shell, table, when } = require('./common');

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
	const canPub = ['beheerder', 'editor'].includes(ctx.session.user.rol);
	const extras = extra.length ? extra.map((p) => {
		const talen = LANGS.filter((l) => p.titels[l]);
		const titel = p.titels.nl || p.titels.en || Object.values(p.titels)[0] || '(zonder titel)';
		const line = row(`/admin/paginas/${p.id}`, titel, `${TEMPLATES[p.sjabloon] ? TEMPLATES[p.sjabloon].label : p.sjabloon}`, `${lockNote(`pagina:${p.id}`)}<span class="meta">${talen.map((l) => l.toUpperCase()).join(' · ') || 'geen taal'}</span><span class="pill ${p.status === 'gepubliceerd' ? 'ok' : ''}">${p.status === 'gepubliceerd' ? 'live' : 'concept'}</span>`);
		return canPub ? `<div class="rl-sel"><label class="selbox"><input type="checkbox" name="p_${p.id}" value="1" data-bulk-box aria-label="${esc(titel)} selecteren"></label>${line}</div>` : line;
	}).join('') : `<div class="empty">${icon('pages')}<p>Je hebt nog geen eigen pagina’s gemaakt.</p>${canWrite ? '<a class="btn-link" href="/admin/paginas/nieuw">Eerste pagina maken</a>' : ''}</div>`;
	return shell(ctx, { title: 'Pagina’s en teksten', active: 'paginas', body: `<div class="page-head"><div><h1>Pagina’s en teksten</h1><p class="hint">Kies wat je wilt aanpassen. Alles wat je publiceert staat meteen op de website.</p></div>${canWrite ? `<a class="btn-link" href="/admin/paginas/nieuw">${icon('plus')} Nieuwe pagina</a>` : ''}</div>
<div class="searchbar"><label class="sr" for="pf">Zoek een pagina</label>${icon('search')}<input id="pf" type="search" placeholder="Zoek een pagina of tekst…" data-filter autocomplete="off"></div>
<section class="card rl-card" data-filter-group><h2>Eigen pagina’s</h2>${canPub && extra.length ? `<form method="post" action="/admin/paginas/bulk" data-bulk>${csrfInput(ctx)}<div class="bulkbar"><label class="selbox"><input type="checkbox" data-bulk-all aria-label="Alles selecteren"></label><span class="meta" data-bulk-count>Niets geselecteerd</span><select name="actie" aria-label="Actie"><option value="offline">Offline halen (wordt concept)</option><option value="prullenbak">Naar de prullenbak</option></select><button type="submit" class="small" data-bulk-go disabled data-confirm-msg="Deze actie uitvoeren voor de geselecteerde pagina’s?">Uitvoeren</button></div>${extras}</form>` : extras}</section>
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
const OPTIONAL_RE = require('../../fields').OPTIONAL;

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
<details class="card fold"><summary>Zoekmachines (SEO)</summary><div class="serp" data-serp aria-live="polite"><span class="serp-label">Zo ziet het er in Google ongeveer uit</span><span class="serp-url"></span><span class="serp-title"></span><span class="serp-desc"></span><span class="serp-count"></span></div>${baseOf(['seo_title', 'seo_description'])}</details>
<details class="card fold"><summary>Instellingen van de pagina</summary><div class="opts"><label class="chk"><input type="checkbox" data-meta="in_footer"${p.meta.in_footer ? ' checked' : ''}> Link in de footer</label><label class="chk"><input type="checkbox" data-meta="indexeren"${p.meta.indexeren ? ' checked' : ''}> Zichtbaar voor zoekmachines</label><label class="chk">Volgorde in de footer <input type="number" data-meta="volgorde" min="0" max="9999" value="${p.meta.volgorde}" class="narrow-num"></label></div></details>
${canWrite ? `<div class="page-tools"><form method="post" action="/admin/paginas/${id}/dupliceren"><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}"><button type="submit" class="secondary small">Pagina dupliceren</button></form></div>` : ''}
<div class="sec-title"><h2>Inhoud van de pagina</h2><div class="actions"><button type="button" class="secondary small" id="collapse-all">Alles inklappen</button><button type="button" class="secondary small" id="expand-all">Alles uitklappen</button></div></div>
<div id="sections">${sections}</div>
${canWrite ? `<div class="addbar"><label for="addtype">Bouwsteen toevoegen</label><select id="addtype">${addOptions}</select><button type="button" class="secondary" id="addsec">${icon('plus')} Toevoegen</button></div>` : ''}
</form>${previewPane(`/${(p.velden.nl && p.velden.nl.slug) || (p.velden.en && p.velden.en.slug) || 'voorbeeld'}`, 'pagina')}</div>${templates}
${canWrite && ['beheerder', 'editor'].includes(ctx.session.user.rol) ? `<form method="post" action="/admin/paginas/${id}/verwijderen" class="card danger-zone" data-confirm="Deze pagina naar de prullenbak? Je kunt hem 30 dagen terugzetten."><input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}"><button class="danger" type="submit">Pagina naar de prullenbak</button></form>` : ''}` });
}

/* ---- history ---- */
const csrfInput = (ctx) => `<input type="hidden" name="csrf" value="${esc(ctx.session.csrf)}">`;
function historyPage(ctx, { object, entries, huidigeVersie = 0, canRestore = false }) {
	const rows = entries.length ? `<div class="scroll"><table><thead><tr><th>Versie</th><th>Wanneer</th><th>Door</th><th>Reden</th><th></th></tr></thead><tbody>${entries.map((e) => `<tr><td>${e.versie_nummer}</td><td>${esc(when(e.tijdstip))}</td><td>${esc(e.gebruiker || 'systeem')}</td><td>${esc(e.reden || '')}</td><td class="num"><a href="/admin/historie/${e.id}">vergelijk</a>${canRestore ? ` <form method="post" action="/admin/historie/${e.id}/terugzetten" class="inline" data-confirm="Versie ${e.versie_nummer} terugzetten? De huidige staat blijft in de geschiedenis.">${csrfInput(ctx)}<input type="hidden" name="basis" value="${huidigeVersie}"><button type="submit" class="small secondary">Terugzetten</button></form>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nog geen eerdere versies.</p>';
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

module.exports = { PLACE, ORDER, PREVIEW_PAGES, ago, pagesPage, newPagePage, maxLen, OPTIONAL_RE, control, fieldRow, langState, STATE_LABEL, langTabs, previewPane, editorHead, textBlocks, textEditorPage, privacyEditorPage, sectionCard, pageEditorPage, csrfInput, historyPage, diffPage, trashPage };
