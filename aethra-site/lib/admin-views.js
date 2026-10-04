'use strict';
const { GROUPS, IMAGE_SLOTS } = require('./fields');
const { LANGS, LANG_NAMES } = require('./i18n');
const { esc } = require('./views');
const store = require('./store');
const { qrSvg } = require('./qr');

const nf = (n) => new Intl.NumberFormat('en-GB').format(n);

function shell(title, active, csrf, inner, flash) {
	const tab = (href, label, key) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><link rel="icon" href="/img/favicon.svg" type="image/svg+xml"><title>${esc(title)} | Admin</title>
<link rel="stylesheet" href="/css/design-tokens.css"><link rel="stylesheet" href="/css/admin.css"></head>
<body>
<header class="bar"><strong>Aethra admin</strong>
<nav aria-label="Admin">${csrf ? `${tab('/admin', 'Content', 'content')}${tab('/admin/photos', 'Photos', 'photos')}${tab('/admin/privacy', 'Privacy statement', 'privacy')}${tab('/admin/stats', 'Statistics', 'stats')}${tab('/admin/messages', `Messages${store.unreadCount() ? ` <span class="badge" aria-label="${store.unreadCount()} unread">${store.unreadCount()}</span>` : ''}`, 'messages')}${tab('/admin/account', 'Account', 'account')}<a href="/" target="_blank" rel="noopener">View site</a>
<form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${esc(csrf)}"><button class="link" type="submit">Log out</button></form>` : ''}</nav></header>
<main>${flash ? `<p class="flash ${flash.ok ? 'ok' : 'err'}" role="${flash.ok ? 'status' : 'alert'}">${flash.html || esc(flash.text)}</p>` : ''}${inner}</main>
</body></html>`;
}

function loginPage(flash, setupNeeded) {
	return shell('Log in', '', '', `<section class="card narrow"><h1>Log in</h1>
${setupNeeded ? '<p class="err-text">No password is set yet. Run <code>npm run set-password</code> on the server first.</p>' : ''}
<form method="post" action="/admin/login"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Log in</button></form></section>`, flash);
}

function codePage(ticket, flash) {
	return shell('Verification', '', '', `<section class="card narrow"><h1>Two-step verification</h1>
<p class="hint">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
<form method="post" action="/admin/login/code"><input type="hidden" name="ticket" value="${esc(ticket)}"><label for="code">Code</label><input id="code" name="code" type="text" inputmode="text" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" required autofocus><button type="submit">Verify</button></form></section>`, flash);
}

function field(f, value) {
	const id = `f-${f.key}`;
	const common = `id="${id}" name="${esc(f.key)}"`;
	const control = f.type === 'textarea'
		? `<textarea ${common} rows="3" maxlength="2000">${esc(value)}</textarea>`
		: `<input ${common} type="${f.type === 'url' ? 'url' : 'text'}" maxlength="300" value="${esc(value)}">`;
	return `<div class="row"><label for="${id}">${esc(f.label)}</label>${control}</div>`;
}

function langTabs(base, lang) {
	return `<nav class="tabs" aria-label="Language">${LANGS.map((l) => `<a href="${base}?lang=${l}"${l === lang ? ' aria-current="page"' : ''}>${esc(LANG_NAMES[l])}</a>`).join('')}</nav>`;
}

function contentPage(session, lang, values, flash) {
	const groups = GROUPS.map((g) => `<fieldset><legend>${esc(g.title)}</legend>${g.fields.map((f) => field(f, values[f.key])).join('')}</fieldset>`).join('');
	return shell('Content', 'content', session.csrf, `<h1>Page content</h1><p class="hint">Edit the texts per language and save. Changes appear on the site immediately. Visitors see the language of their browser, and can switch.</p>${langTabs('/admin', lang)}
<form method="post" action="/admin/content"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><input type="hidden" name="lang" value="${esc(lang)}">${groups}<div class="sticky"><button type="submit">Save changes</button></div></form>`, flash);
}

function photosPage(session, images, flash) {
	const items = IMAGE_SLOTS.map(({ slot, label }) => {
		const img = images[slot];
		return `<fieldset><legend>${esc(label)}</legend>
${img ? `<img class="preview" src="/uploads/${esc(img.file)}" alt="">` : '<p class="hint">No photo yet. The section shows without one.</p>'}
<form method="post" action="/admin/photos" enctype="multipart/form-data">
<input type="hidden" name="csrf" value="${esc(session.csrf)}"><input type="hidden" name="slot" value="${esc(slot)}">
<div class="row"><label for="file-${slot}">Upload JPG, PNG or WebP (max 5 MB)</label><input id="file-${slot}" type="file" name="file" accept="image/jpeg,image/png,image/webp"></div>
<div class="row"><label for="alt-${slot}">Description for screen readers (leave empty if purely decorative)</label><input id="alt-${slot}" name="alt" maxlength="200" value="${esc(img ? img.alt : '')}"></div>
<button type="submit" name="action" value="save">Save photo</button>${img ? ' <button type="submit" name="action" value="remove" class="danger">Remove</button>' : ''}
</form></fieldset>`;
	}).join('');
	return shell('Photos', 'photos', session.csrf, `<h1>Photos</h1><p class="hint">Only upload images you have the right to use. AI-generated images may only be shown as atmosphere, never as the prototype itself. Location data and other metadata are removed from uploaded photos automatically. Use photos about 2000 px wide (1200 x 630 for the sharing image); very large files make the site slower.</p>${items}`, flash);
}

