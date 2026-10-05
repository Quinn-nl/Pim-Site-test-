/* Aethra admin: editors (side-by-side languages, live preview, auto-save, edit locks), compliance dialog, live alarms. No dependencies. */
(() => {
	'use strict';
	const csrf = document.body.dataset.csrf || '';
	const $ = (s, r = document) => r.querySelector(s);
	const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
	const el = (tag, attrs = {}, ...kids) => {
		const n = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
		for (const k of kids) n.append(k);
		return n;
	};

	/* ---- generic ---- */
	document.addEventListener('submit', (e) => { const f = e.target; if (f && f.dataset && f.dataset.confirm && !window.confirm(f.dataset.confirm)) e.preventDefault(); });

	const setBadge = (key, n) => { for (const b of $$(`[data-badge="${key}"]`)) { b.textContent = n || ''; b.hidden = !n; } for (const k of $$(`[data-kpi="${key}"]`)) k.textContent = String(n || 0); };
	if (window.EventSource) {
		const es = new EventSource('/admin/events');
		es.addEventListener('berichten', (ev) => { try { setBadge('berichten', JSON.parse(ev.data).nieuw); } catch (e) { /* ignore */ } });
		es.addEventListener('mail', (ev) => {
			try {
				const d = JSON.parse(ev.data);
				const box = $('#alarm');
				if (d.mislukt > 0) { box.textContent = `${d.mislukt} e-mail${d.mislukt === 1 ? '' : 's'} lukt al meer dan een uur niet te versturen. Zie de mailwachtrij.`; box.hidden = false; } else box.hidden = true;
				setBadge('mail', d.mislukt);
			} catch (e) { /* ignore */ }
		});
	}

	const ed = $('#editor');
	if (!ed) return;

	/* ---- editor ---- */
	const kind = ed.dataset.kind;
	const object = ed.dataset.object;
	const id = ed.dataset.id || '';
	let version = Number(ed.dataset.version) || 0;
	let readOnly = ed.dataset.readonly === '1';
	let lockedBy = '';
	let dirty = false;
	let busy = false;
	const result = $('#result');
	const say = (kindOfMsg, text, list) => {
		result.replaceChildren();
		if (!text && !list) return;
		const box = el('div', { class: `flash ${kindOfMsg}`, role: kindOfMsg === 'err' ? 'alert' : 'status' });
		if (text) box.append(el('strong', { text }));
		if (list && list.length) box.append(el('ul', { class: 'plain' }, ...list.map((t) => el('li', { text: t }))));
		result.append(box);
	};
	const fieldEls = () => $$('[data-lang][data-key]', ed);
	const valueOf = (n) => (n.classList.contains('rte-area') ? n.innerHTML : n.value);
	const setValue = (n, v) => { if (n.classList.contains('rte-area')) n.innerHTML = v || ''; else n.value = v == null ? '' : v; };
	const layout = () => $$('#sections > .sec', ed).map((s) => ({ id: s.dataset.sid, type: s.dataset.type }));
	const collect = () => {
		const velden = {};
		for (const n of fieldEls()) {
			if (n.closest('.item.hidden')) continue; // a removed item is saved empty
			(velden[n.dataset.lang] = velden[n.dataset.lang] || {})[n.dataset.key] = valueOf(n);
		}
		for (const n of $$('.item.hidden [data-lang][data-key]', ed)) (velden[n.dataset.lang] = velden[n.dataset.lang] || {})[n.dataset.key] = '';
		const meta = kind === 'pagina' ? { indeling: layout(), status: ed.dataset.status, in_footer: !!($('[data-meta="in_footer"]') || {}).checked, indexeren: !!($('[data-meta="indexeren"]') || {}).checked, volgorde: Number(($('[data-meta="volgorde"]') || {}).value) || 0 } : undefined;
		return { kind, id, velden, meta };
	};
	const api = async (url, payload) => {
		const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(payload), credentials: 'same-origin' });
		let data = {};
		try { data = await res.json(); } catch (e) { /* not json */ }
		return { status: res.status, data };
	};
	const markDirty = () => { dirty = true; schedulePreview(); };
	ed.addEventListener('input', () => { if (!readOnly) markDirty(); });
	ed.addEventListener('change', () => { if (!readOnly) markDirty(); });
	window.addEventListener('beforeunload', (e) => { if (dirty && !readOnly) { e.preventDefault(); e.returnValue = ''; } });

	/* languages shown */
	for (const cb of $$('[data-showlang]')) cb.addEventListener('change', () => { for (const c of $$(`.fcol[data-col="${cb.dataset.showlang}"]`)) c.classList.toggle('hidden', !cb.checked); });

	/* ---- preview ---- */
	let pvTimer = null;
	const pv = (k) => $(`[data-pv="${k}"]`);
	function preview() {
		const frame = $('#pv');
		if (!frame) return;
		const form = $('#pvform');
		const c = collect();
		form.elements.csrf.value = csrf;
		form.elements.payload.value = JSON.stringify({ ...c, lang: pv('lang').value, path: pv('path') ? pv('path').value : '/' });
		frame.style.width = pv('width').value;
		form.submit();
	}
	function schedulePreview() { clearTimeout(pvTimer); pvTimer = setTimeout(preview, 700); }
	for (const k of ['lang', 'path', 'width']) if (pv(k)) pv(k).addEventListener('change', preview);
	preview();

	/* ---- rich text ---- */
	const safeUrl = (u) => /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(u.trim());
	ed.addEventListener('click', (e) => {
		const b = e.target.closest('.rte-bar button');
		if (!b || readOnly) return;
		const area = $('.rte-area', b.closest('.rte'));
		area.focus();
		const cmd = b.dataset.cmd;
		if (cmd === 'bold' || cmd === 'italic') document.execCommand(cmd);
		else if (cmd === 'h2' || cmd === 'h3') document.execCommand('formatBlock', false, cmd);
		else if (cmd === 'quote') document.execCommand('formatBlock', false, 'blockquote');
		else if (cmd === 'ul') document.execCommand('insertUnorderedList');
		else if (cmd === 'ol') document.execCommand('insertOrderedList');
		else if (cmd === 'clear') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'p'); }
		else if (cmd === 'link') {
			const u = window.prompt('Link (https://…, mailto:… of /pagina):', 'https://');
			if (u && safeUrl(u)) document.execCommand('createLink', false, u.trim()); else if (u) window.alert('Alleen http(s)-, mailto- of interne links zijn toegestaan.');
		}
		markDirty();
	});
	ed.addEventListener('paste', (e) => { const a = e.target.closest('.rte-area'); if (!a) return; e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });

	/* ---- sections (pages) ---- */
	const rules = (() => { try { return JSON.parse(ed.dataset.rules || '{}'); } catch (e) { return {}; } })();
	const sectionsBox = $('#sections', ed);
	const nextId = () => `s${Math.max(0, ...$$('#sections > .sec').map((s) => parseInt(s.dataset.sid.slice(1), 10) || 0)) + 1}`;
	const countOf = (type) => $$('#sections > .sec').filter((s) => s.dataset.type === type).length;
	function addSection(type, sid) {
		const tpl = document.getElementById(`tpl-${type}`);
		if (!tpl) return null;
		const sid2 = sid || nextId();
		const wrap = document.createElement('div');
		wrap.innerHTML = tpl.innerHTML.split('__ID__').join(sid2);
		const node = wrap.firstElementChild;
		sectionsBox.append(node);
		for (const cb of $$('[data-showlang]')) if (!cb.checked) for (const c of $$(`.fcol[data-col="${cb.dataset.showlang}"]`, node)) c.classList.add('hidden');
		return node;
	}
	if (sectionsBox) {
		const add = $('#addsec');
		if (add) add.addEventListener('click', () => {
			const type = $('#addtype').value;
			const max = (rules.max || {})[type];
			if (max && countOf(type) >= max) return window.alert('Van deze bouwsteen mag er in dit sjabloon niet meer zijn.');
			addSection(type);
			markDirty();
		});
		ed.addEventListener('click', (e) => {
			if (readOnly) return;
			const sec = e.target.closest('.sec');
			const t = e.target;
			if (t.matches('[data-sec-up]') && sec.previousElementSibling) { sec.parentNode.insertBefore(sec, sec.previousElementSibling); markDirty(); }
			else if (t.matches('[data-sec-down]') && sec.nextElementSibling) { sec.parentNode.insertBefore(sec.nextElementSibling, sec); markDirty(); }
			else if (t.matches('[data-sec-remove]')) {
				if ((rules.verplicht || []).includes(sec.dataset.type) && countOf(sec.dataset.type) <= 1) return window.alert('Deze bouwsteen is verplicht in dit sjabloon.');
				if (window.confirm('Deze bouwsteen verwijderen?')) { sec.remove(); markDirty(); }
			} else if (t.matches('[data-item-add]')) {
				const hidden = $('.item.hidden', sec);
				if (hidden) hidden.classList.remove('hidden'); else window.alert('Het maximum is bereikt.');
			} else if (t.matches('[data-item-clear]')) {
				const item = t.closest('.item');
				for (const n of $$('[data-lang][data-key]', item)) setValue(n, '');
				if (item.dataset.item !== '1') item.classList.add('hidden');
				markDirty();
			}
		});
	}
	function applyLayout(indeling) {
		if (!sectionsBox) return;
		const wanted = new Set(indeling.map((s) => s.id));
		for (const s of $$('#sections > .sec')) if (!wanted.has(s.dataset.sid)) s.remove();
		for (const s of indeling) {
			let node = $(`#sections > .sec[data-sid="${s.id}"]`);
			if (!node) node = addSection(s.type, s.id);
			if (node) sectionsBox.append(node); // appending in order sorts them
		}
	}
	function applyValues(velden) {
		for (const n of fieldEls()) {
			const v = (velden[n.dataset.lang] || {})[n.dataset.key];
			if (v != null) setValue(n, v);
			const item = n.closest('.item');
			if (item && v && String(v).trim()) item.classList.remove('hidden');
		}
	}

	/* ---- read-only (reader role, or someone else has the lock) ---- */
	const lockBanner = $('#lockbanner');
	function setReadOnly(on, who) {
		readOnly = on;
		lockedBy = who || '';
		for (const n of $$('input, select, textarea, button', ed)) if (!n.matches('[data-showlang]')) n.disabled = on;
		for (const n of $$('.rte-area', ed)) n.setAttribute('contenteditable', on ? 'false' : 'true');
		for (const b of $$('#btn-save, #btn-publish, #btn-unpublish, #addsec, #addtype, [data-reviewed]')) b.disabled = on;
		if (lockBanner) {
			lockBanner.hidden = !who;
			lockBanner.textContent = who ? `${who} is deze pagina momenteel aan het bewerken. Je kunt meekijken; opslaan kan pas als diegene klaar is.` : '';
		}
	}
	if (readOnly) setReadOnly(true, '');

	/* ---- edit lock over a WebSocket ---- */
	let socket = null;
	let hb = null;
	let wantReload = false;
	function connect() {
		if (readOnly && !lockedBy) return; // a reader never claims a lock
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		try { socket = new WebSocket(`${proto}://${location.host}/admin/ws`); } catch (e) { return; }
		socket.addEventListener('open', () => { socket.send(JSON.stringify({ t: 'lock', object })); clearInterval(hb); hb = setInterval(() => { if (socket.readyState === 1) socket.send(JSON.stringify({ t: 'hb', object })); }, 30000); });
		socket.addEventListener('message', (ev) => {
			let m;
			try { m = JSON.parse(ev.data); } catch (e) { return; }
			if (m.t === 'lock' && m.object === object) {
				if (m.ok) { if (lockedBy) { wantReload = true; } setReadOnly(false, ''); if (wantReload && !dirty) location.reload(); }
				else if (!m.lezer) setReadOnly(true, m.zelf ? 'Jij zelf, in een ander tabblad,' : m.door || 'Iemand anders');
			} else if (m.t === 'locks' && lockedBy && !m.locks[object]) socket.send(JSON.stringify({ t: 'lock', object })); // the lock was released: try to take it
		});
		socket.addEventListener('close', () => { clearInterval(hb); setTimeout(connect, 3000); });
	}
	connect();
	window.addEventListener('pagehide', () => { try { if (socket && socket.readyState === 1) socket.send(JSON.stringify({ t: 'unlock', object })); } catch (e) { /* closing */ } });

	/* ---- saving ---- */
	const clearMarks = () => { for (const n of $$('.has-error', ed)) n.classList.remove('has-error'); };
	function markErrors(list) {
		for (const f of list || []) { if (!f.taal || !f.veld) continue; for (const n of $$(`[data-lang="${f.taal}"][data-key="${f.veld}"]`, ed)) n.classList.add('has-error'); }
	}
	function dialog(title, intro, items, withReason) {
		return new Promise((resolve) => {
			const d = el('dialog', { class: 'dlg', 'aria-labelledby': 'dlg-t' });
			const reason = withReason ? el('textarea', { rows: '3', maxlength: '500', 'aria-label': 'Reden', placeholder: 'Waarom publiceer je dit toch? (minstens 10 tekens, komt in het auditlog)' }) : null;
			const ok = el('button', { type: 'button', text: withReason ? 'Toch publiceren' : 'Sluiten' });
			const cancel = el('button', { type: 'button', class: 'secondary', text: 'Annuleren' });
			d.append(el('h2', { id: 'dlg-t', text: title }), el('p', { text: intro }), el('ul', { class: 'plain' }, ...items.map((t) => el('li', { text: t }))));
			if (reason) d.append(reason);
			d.append(el('div', { class: 'actions' }, ok, ...(withReason ? [cancel] : [])));
			document.body.append(d);
			const done = (v) => { d.close(); d.remove(); resolve(v); };
			ok.addEventListener('click', () => { if (withReason && reason.value.trim().length < 10) { reason.classList.add('has-error'); reason.focus(); return; } done(withReason ? reason.value.trim() : true); });
			cancel.addEventListener('click', () => done(null));
			d.addEventListener('cancel', () => done(null));
			d.showModal();
		});
	}
	const lines = (list) => (list || []).map((f) => `${f.taal ? f.taal.toUpperCase() + (f.veld ? ' · ' + f.veld : '') + ': ' : ''}${f.melding || f}`);

	async function save(status, overrideReason) {
		if (busy || readOnly) return;
		busy = true;
		clearMarks();
		const c = collect();
		if (kind === 'pagina' && status) c.meta.status = status;
		const payload = { ...c, baseVersie: version, override_reason: overrideReason || undefined };
		let r;
		try { r = await api(overrideReason ? '/admin/publish/override' : '/admin/publish', payload); } catch (e) { busy = false; return say('err', 'Geen verbinding. Er is niets opgeslagen.'); }
		busy = false;
		const d = r.data || {};
		if (r.status === 200 && d.ok) {
			version = d.versie;
			ed.dataset.version = String(version);
			dirty = false;
			say('ok', `Opgeslagen (versie ${version}).`, lines(d.notes));
			if (kind === 'pagina' && status && status !== ed.dataset.status) { location.reload(); return; }
			preview();
		} else if (r.status === 422) {
			markErrors(d.fouten);
			say('err', 'Niet opgeslagen: dit mag zo niet worden gepubliceerd.', lines(d.fouten && d.fouten.length ? d.fouten : [d.melding]));
		} else if (r.status === 409 && d.waarschuwingen) {
			const reason = await dialog('Waarschuwingen bij publiceren', 'Deze punten zijn geen harde fout, maar controleer ze. Je kunt toch publiceren met een reden; die wordt vastgelegd.', lines(d.waarschuwingen), true);
			if (reason) return save(status, reason);
			markErrors(d.waarschuwingen);
			say('err', 'Niet gepubliceerd.', lines(d.waarschuwingen));
		} else if (r.status === 409) {
			say('err', d.melding || 'Iemand anders heeft ondertussen opgeslagen.');
			result.append(el('p', {}, el('button', { type: 'button', text: 'Pagina herladen', id: 'reload-now' })));
			$('#reload-now').addEventListener('click', () => { dirty = false; location.reload(); });
		} else if (r.status === 423) { say('err', d.melding || 'Iemand anders is aan het bewerken.'); }
		else if (r.status === 401) { say('err', 'Je bent uitgelogd. Log in een ander tabblad opnieuw in; je invoer blijft hier staan.'); }
		else say('err', d.melding || 'Opslaan is niet gelukt.');
	}
	const bind = (idn, fn) => { const b = document.getElementById(idn); if (b) b.addEventListener('click', fn); };
	bind('btn-save', () => save(kind === 'pagina' ? ed.dataset.status : undefined));
	bind('btn-publish', () => save('gepubliceerd'));
	bind('btn-unpublish', () => { if (window.confirm('Deze pagina offline halen? Hij blijft als concept bewaard.')) save('concept'); });
	for (const b of $$('[data-reviewed]')) b.addEventListener('click', async () => {
		if (dirty) return window.alert('Sla eerst je wijzigingen op.');
		const r = await api('/admin/api/nagekeken', { kind, id, taal: b.dataset.reviewed });
		if (r.data && r.data.ok) location.reload(); else say('err', 'Markeren is niet gelukt.');
	});

	/* ---- auto-save (a shadow draft, never public) and a live check ---- */
	const draftBanner = $('#draftbanner');
	let draft = null;
	try { draft = JSON.parse(ed.dataset.draft || 'null'); } catch (e) { draft = null; }
	if (draft && draft.data && !readOnly) {
		$('#draftwhen').textContent = new Date(draft.bijgewerkt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
		draftBanner.hidden = false;
		$('#draftrestore').addEventListener('click', () => { if (draft.data.meta && draft.data.meta.indeling) applyLayout(draft.data.meta.indeling); applyValues(draft.data.velden || {}); draftBanner.hidden = true; markDirty(); });
		$('#draftdiscard').addEventListener('click', async () => { draftBanner.hidden = true; await api('/admin/api/concept-weg', { kind, id }); });
	}
	let lastSaved = '';
	setInterval(async () => {
		if (!dirty || readOnly) return;
		const c = collect();
		const snap = JSON.stringify({ v: c.velden, m: c.meta });
		if (snap === lastSaved) return;
		const r = await api('/admin/auto-save', { object, data: { velden: c.velden, meta: c.meta }, basisVersie: version });
		if (r.data && r.data.ok) {
			lastSaved = snap;
			const note = $('#autosave') || result.appendChild(el('p', { id: 'autosave', class: 'hint' }));
			note.textContent = `Concept bewaard om ${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}.`;
		}
		const chk = await api('/admin/api/check', { kind, id, velden: c.velden, meta: c.meta });
		if (chk.data && chk.data.ok && !result.querySelector('.flash')) {
			const all = [...(chk.data.fouten || []), ...(chk.data.waarschuwingen || [])];
			if (all.length) say('', 'Controle voor het publiceren:', lines(all));
		}
	}, 30000);
})();
