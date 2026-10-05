'use strict';
/** The photo library. */
const { GROUPS, IMAGE_SLOTS, ROLES: CONTACT_ROLES } = require('../../fields');
const { labelOf, SLOTS } = require('../labels');
const { LANGS, LANG_NAMES } = require('../../i18n');
const { esc, asset } = require('../../views');
const media = require('../media');
const { icon, nf, shell } = require('./common');

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
		return `<figure class="card mitem${canPublish && !used.length ? ' selectable' : ''}" data-media data-search="${esc(`${m.id} ${m.alt.en || ''} ${m.bron || ''}`.toLowerCase())}" data-use="${used.length ? 1 : 0}" data-rights="${esc(m.rechten)}">
${canPublish && !used.length ? `<label class="selbox pick"><input type="checkbox" name="m_${m.id}" value="1" data-bulk-box aria-label="Foto ${m.id} selecteren"></label>` : ''}<button type="button" class="thumb" data-dialog="m${m.id}" aria-label="Foto ${m.id} bekijken en bewerken">${thumb(m)}</button>
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
${canPublish ? `<form method="post" action="/admin/media/bulk" data-bulk id="bulkmedia">${csrf}<div class="bulkbar"><span class="meta" data-bulk-count>Niets geselecteerd</span><button type="submit" class="small danger" data-bulk-go disabled data-confirm-msg="De geselecteerde foto’s naar de prullenbak?">Naar de prullenbak</button><span class="meta">Alleen foto’s die nergens gebruikt worden kun je selecteren.</span></div>` : ''}<div class="mgrid" id="mgrid">${items.map(card).join('')}</div>${canPublish ? '</form>' : ''}<p class="hint" id="mnone" hidden>Geen foto’s gevonden met deze filter.</p>${items.map(dialog).join('')}` : `<div class="empty">${icon('media')}<p><strong>Nog geen foto’s.</strong></p><p class="hint">Upload hierboven je eerste foto. Gebruik alleen foto’s waarvoor je de rechten hebt.</p></div>`;
	return shell(ctx, { title: 'Media', active: 'media', body: `<div class="page-head"><div><h1>Media</h1><p class="hint">${nf(items.length)} foto${items.length === 1 ? '' : '’s'} · ${fmtSize(total)} in totaal${unused ? ` · ${unused} ongebruikt` : ''}. AI-beelden zijn alleen sfeer en nooit het prototype zelf.</p></div>${canWrite ? '<a class="btn-link" href="#upload">' + icon('plus') + ' Foto toevoegen</a>' : ''}</div>
<section class="card"><h2>Foto’s op de site</h2><p class="hint">Kies welke foto waar op de website komt. Een wijziging is direct zichtbaar.</p><div class="slots">${slotCards}</div></section>${upload}<section class="card"><h2>Bibliotheek</h2>${library}</section>` });
}


module.exports = { mediaPage };