function privacyPage(session, lang, privacy, flash) {
	return shell('Privacy statement', 'privacy', session.csrf, `<h1>Privacy statement</h1>
<p class="hint">Lines starting with <code>#</code> become headings; blank lines separate paragraphs. Replace everything in [brackets] and have it reviewed before launch.</p>
${langTabs('/admin/privacy', lang)}
<form method="post" action="/admin/privacy"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><input type="hidden" name="lang" value="${esc(lang)}">
<label class="sr" for="privacy">Privacy statement</label><textarea id="privacy" name="privacy" rows="22" maxlength="20000">${esc(privacy)}</textarea>
<div class="sticky"><button type="submit">Save</button></div></form>`, flash);
}

function messagesPage(session, messages, retention, flash, pager = { page: 1, pages: 1, total: messages.length }) {
	const rows = messages.length ? messages.map((m) => `<article class="card msg"><p class="who"><strong>${esc(m.name)}</strong> &lt;<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>&gt;</p>
<p class="meta">${esc(m.role)}${m.source && m.source !== 'direct' ? ' · ' + esc(m.source) + (m.campaign ? ' / ' + esc(m.campaign) : '') : ''}${m.lang ? ' · ' + esc(String(m.lang).toUpperCase()) : ''}${m.org ? ' · ' + esc(m.org) : ''} · ${esc(new Date(m.at).toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam' }))}</p>
<p>${esc(m.message).replace(/\n/g, '<br>')}</p>
<form method="post" action="/admin/messages/delete"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><input type="hidden" name="id" value="${esc(m.id)}"><button class="danger" type="submit">Delete</button></form></article>`).join('') : '<p class="hint">No messages yet.</p>';
	return shell('Messages', 'messages', session.csrf, `<h1>Messages${pager.total ? ` <span class="count">(${nf(pager.total)})</span>` : ''}</h1><p class="hint">Messages are kept here for ${retention} days and then deleted automatically. Delete them earlier on request. <a href="/admin/messages.csv">Download as CSV</a></p>${rows}${pager.pages > 1 ? `<nav class="tabs" aria-label="Pages">${pager.page > 1 ? `<a href="/admin/messages?page=${pager.page - 1}">Newer</a>` : ''}<span class="hint">Page ${pager.page} of ${pager.pages}</span>${pager.page < pager.pages ? `<a href="/admin/messages?page=${pager.page + 1}">Older</a>` : ''}</nav>` : ''}`, flash);
}

