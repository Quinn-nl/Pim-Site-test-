/* Passkeys (WebAuthn) in the browser: sign in, confirm a password reset, add a key. No data leaves except to our own server. */
(function () {
	'use strict';
	const $ = (s, r = document) => r.querySelector(s);
	const b64uToBuf = (s) => { const p = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4)); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; };
	const bufToB64u = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
	const supported = !!(window.PublicKeyCredential && navigator.credentials);
	const post = (url, body, headers) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...(headers || {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
	const csrf = () => document.body.dataset.csrf;
	const say = (el, text) => { if (!el) return; el.textContent = text; el.hidden = !text; };

	function requestOptions(pk) {
		return { ...pk, challenge: b64uToBuf(pk.challenge), allowCredentials: (pk.allowCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) };
	}
	async function getAssertion(pk) {
		const cred = await navigator.credentials.get({ publicKey: requestOptions(pk) });
		return { id: cred.id, response: { clientDataJSON: bufToB64u(cred.response.clientDataJSON), authenticatorData: bufToB64u(cred.response.authenticatorData), signature: bufToB64u(cred.response.signature) } };
	}
	const nice = (e) => (e && (e.name === 'SecurityError' || /invalid domain/i.test(e.message || '')) ? 'Passkeys werken niet op dit adres. Open het beheer via de echte domeinnaam van de website (met https), niet via een IP-adres of tijdelijk adres.' : e && e.name === 'NotAllowedError' ? 'Geannuleerd of verlopen. Probeer het opnieuw.' : (e && e.message) || 'Er ging iets mis met de beveiligingssleutel.');

	// 1. sign in
	const login = $('[data-passkey-login]');
	if (login) {
		const btn = $('#pk-go'); const err = $('#pk-err');
		if (!supported) { btn.disabled = true; say(err, 'Deze browser ondersteunt geen passkeys. Gebruik de code.'); }
		btn.addEventListener('click', async () => {
			say(err, ''); btn.disabled = true;
			try {
				const ticket = login.dataset.ticket;
				const o = await post('/admin/login/passkey/opties', { ticket });
				if (!o.data.ok) throw new Error(o.data.melding);
				const credential = await getAssertion(o.data.publicKey);
				const r = await post('/admin/login/passkey', { ticket, credential });
				if (!r.data.ok) throw new Error(r.data.melding);
				location.href = r.data.redirect || '/admin';
			} catch (e) { say(err, nice(e)); btn.disabled = false; }
		});
	}

	// 2. confirm a password reset
	const reset = $('[data-passkey-reset]');
	if (reset) {
		const btn = $('#pk-go'); const err = $('#pk-err');
		btn.addEventListener('click', async () => {
			say(err, ''); btn.disabled = true;
			try {
				const o = await post('/admin/herstel/passkey/opties', { token: reset.dataset.token });
				if (!o.data.ok) throw new Error(o.data.melding);
				const credential = await getAssertion(o.data.publicKey);
				$('#pk-cred').value = JSON.stringify(credential);
				$('#pk-ok').hidden = false;
			} catch (e) { say(err, nice(e)); }
			btn.disabled = false;
		});
	}

	// 3. add a key (account page)
	const add = $('[data-passkey-add]');
	if (add) {
		const err = $('#pk-add-err');
		if (!supported) { add.querySelector('button').disabled = true; say(err, 'Deze browser ondersteunt geen passkeys.'); }
		add.addEventListener('submit', async (e) => {
			e.preventDefault(); say(err, '');
			const btn = add.querySelector('button'); btn.disabled = true;
			try {
				const o = await post('/admin/passkeys/opties', { huidig: $('[name=huidig]', add).value }, { 'x-csrf-token': csrf() });
				if (!o.data.ok) throw new Error(o.data.melding);
				const pk = o.data.publicKey;
				const cred = await navigator.credentials.create({ publicKey: { ...pk, challenge: b64uToBuf(pk.challenge), user: { ...pk.user, id: b64uToBuf(pk.user.id) }, excludeCredentials: (pk.excludeCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) } });
				const r = await post('/admin/passkeys/registreren', { naam: $('[name=naam]', add).value, credential: { id: cred.id, response: { clientDataJSON: bufToB64u(cred.response.clientDataJSON), attestationObject: bufToB64u(cred.response.attestationObject) } } }, { 'x-csrf-token': csrf() });
				if (!r.data.ok) throw new Error(r.data.melding);
				location.href = '/admin/account?f=passkeyok';
			} catch (e2) { say(err, nice(e2)); btn.disabled = false; }
		});
	}
})();
