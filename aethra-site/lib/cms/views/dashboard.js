'use strict';
/** Dashboard, statistics and help. */
const { esc, asset } = require('../../views');
const media = require('../media');
const { icon, nf, shell, table, when } = require('./common');

/* ---- dashboard ---- */
function dashboardPage(ctx, d) {
	const canWrite = ctx.session.user.rol !== 'lezer';
	const card = (title, inner) => `<section class="card"><h2>${title}</h2>${inner}</section>`;
	const warn = d.gezondheid.length ? `<ul class="plain">${d.gezondheid.map((w) => `<li class="sev ${w.ernst === 'info' ? 'info' : ''}">${icon(w.ernst === 'info' ? 'info' : 'alert')}<span>${esc(w.bericht)}</span></li>`).join('')}</ul>` : `<p class="hint">${icon('check')} Geen aandachtspunten.</p>`;
	const locks = Object.keys(d.locks).length ? `<ul class="plain">${Object.entries(d.locks).map(([o, n]) => `<li class="sev">${icon('lock')}<span><strong>${esc(n)}</strong> bewerkt <code>${esc(o)}</code></span></li>`).join('')}</ul>` : '<p class="hint">Niemand is aan het bewerken.</p>';
	const recent = d.recent.length ? `<div class="scroll"><table><thead><tr><th>Wanneer</th><th>Wie</th><th>Wat</th><th>Onderdeel</th></tr></thead><tbody>${d.recent.map((a) => `<tr><td>${esc(when(a.timestamp))}</td><td>${esc(a.gebruiker || 'systeem')}</td><td>${esc(a.actie)}</td><td><code>${esc(a.entiteit)}</code></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nog geen wijzigingen.</p>';
	const kpi = (href, ic, value, label, key, alert) => `<a class="kpi kpi-link${alert ? ' alert' : ''}" href="${href}">${icon(ic)}<span class="kpi-v"${key ? ` data-kpi="${key}"` : ''}>${nf(value)}</span><span>${label}</span></a>`;
	return shell(ctx, { title: 'Dashboard', active: 'dash', body: `<h1>Welkom, ${esc(ctx.session.user.naam.split(' ')[0])}</h1><p class="hint">Dit is de stand van zaken van de website.</p>
${d.tasks ? `<section class="card tasks"><h2>Mijn taken</h2>${d.tasks.length ? `<ul class="plain">${d.tasks.map((t) => `<li class="sev${t.urgent ? ' urgent' : ''}"><a href="${esc(t.href)}">${icon(t.icon)}<span>${esc(t.tekst)}</span></a></li>`).join('')}</ul>` : `<p class="hint">${icon('check')} Alles is bijgewerkt. Niets wacht op jou.</p>`}</section>` : ''}
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

function statsPage(ctx, sum, days, { prev = null, bySource = [] } = {}) {
	const top = (obj, limit = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limit);
	const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
	const w = 720, h = 140, max = Math.max(1, ...sum.perDay), n = sum.perDay.length, gap = 2, bw = Math.max(2, (w - gap * (n - 1)) / n);
	const bars = sum.perDay.map((v, i) => { const bh = Math.round((v / max) * (h - 8)); return `<rect class="bar-rect" x="${(i * (bw + gap)).toFixed(1)}" y="${h - bh}" width="${bw.toFixed(1)}" height="${Math.max(bh, v ? 1 : 0)}"><title>${esc(sum.days[i])}: ${v}</title></rect>`; }).join('');
	const chart = `<svg class="chart" viewBox="0 0 ${w} ${h + 18}" role="img" aria-label="Paginaweergaven per dag, piek ${max}"><text x="0" y="10" class="axis">${max}</text>${bars}<text x="0" y="${h + 14}" class="axis">${esc(sum.days[0])}</text><text x="${w}" y="${h + 14}" class="axis" text-anchor="end">${esc(sum.days[n - 1])}</text></svg>`;
	const delta = (a, b2) => { if (!prev) return ''; if (!b2) return a ? '<span class="delta up">nieuw</span>' : ''; const d = Math.round(((a - b2) / b2) * 100); return `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}" title="Tegenover de ${days} dagen ervoor (${nf(b2)})">${d > 0 ? '+' : ''}${d}%</span>`; };
	const ranges = [7, 30, 90].map((d) => `<a href="/admin/stats?days=${d}"${d === days ? ' aria-current="page"' : ''}>${d} dagen</a>`).join('');
	return shell(ctx, { title: 'Statistieken', active: 'stats', body: `<h1>Statistieken</h1><p class="hint">Anonieme paginaweergaven, geteld zonder cookies of IP-adressen. Bezoekers met Do Not Track worden niet geteld. Gebruik de cijfers voor trends, niet als exacte aantallen.</p><nav class="tabs" aria-label="Periode">${ranges}</nav>
<div class="kpis"><div class="kpi"><span class="kpi-v">${nf(sum.views)}</span><span>Paginaweergaven ${prev ? delta(sum.views, prev.views) : ''}</span></div><div class="kpi"><span class="kpi-v">${nf(sum.contactViews)}</span><span>Weergaven contactpagina ${prev ? delta(sum.contactViews, prev.contactViews) : ''}</span></div><div class="kpi"><span class="kpi-v">${nf(sum.sent)}</span><span>Berichten verstuurd ${prev ? delta(sum.sent, prev.sent) : ''}</span></div><div class="kpi"><span class="kpi-v">${pct(sum.sent, sum.contactViews)}</span><span>Contactpagina naar bericht</span></div></div>
<section class="card"><h2>Weergaven per dag</h2>${chart}</section><section class="card"><h2>Populaire pagina’s</h2>${table(['Pagina', 'Weergaven'], top(sum.pages).map(([k, v]) => [k, v]), 'Nog geen weergaven.')}</section>
<section class="card"><h2>Waar bezoekers vandaan komen</h2>${table(['Bron / campagne', 'Weergaven'], top(sum.sources).map(([k, v]) => [k, v]), 'Nog geen weergaven.')}<p class="hint">Voorzie links van tags om campagnes te zien, bijvoorbeeld <code>https://jouwsite.nl/nl/?utm_source=linkedin&amp;utm_campaign=lancering</code>.</p></section>
<section class="card"><h2>Taal</h2>${table(['Taal', 'Weergaven'], top(sum.langs).map(([k, v]) => [k.toUpperCase(), v]), 'Nog geen weergaven.')}</section><section class="card"><h2>Berichten per rol</h2>${table(['Rol', 'Berichten'], top(sum.roles).map(([k, v]) => [k, v]), 'Geen berichten in deze periode.')}</section>
<section class="card"><h2>Berichten per bron en campagne</h2>${(() => { if (!bySource.length) return '<p class="hint">Geen berichten in deze periode.</p>'; const views2 = sum.sources; return `<div class="scroll"><table data-sortable><thead><tr><th>Bron / campagne</th><th>Weergaven</th><th>Berichten</th><th>Berichten per 100 weergaven</th></tr></thead><tbody>${bySource.map((r) => { const key = r.campagne ? `${r.bron} / ${r.campagne}` : r.bron; const v = views2[key] || 0; return `<tr><th scope="row">${esc(key)}</th><td class="num">${nf(v)}</td><td class="num">${nf(r.n)}</td><td class="num">${v ? (r.n / v * 100).toFixed(1).replace('.', ',') : '-'}</td></tr>`; }).join('')}</tbody></table></div><p class="hint">Weergaven zijn alle pagina’s die vanuit die bron zijn bezocht, niet alleen de contactpagina.</p>`; })()}</section>
<p><a class="btn-link secondary small" href="/admin/stats.csv?days=${days}">${icon('send')} Cijfers exporteren (CSV)</a></p>` });
}

/* ---- help, privacy overview, reply templates ---- */
function helpPage(ctx, { guide, shortcuts }) {
	return shell(ctx, { title: 'Help', active: 'help', body: `<div class="page-head"><div><h1>Help en sneltoetsen</h1><p class="hint">Korte uitleg in gewone taal. Bij de meeste schermen staat bovenaan ook een uitklapbare uitleg.</p></div></div>
<div class="helpgrid"><nav class="card toc" aria-label="Onderwerpen"><h2>Onderwerpen</h2><ul class="plain">${guide.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}<li><a href="#sneltoetsen">Sneltoetsen</a></li></ul></nav>
<div>${guide.map(([id, t, ps]) => `<section class="card" id="${id}"><h2>${esc(t)}</h2>${ps.map((x) => `<p>${esc(x)}</p>`).join('')}</section>`).join('')}
<section class="card" id="sneltoetsen"><h2>Sneltoetsen</h2><table><tbody>${shortcuts.map(([k, d]) => `<tr><th scope="row"><kbd>${esc(k)}</kbd></th><td>${esc(d)}</td></tr>`).join('')}</tbody></table><p class="hint">Sneltoetsen werken niet terwijl je in een invoerveld typt.</p></section><section class="card"><h2>Privacy</h2><p>Wat de website en het beheer bewaren staat in <a href="/admin/privacy-overzicht">Privacy en cookies</a>.</p></section></div></div>` });
}

module.exports = { dashboardPage, statsPage, helpPage };