function table(headers, rows, empty) {
	if (!rows.length) return `<p class="hint">${esc(empty)}</p>`;
	return `<div class="scroll"><table><thead><tr>${headers.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="num">${esc(typeof c === 'number' ? nf(c) : c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function chart(sum) {
	const w = 720, h = 140, max = Math.max(1, ...sum.perDay), n = sum.perDay.length, gap = 2, bw = Math.max(2, (w - gap * (n - 1)) / n);
	const bars = sum.perDay.map((v, i) => { const bh = Math.round((v / max) * (h - 8)); return `<rect class="bar-rect" x="${(i * (bw + gap)).toFixed(1)}" y="${h - bh}" width="${bw.toFixed(1)}" height="${Math.max(bh, v ? 1 : 0)}"><title>${esc(sum.days[i])}: ${v}</title></rect>`; }).join('');
	return `<svg class="chart" viewBox="0 0 ${w} ${h + 18}" role="img" aria-label="Page views per day, peak ${max}"><text x="0" y="10" class="axis">${max}</text>${bars}<text x="0" y="${h + 14}" class="axis">${esc(sum.days[0])}</text><text x="${w}" y="${h + 14}" class="axis" text-anchor="end">${esc(sum.days[n - 1])}</text></svg>`;
}

function statsPage(session, sum, days) {
	const top = (obj, limit = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limit);
	const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
	const ranges = [7, 30, 90].map((d) => `<a href="/admin/stats?days=${d}"${d === days ? ' aria-current="page"' : ''}>${d} days</a>`).join('');
	return shell('Statistics', 'stats', session.csrf, `<h1>Statistics</h1>
<p class="hint">Anonymous page views, counted without cookies or IP addresses. Visitors who send Do Not Track are not counted, and unique visitors cannot be measured. Use these numbers for trends, not exact counts.</p>
<nav class="tabs" aria-label="Period">${ranges}</nav>
<div class="kpis">
<div class="kpi"><span class="kpi-v">${nf(sum.views)}</span><span>Page views</span></div>
<div class="kpi"><span class="kpi-v">${nf(sum.contactViews)}</span><span>Contact page views</span></div>
<div class="kpi"><span class="kpi-v">${nf(sum.sent)}</span><span>Messages sent</span></div>
<div class="kpi"><span class="kpi-v">${pct(sum.sent, sum.contactViews)}</span><span>Contact page to message</span></div>
</div>
<section class="card"><h2>Page views per day</h2>${chart(sum)}</section>
<section class="card"><h2>Top pages</h2>${table(['Page', 'Views'], top(sum.pages).map(([k, v]) => [k, v]), 'No views yet.')}</section>
<section class="card"><h2>Where visitors come from</h2>${table(['Source / campaign', 'Views'], top(sum.sources).map(([k, v]) => [k, v]), 'No views yet.')}
<p class="hint">Tag your links to see campaigns here, for example <code>https://your-site.example/en/?utm_source=linkedin&amp;utm_campaign=launch</code>. The tags stay attached while a visitor browses, so messages are credited to the right campaign (see the CSV export).</p></section>
<section class="card"><h2>Language</h2>${table(['Language', 'Views'], top(sum.langs).map(([k, v]) => [k.toUpperCase(), v]), 'No views yet.')}</section>
<section class="card"><h2>Messages by role</h2>${table(['Role', 'Messages'], top(sum.roles).map(([k, v]) => [k, v]), 'No messages in this period.')}</section>`);
}

function accountPage(session, flash, tf = {}) {
	const csrf = `<input type="hidden" name="csrf" value="${esc(session.csrf)}">`;
	let two;
	if (tf.codes) {
		two = `<section class="card narrow"><h2>Recovery codes</h2><p class="hint">Two-step verification is on. Save these codes somewhere safe (a password manager or printed). Each works once if you lose your phone. They are shown only now.</p>
<ul class="codes">${tf.codes.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul></section>`;
	} else if (tf.setup) {
		two = `<section class="card narrow"><h2>Set up two-step verification</h2>
<ol class="hint"><li>Open an authenticator app on your phone (for example Google Authenticator, Microsoft Authenticator or your password manager) and choose to add an account.</li>
<li>Scan this QR code.<div class="qr-wrap">${qrSvg(tf.setup.uri, 'QR code to add the Aethra admin account to an authenticator app')}</div>
<details class="alt"><summary>Cannot scan it?</summary><p>Choose "enter a key" in the app (time-based) and type: <code class="key">${esc(tf.setup.secret.replace(/(.{4})/g, '$1 ').trim())}</code> On a phone you can also <a href="${esc(tf.setup.uri)}">open it directly in your app</a>.</p></details></li>
<li>Enter the 6-digit code the app now shows to confirm.</li></ol>
<form method="post" action="/admin/2fa/confirm">${csrf}<div class="row"><label for="c2">Code from the app</label><input id="c2" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" required></div><button type="submit">Turn on</button></form></section>`;
	} else if (tf.enabled) {
		two = `<section class="card narrow"><h2>Two-step verification</h2><p class="ok-text">Two-step verification is on. Logging in needs your password and a code from your authenticator app. You have ${tf.left} recovery code${tf.left === 1 ? '' : 's'} left for emergencies.</p>
<p class="hint">To turn it off, enter your password and a code from the app.</p>
<form method="post" action="/admin/2fa/disable">${csrf}<div class="row"><label for="dp">Current password</label><input id="dp" name="current" type="password" autocomplete="current-password" required></div>
<div class="row"><label for="dc">Code from the app</label><input id="dc" name="code" autocomplete="one-time-code" required></div><button type="submit">Turn off</button></form></section>`;
	} else {
		two = `<section class="card narrow"><h2>Two-step verification</h2><p class="hint">Two-step verification is off. Turning it on is strongly recommended: a stolen password alone then no longer gives access to the admin panel.</p>
<form method="post" action="/admin/2fa/start">${csrf}<button type="submit">Set up</button></form></section>`;
	}
	return shell('Account', 'account', session.csrf, `<h1>Change password</h1>
<form method="post" action="/admin/account" class="card narrow">${csrf}
<div class="row"><label for="cur">Current password</label><input id="cur" name="current" type="password" autocomplete="current-password" required></div>
<div class="row"><label for="new">New password (at least 12 characters)</label><input id="new" name="password" type="password" autocomplete="new-password" minlength="12" required></div>
<button type="submit">Change password</button></form>${two}`, flash);
}

module.exports = { codePage, statsPage, loginPage, contentPage, photosPage, privacyPage, messagesPage, accountPage };
