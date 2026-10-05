'use strict';
/** Sign-in, password reset and two-step screens. */
const { esc, asset } = require('../../views');
const { icon, shell } = require('./common');

/* ---- sign in ---- */
function loginPage(ctx, { flash, setup } = {}) {
	return shell({ ...ctx, session: null, flash }, { title: 'Inloggen', body: `<section class="card narrow"><h1>Inloggen</h1>
${setup ? '<p class="err-text">Er is nog geen account. Maak het eerste account op de server met <code>npm run user:create -- --email=jij@voorbeeld.nl --naam="Jouw naam"</code>.</p>' : ''}
<form method="post" action="/admin/login"><div class="row"><label for="em">E-mailadres</label><input id="em" name="email" type="email" autocomplete="username" required autofocus></div><div class="row"><label for="pw">Wachtwoord</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div><button type="submit">Inloggen</button></form><p class="hint"><a href="/admin/vergeten">Wachtwoord vergeten?</a></p></section>`, script: false });
}
function forgotPage(ctx, { flash, done } = {}) {
	return shell({ ...ctx, session: null, flash }, { title: 'Wachtwoord vergeten', body: `<section class="card narrow"><h1>Wachtwoord vergeten</h1>${done ? '<p>Als dit e-mailadres bij een account hoort, is er een mail met een link gestuurd. De link is een uur geldig. Geen mail binnen een paar minuten? Vraag een beheerder om een herstellink.</p><p><a href="/admin">Terug naar inloggen</a></p>' : `<p class="hint">Vul je e-mailadres in. Je krijgt een link om een nieuw wachtwoord te kiezen.</p><form method="post" action="/admin/vergeten"><div class="row"><label for="fe">E-mailadres</label><input id="fe" name="email" type="email" autocomplete="username" required autofocus></div><button type="submit">Stuur een link</button></form><p class="hint"><a href="/admin">Terug naar inloggen</a></p>`}</section>`, script: false });
}
function resetPage(ctx, { token, user, invalid, flash, passkeys = false } = {}) {
	if (invalid) return shell({ ...ctx, session: null, flash }, { title: 'Link verlopen', body: '<section class="card narrow"><h1>Deze link werkt niet meer</h1><p>De link is al gebruikt of verlopen. Vraag een nieuwe aan via “Wachtwoord vergeten” of bij een beheerder.</p><p><a href="/admin/vergeten">Nieuwe link aanvragen</a></p></section>', script: false });
	const invite = user.token_soort === 'uitnodiging';
	return shell({ ...ctx, session: null, flash }, { title: invite ? 'Welkom' : 'Nieuw wachtwoord', body: `<section class="card narrow"><h1>${invite ? `Welkom, ${esc(user.naam)}` : 'Nieuw wachtwoord'}</h1><p class="hint">${invite ? 'Kies een wachtwoord om te beginnen.' : `Kies een nieuw wachtwoord voor ${esc(user.email)}.`} Minstens 12 tekens; een zin van een paar woorden werkt het best.</p>
<form method="post" action="/admin/herstel"><input type="hidden" name="token" value="${esc(token)}"><div class="row"><label for="rp">Nieuw wachtwoord</label><input id="rp" name="password" type="password" autocomplete="new-password" minlength="12" required autofocus></div><div class="row"><label for="rp2">Nog een keer</label><input id="rp2" name="password2" type="password" autocomplete="new-password" minlength="12" required></div>
${user.totp_geheim && !invite ? `<div class="row"><label for="rc">Code uit je authenticator-app (of een herstelcode)</label><input id="rc" name="code" autocomplete="one-time-code"${passkeys ? '' : ' required'}></div>` : ''}${passkeys && !invite ? `<input type="hidden" name="passkey" id="pk-cred"><div class="pk-login" data-passkey-reset data-token="${esc(token)}"><p class="hint">${user.totp_geheim ? 'Of bevestig' : 'Bevestig'} met je beveiligingssleutel:</p><button type="button" class="secondary" id="pk-go">${icon('lock')} Beveiligingssleutel gebruiken</button><p id="pk-ok" class="ok-text" hidden>Gelukt: sleutel bevestigd.</p><p class="err-text" id="pk-err" role="alert" hidden></p></div>` : ''}<button type="submit">Wachtwoord instellen</button></form></section>`, script: false, scripts: passkeys && !invite ? ['/js/passkey.js'] : [] });
}
function codePage(ctx, ticket, flash, how = { totp: true, passkeys: false }) {
	return shell({ ...ctx, session: null, flash }, { title: 'Verificatie', scripts: how.passkeys ? ['/js/passkey.js'] : [], body: `<section class="card narrow"><h1>Tweestapsverificatie</h1>
${how.passkeys ? `<div class="pk-login" data-passkey-login data-ticket="${esc(ticket)}"><p class="hint">Gebruik je beveiligingssleutel, passkey of vingerafdruk.</p><button type="button" id="pk-go">${icon('lock')} Inloggen met passkey</button><p class="err-text" id="pk-err" role="alert" hidden></p></div>` : ''}
${how.totp ? `${how.passkeys ? '<p class="hint">Of gebruik een code:</p>' : '<p class="hint">Vul de 6-cijferige code uit je authenticator-app in, of een van je herstelcodes.</p>'}
<form method="post" action="/admin/login/code"><input type="hidden" name="ticket" value="${esc(ticket)}"><div class="row"><label for="code">Code</label><input id="code" name="code" type="text" autocomplete="one-time-code" autocapitalize="none" required${how.passkeys ? '' : ' autofocus'}></div><button type="submit"${how.passkeys ? ' class="secondary"' : ''}>Bevestigen</button></form>` : ''}</section>`, script: false });
}


module.exports = { loginPage, forgotPage, resetPage, codePage };
