'use strict';
const { GROUPS, IMAGE_SLOTS } = require('./fields');
const { esc } = require('./views');

function shell(title, active, csrf, inner, flash) {
	const tab = (href, label, key) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><link rel="icon" href="/img/favicon.svg" type="image/svg+xml"><title>${esc(title)} | Admin</title>
<link rel="stylesheet" href="/css/admin.css"></head>
<body>
<header class="bar"><strong>Aethra admin</strong>
<nav aria-label="Admin">${csrf ? `${tab('/admin', 'Content', 'content')}${tab('/admin/photos', 'Photos', 'photos')}${tab('/admin/privacy', 'Privacy statement', 'privacy')}${tab('/admin/messages', 'Messages', 'messages')}${tab('/admin/account', 'Account', 'account')}<a href="/" target="_blank" rel="noopener">View site</a>
<form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${esc(csrf)}"><button class="link" type="submit">Log out</button></form>` : ''}</nav></header>
<main>${flash ? `<p class="flash ${flash.ok ? 'ok' : 'err'}" role="${flash.ok ? 'status' : 'alert'}">${flash.html || esc(flash.text)}</p>` : ''}${inner}</main>
</body></html>`;
}

function loginPage(flash, setupNeeded) {
	return shell('Log in', '', '', `<section class="card narrow"><h1>Log in</h1>
${setupNeeded ? '<p class="err-text">No password is set yet. Run <code>npm run set-password</code> on the server first.</p>' : ''}
<form method="post" action="/admin/login"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Log in</button></form></section>`, flash);
}

function field(f, value) {
	const id = `f-${f.key}`;
	const common = `id="${id}" name="${esc(f.key)}"`;
	const control = f.type === 'textarea'
		? `<textarea ${common} rows="3" maxlength="2000">${esc(value)}</textarea>`
		: `<input ${common} type="${f.type === 'url' ? 'url' : 'text'}" maxlength="300" value="${esc(value)}">`;
	return `<div class="row"><label for="${id}">${esc(f.label)}</label>${control}</div>`;
}

function contentPage(session, values, flash) {
	const groups = GROUPS.map((g) => `<fieldset><legend>${esc(g.title)}</legend>${g.fields.map((f) => field(f, values[f.key])).join('')}</fieldset>`).join('');
	return shell('Content', 'content', session.csrf, `<h1>Page content</h1><p class="hint">Edit the texts and save. Changes appear on the site immediately.</p>
<form method="post" action="/admin/content"><input type="hidden" name="csrf" value="${esc(session.csrf)}">${groups}<div class="sticky"><button type="submit">Save changes</button></div></form>`, flash);
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
	return shell('Photos', 'photos', session.csrf, `<h1>Photos</h1><p class="hint">Only upload images you have the right to use. AI-generated images may only be shown as atmosphere, never as the prototype itself. Remove location data (EXIF) from photos before uploading.</p>${items}`, flash);
}

function privacyPage(session, privacy, flash) {
	return shell('Privacy statement', 'privacy', session.csrf, `<h1>Privacy statement</h1>
<p class="hint">Lines starting with <code>#</code> become headings; blank lines separate paragraphs. Replace everything in [brackets] and have it reviewed before launch.</p>
<form method="post" action="/admin/privacy"><input type="hidden" name="csrf" value="${esc(session.csrf)}">
<label class="sr" for="privacy">Privacy statement</label><textarea id="privacy" name="privacy" rows="22" maxlength="20000">${esc(privacy)}</textarea>
<div class="sticky"><button type="submit">Save</button></div></form>`, flash);
}

function messagesPage(session, messages, retention, flash) {
	const rows = messages.length ? messages.map((m) => `<article class="card msg"><p class="who"><strong>${esc(m.name)}</strong> &lt;<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>&gt;</p>
<p class="meta">${esc(m.role)}${m.org ? ' · ' + esc(m.org) : ''} · ${esc(new Date(m.at).toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam' }))}</p>
<p>${esc(m.message).replace(/\n/g, '<br>')}</p>
<form method="post" action="/admin/messages/delete"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><input type="hidden" name="id" value="${esc(m.id)}"><button class="danger" type="submit">Delete</button></form></article>`).join('') : '<p class="hint">No messages yet.</p>';
	return shell('Messages', 'messages', session.csrf, `<h1>Messages</h1><p class="hint">Messages are kept here for ${retention} days and then deleted automatically. Delete them earlier on request.</p>${rows}`, flash);
}

function accountPage(session, flash) {
	return shell('Account', 'account', session.csrf, `<h1>Change password</h1>
<form method="post" action="/admin/account" class="card narrow"><input type="hidden" name="csrf" value="${esc(session.csrf)}">
<div class="row"><label for="cur">Current password</label><input id="cur" name="current" type="password" autocomplete="current-password" required></div>
<div class="row"><label for="new">New password (at least 12 characters)</label><input id="new" name="password" type="password" autocomplete="new-password" minlength="12" required></div>
<button type="submit">Change password</button></form>`, flash);
}

module.exports = { loginPage, contentPage, photosPage, privacyPage, messagesPage, accountPage };
