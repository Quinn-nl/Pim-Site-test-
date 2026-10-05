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
	const ICON = (name) => { const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); n.setAttribute('class', 'i'); n.setAttribute('aria-hidden', 'true'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', `#i-${name}`); n.append(u); return n; };
	function toast(text, kind) {
		const box = $('#toasts');
		if (!box) return;
		const t = el('div', { class: `toast${kind === 'err' ? ' err' : ''}` }, ICON(kind === 'err' ? 'alert' : 'check'), el('span', { text }));
		box.append(t);
		setTimeout(() => t.remove(), kind === 'err' ? 8000 : 3500); // transient messages disappear by themselves
	}
	window.aethraToast = toast;
	const toggle = $('#navtoggle');
	const setNav = (open) => { const side = $('#side'); side.dataset.open = String(open); document.body.classList.toggle('nav-open', open); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen'); };
	if (toggle) {
		toggle.addEventListener('click', () => setNav($('#side').dataset.open !== 'true'));
		document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#side').dataset.open === 'true') { setNav(false); toggle.focus(); } });
		document.addEventListener('click', (e) => { if ($('#side').dataset.open === 'true' && !e.target.closest('#side') && !e.target.closest('#navtoggle')) setNav(false); });
	}
	for (const f of $$('main > .flash.ok')) { toast(f.textContent.trim()); f.remove(); } // a confirmation after a redirect becomes a short toast
	document.addEventListener('submit', (e) => { const f = e.target; if (f && f.dataset && f.dataset.confirm && !window.confirm(f.dataset.confirm)) e.preventDefault(); });

	const setBadge = (key, n) => { for (const b of $$(`[data-badge="${key}"]`)) { b.textContent = n || ''; b.hidden = !n; } for (const k of $$(`[data-kpi="${key}"]`)) k.textContent = String(n || 0); };
	if (window.EventSource) {
		const es = new EventSource('/admin/events');
		let lastNew = null;
		es.addEventListener('berichten', (ev) => {
			try {
				const n = JSON.parse(ev.data).nieuw;
				setBadge('berichten', n);
				if (lastNew !== null && n > lastNew) { const live = $('#live'); if (live) live.textContent = `${n} nieuwe bericht${n === 1 ? '' : 'en'}`; toast(`Nieuw bericht binnengekomen (${n} ongelezen)`); }
				lastNew = n;
			} catch (e) { /* ignore */ }
		});
		es.addEventListener('mail', (ev) => {
			try {
				const d = JSON.parse(ev.data);
				const box = $('#alarm');
				if (d.mislukt > 0) { box.textContent = `${d.mislukt} e-mail${d.mislukt === 1 ? '' : 's'} lukt al meer dan een uur niet te versturen. Zie de mailwachtrij.`; box.hidden = false; } else box.hidden = true;
				setBadge('mail', d.mislukt);
			} catch (e) { /* ignore */ }
		});
	}

	const filter = $('[data-filter]');
	if (filter) filter.addEventListener('input', () => {
		const q = filter.value.trim().toLowerCase();
		let any = false;
		for (const g of $$('[data-filter-group]')) {
			let shown = 0;
			for (const it of $$('[data-filter-item]', g)) { const hit = !q || it.dataset.filterItem.includes(q); it.classList.toggle('hidden', !hit); if (hit) shown += 1; }
			g.classList.toggle('hidden', q !== '' && shown === 0);
			if (shown || !q) any = true;
		}
		const none = $('#nofilter'); if (none) none.classList.toggle('hidden', any);
	});

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
	const savestate = $('#savestate');
	const setState = (state, text) => { if (savestate) { savestate.dataset.state = state; savestate.textContent = text; } };
	const clock = () => new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
	const markDirty = () => { dirty = true; setState('dirty', 'Niet-opgeslagen wijzigingen'); schedulePreview(); };
	ed.addEventListener('input', () => { if (!readOnly) markDirty(); });
	ed.addEventListener('change', () => { if (!readOnly) markDirty(); });
	window.addEventListener('beforeunload', (e) => { if (dirty && !readOnly) { e.preventDefault(); e.returnValue = ''; } });

	/* ---- one language at a time (or all side by side) ---- */
	const NAMES = { en: 'Engels', nl: 'Nederlands', de: 'Duits', fr: 'Frans' };
	let active = 'nl';
	try { const saved = localStorage.getItem('aethra_tab'); if (saved && NAMES[saved]) active = saved; } catch (e) { /* storage blocked */ }
	const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
	const ctl = (root, lang) => $$(`[data-lang="${lang}"][data-key]`, root);
	function updateRefs() {
		for (const f of $$('.field', ed)) {
			const ref = $('[data-ref]', f);
			if (!ref) continue;
			const en = $('[data-col="en"] [data-key]', f);
			const text = en ? plain(valueOf(en)) : '';
			const show = active !== 'en' && ed.dataset.all !== '1' && text !== '';
			ref.hidden = !show;
			if (show) ref.textContent = `Engels: ${text.length > 180 ? text.slice(0, 180) + '…' : text}`;
		}
	}
	function updateProgress() {
		for (const l of Object.keys(NAMES)) {
			const need = ctl(ed, l).filter((n) => n.dataset.req === '1' && !n.closest('.item.hidden'));
			const empty = need.filter((n) => !plain(valueOf(n))).length;
			const el2 = $(`[data-prog="${l}"]`);
			if (!el2) continue;
			el2.textContent = need.length ? (empty ? `${empty} leeg` : '✓') : '';
			el2.classList.toggle('warn', empty > 0);
		}
	}
	function updateTitle() {
		if (kind !== 'pagina') return;
		const h = $('.ed-title h1');
		const t = ['nl', 'en', 'de', 'fr'].map((l) => $(`[data-lang="${l}"][data-key="titel"]`, ed)).map((n) => (n ? n.value.trim() : '')).find(Boolean);
		if (h && h.firstChild && h.firstChild.nodeType === 3) h.firstChild.nodeValue = `${t || 'Nieuwe pagina'} `;
	}
	function updateSummaries() {
		for (const sec of $$('#sections > .sec')) {
			const first = ctl(sec, active).find((n) => !n.closest('.item.hidden') && plain(valueOf(n)));
			const sum = $('[data-sec-sum]', sec);
			if (sum) { const t = first ? plain(valueOf(first)) : ''; sum.textContent = t ? `${t.length > 70 ? t.slice(0, 70) + '…' : t}` : 'nog leeg'; sum.classList.toggle('is-empty', !t); }
		}
	}
	function setActive(l, preview) {
		active = l;
		try { localStorage.setItem('aethra_tab', l); } catch (e) { /* storage blocked */ }
		ed.dataset.active = l;
		for (const t of $$('[data-lang-tab]')) t.setAttribute('aria-selected', String(t.dataset.langTab === l));
		const hidden = pv('lang'); if (hidden) hidden.value = l;
		const rb = $('#review-btn');
		if (rb) { rb.hidden = l === 'en' || readOnly; rb.textContent = `Markeer ${NAMES[l]} als nagekeken`; rb.dataset.reviewed = l; }
		updateRefs(); updateSummaries();
		if (preview !== false) schedulePreview();
	}
	for (const t of $$('[data-lang-tab]')) t.addEventListener('click', () => setActive(t.dataset.langTab));
	const all = $('#alllangs');
	if (all) all.addEventListener('change', () => { ed.dataset.all = all.checked ? '1' : '0'; updateRefs(); });
	ed.addEventListener('input', () => { updateProgress(); updateSummaries(); updateRefs(); updateTitle(); });
	ed.addEventListener('change', () => { updateProgress(); updateSummaries(); });
	for (const b of $$('[data-pv-width]')) b.addEventListener('click', () => { pv('width').value = b.dataset.pvWidth; for (const o of $$('[data-pv-width]')) o.setAttribute('aria-pressed', String(o === b)); fitPreview(); });

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
		fitPreview();
		form.submit();
	}
	/* The preview is drawn at a real device width and scaled down to fit the pane, so it looks like the site and not like a squeezed phone. */
	function fitPreview() {
		const frame = $('#pv');
		if (!frame) return;
		const box = frame.parentElement;
		const vw = Number(pv('width').value) || 1200;
		const scale = Math.min(1, box.clientWidth / vw);
		frame.style.width = `${vw}px`;
		frame.style.height = `${box.clientHeight / scale}px`;
		frame.style.left = `${(box.clientWidth - vw * scale) / 2}px`;
		frame.style.transform = `scale(${scale})`;
	}
	window.addEventListener('resize', () => fitPreview());
	function schedulePreview() { clearTimeout(pvTimer); pvTimer = setTimeout(preview, 700); }
	for (const k of ['lang', 'path', 'width']) if (pv(k)) pv(k).addEventListener('change', preview);

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
	ed.addEventListener('click', (e) => { const h = e.target.closest('[data-sec-toggle]'); if (h && !e.target.closest('button')) h.parentElement.classList.toggle('collapsed'); });
	const collapseAll = (on) => { for (const sec of $$('#sections > .sec')) sec.classList.toggle('collapsed', on); };
	for (const [idn, on] of [['collapse-all', true], ['expand-all', false]]) { const b = document.getElementById(idn); if (b) b.addEventListener('click', () => collapseAll(on)); }
	document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); const b = document.getElementById('btn-save'); if (b && !b.disabled) b.click(); } });
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
		setState('saving', 'Opslaan…');
		clearMarks();
		const c = collect();
		if (kind === 'pagina' && status) c.meta.status = status;
		const payload = { ...c, baseVersie: version, override_reason: overrideReason || undefined };
		let r;
		try { r = await api(overrideReason ? '/admin/publish/override' : '/admin/publish', payload); } catch (e) { busy = false; setState('dirty', 'Niet opgeslagen'); return say('err', 'Geen verbinding. Er is niets opgeslagen.'); }
		busy = false;
		if (!(r.status === 200 && r.data && r.data.ok)) setState('dirty', 'Niet opgeslagen');
		const d = r.data || {};
		if (r.status === 200 && d.ok) {
			version = d.versie;
			ed.dataset.version = String(version);
			dirty = false;
			setState('saved', `Opgeslagen om ${clock()} (versie ${version})`);
			if (d.notes && d.notes.length) say('', 'Opgeslagen. Let op:', lines(d.notes)); else { say(); toast(`Opgeslagen (versie ${version})`); }
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
	const reviewBtn = $('#review-btn');
	if (reviewBtn) reviewBtn.addEventListener('click', async () => {
		const b = reviewBtn;
		if (dirty) return window.alert('Sla eerst je wijzigingen op.');
		const r = await api('/admin/api/nagekeken', { kind, id, taal: b.dataset.reviewed });
		if (r.data && r.data.ok) location.reload(); else say('err', 'Markeren is niet gelukt.');
	});

	/* start: the saved language tab; an existing page opens with its blocks folded except the first */
	if (kind === 'pagina' && ed.dataset.new !== '1') for (const sec of $$('#sections > .sec').slice(1)) sec.classList.add('collapsed');
	updateProgress();
	setActive(active, false);
	preview();

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
			note.textContent = `Concept bewaard om ${clock()}.`;
			setState('dirty', `Concept bewaard om ${clock()}, nog niet gepubliceerd`);
		}
		const chk = await api('/admin/api/check', { kind, id, velden: c.velden, meta: c.meta });
		if (chk.data && chk.data.ok && !result.querySelector('.flash')) {
			const all = [...(chk.data.fouten || []), ...(chk.data.waarschuwingen || [])];
			if (all.length) say('', 'Controle voor het publiceren:', lines(all));
		}
	}, 30000);
})();

/* ---- shared helpers for inbox, media, users and account ---- */
(function () {
	'use strict';
	const $ = (s, r = document) => r.querySelector(s);
	const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

	for (const s of $$('[data-autosubmit]')) s.addEventListener('change', () => s.form && s.form.submit());

	// message list: selection and bulk actions
	const bulk = $('#bulkform');
	if (bulk) {
		const boxes = () => $$('[data-sel]', bulk);
		const act = $('#bulkact');
		const go = $('#bulkgo');
		const update = () => {
			const on = boxes().filter((b) => b.checked);
			$('#selcount').textContent = on.length ? `${on.length} geselecteerd` : 'Niets geselecteerd';
			$('#bulkbar').classList.toggle('active', on.length > 0);
			act.disabled = !on.length;
			go.disabled = !on.length || !act.value;
			for (const b of boxes()) b.closest('.msg-row').classList.toggle('selected', b.checked);
			$('#selall').checked = on.length > 0 && on.length === boxes().length;
		};
		bulk.addEventListener('change', (e) => { if (e.target.matches('[data-sel], #bulkact')) update(); });
		$('#selall').addEventListener('change', (e) => { for (const b of boxes()) b.checked = e.target.checked; update(); });
		bulk.addEventListener('submit', (e) => {
			if (act.value === 'verwijderen' && !window.confirm(bulk.dataset.confirmDelete || 'Verwijderen?')) e.preventDefault();
		});
	}

	// media: upload preview, library filter, edit dialogs
	const drop = $('#drop');
	if (drop) {
		const input = $('input[type=file]', drop);
		const show = (file) => {
			if (!file) return;
			const name = $('.drop-name', drop);
			name.textContent = `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} kB`;
			name.hidden = false;
			const reader = new FileReader();
			reader.onload = () => { const img = $('.drop-prev', drop); img.src = reader.result; img.hidden = false; $('.drop-empty', drop).hidden = true; };
			reader.readAsDataURL(file);
		};
		input.addEventListener('change', () => show(input.files[0]));
		for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
		for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('over'));
		drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; show(input.files[0]); } });
	}
	const grid = $('#mgrid');
	if (grid) {
		let mode = 'all';
		const apply = () => {
			const q = ($('#mq').value || '').trim().toLowerCase();
			let shown = 0;
			for (const c of $$('[data-media]', grid)) {
				const hit = (!q || c.dataset.search.includes(q)) && (mode === 'all' || (mode === 'used') === (c.dataset.use === '1'));
				c.classList.toggle('hidden', !hit);
				if (hit) shown += 1;
			}
			$('#mnone').hidden = shown > 0;
		};
		$('#mq').addEventListener('input', apply);
		for (const b of $$('[data-mfilter]')) b.addEventListener('click', () => { mode = b.dataset.mfilter; for (const o of $$('[data-mfilter]')) o.setAttribute('aria-pressed', String(o === b)); apply(); });
	}
	document.addEventListener('click', (e) => {
		const open = e.target.closest('[data-dialog]');
		if (open) { const d = document.getElementById(open.dataset.dialog); if (d && d.showModal) d.showModal(); return; }
		if (e.target.closest('[data-close]')) { const d = e.target.closest('dialog'); if (d) d.close(); return; }
		if (e.target.tagName === 'DIALOG') e.target.close(); // click on the backdrop
	});

	// account: show passwords, strength meter
	for (const t of $$('[data-showpw]')) t.addEventListener('change', () => { for (const i of $$('input[name=current], input[name=password]', t.form)) i.type = t.checked ? 'text' : 'password'; });
	const pw = $('[data-strength]');
	if (pw) {
		const meter = $('#meter');
		const text = $('#meter-t');
		pw.addEventListener('input', () => {
			const v = pw.value;
			meter.hidden = !v;
			const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(v)).length;
			const level = v.length < 12 ? 1 : (v.length >= 16 || classes >= 3) ? 3 : 2;
			meter.dataset.level = String(level);
			meter.firstElementChild.style.width = `${[0, 33, 66, 100][level]}%`;
			text.textContent = level === 1 ? `Nog ${12 - v.length} teken${12 - v.length === 1 ? '' : 's'} nodig (minstens 12).` : level === 2 ? 'Voldoende. Langer is sterker.' : 'Sterk.';
		});
	}
})();

/* ---- menu editor ---- */
(function () {
	'use strict';
	const form = document.getElementById('menuform');
	if (!form) return;
	const S = JSON.parse(form.dataset.state);
	const menu = S.menu;
	let lang = 'nl';
	let dirty = false;
	const $ = (s, r = document) => r.querySelector(s);
	const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
	const el = (tag, attrs = {}, ...kids) => {
		const n = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (v === true) n.setAttribute(k, ''); else if (v !== false && v != null) n.setAttribute(k, v); }
		for (const kid of kids.flat()) if (kid != null) n.append(kid);
		return n;
	};
	const live = (t) => { const l = document.getElementById('live'); if (l) l.textContent = t; };
	const uid = () => Math.random().toString(36).slice(2, 9);
	const fixed = (ref) => S.fixed.find((f) => f.ref === ref);
	const page = (ref) => S.pages.find((p) => p.ref === String(ref));
	const defaultLabel = (it, l) => (it.soort === 'vast' ? ((fixed(it.ref) || { labels: {} }).labels[l] || it.ref) : it.soort === 'pagina' ? (((page(it.ref) || {}).titels || {})[l] || '') : (it.labels.en || Object.values(it.labels)[0] || ''));
	const effective = (it, l) => (it.labels[l] || defaultLabel(it, l));
	const missingLang = (it, l) => it.soort === 'pagina' && !effective(it, l);
	const target = (it) => (it.soort === 'vast' ? `Vaste pagina · ${it.ref === '/' ? 'startpagina' : it.ref}` : it.soort === 'pagina' ? 'Eigen pagina' : it.ref);
	const nameOf = (it) => effective(it, 'nl') || effective(it, 'en') || defaultLabel(it, 'en') || '(zonder naam)';
	const touch = () => { dirty = true; const s = $('#menustate'); if (s) s.textContent = 'Niet-opgeslagen wijzigingen'; };

	function mock() {
		for (const name of ['header', 'footer']) {
			const box = $(`[data-mock="${name}"]`);
			box.replaceChildren(...menu[name].filter((i) => i.zichtbaar && !missingLang(i, lang) && effective(i, lang)).map((i) => el('span', { text: effective(i, lang) })));
		}
		const c = menu.cta;
		const b = $('[data-mock="cta"]');
		b.textContent = c && c.zichtbaar && effective(c, lang) ? effective(c, lang) : '';
		b.hidden = !b.textContent;
	}

	function row(it, listName, index, listArr) {
		const open = it._open;
		const li = el('li', { class: 'mrow' + (it.zichtbaar ? '' : ' off'), 'data-id': it.id });
		const isCta = listName === 'cta';
		const top = el('div', { class: 'mrow-top' });
		if (!isCta && S.canWrite) top.append(el('span', { class: 'grip', draggable: 'true', 'aria-hidden': 'true', title: 'Sleep om de volgorde te wijzigen', text: '⋮⋮' }));
		top.append(el('div', { class: 'mrow-name' }, el('strong', { text: effective(it, 'nl') || nameOf(it) }), el('span', { class: 'meta', text: target(it) + (it.soort === 'pagina' && Object.keys((page(it.ref) || {}).titels || {}).length < S.langs.length ? ' · niet in alle talen' : '') })));
		if (S.canWrite) {
			const actions = el('div', { class: 'mrow-actions' });
			const sw = el('label', { class: 'switch', title: it.zichtbaar ? 'Zichtbaar op de site' : 'Verborgen op de site' }, el('input', { type: 'checkbox', checked: it.zichtbaar, 'aria-label': `${nameOf(it)} zichtbaar` }), el('span', { class: 'sr', text: 'Zichtbaar' }));
			sw.firstChild.addEventListener('change', (e) => { it.zichtbaar = e.target.checked; touch(); render(); });
			actions.append(sw);
			if (!isCta) {
				actions.append(el('button', { type: 'button', class: 'icon-btn', 'aria-label': `${nameOf(it)} omhoog`, text: '↑', disabled: index === 0, 'data-up': it.id }), el('button', { type: 'button', class: 'icon-btn', 'aria-label': `${nameOf(it)} omlaag`, text: '↓', disabled: index === listArr.length - 1, 'data-down': it.id }));
			}
			actions.append(el('button', { type: 'button', class: 'secondary small', 'data-edit': it.id, 'aria-expanded': String(!!open), text: open ? 'Klaar' : 'Tekst' }), el('button', { type: 'button', class: 'icon-btn danger', 'aria-label': `${nameOf(it)} verwijderen`, 'data-del': it.id, text: '✕' }));
			top.append(actions);
		}
		li.append(top);
		if (open && S.canWrite) {
			const panel = el('div', { class: 'mrow-edit' });
			if (it.soort === 'link') {
				const url = el('input', { type: 'text', value: it.ref, id: `u-${it.id}`, maxlength: '500', placeholder: 'https://… of /adres' });
				url.addEventListener('input', () => { it.ref = url.value.trim(); touch(); mock(); });
				panel.append(el('div', { class: 'row' }, el('label', { for: `u-${it.id}`, text: 'Link' }), url));
				const nt = el('input', { type: 'checkbox', checked: it.nieuw_tab });
				nt.addEventListener('change', () => { it.nieuw_tab = nt.checked; touch(); });
				panel.append(el('label', { class: 'chk' }, nt, ' Opent in een nieuw tabblad'));
			}
			const grid = el('div', { class: 'two' });
			for (const l of S.langs) {
				const input = el('input', { type: 'text', value: it.labels[l] || '', id: `l-${it.id}-${l}`, maxlength: '60', lang: l, placeholder: it.soort === 'link' ? (l === 'en' ? 'Tekst van de link' : 'Leeg = Engelse tekst') : (defaultLabel(it, l) || 'Niet beschikbaar in deze taal') });
				input.addEventListener('input', () => { const v = input.value.trim(); if (v) it.labels[l] = v; else delete it.labels[l]; touch(); mock(); });
				grid.append(el('div', { class: 'row' }, el('label', { for: input.id, text: `Tekst (${S.names[l]})` }), input));
			}
			panel.append(grid);
			if (it.soort !== 'link') panel.append(el('p', { class: 'fhint', text: 'Laat leeg om de standaardtekst te gebruiken.' }));
			li.append(panel);
		}
		return li;
	}

	function options(listName) {
		const used = new Set(menu[listName].map((i) => `${i.soort}:${i.ref}`));
		const sel = [el('option', { value: '', text: 'Kies wat je wilt toevoegen…' })];
		const g1 = el('optgroup', { label: 'Vaste pagina’s' });
		for (const f of S.fixed) g1.append(el('option', { value: `vast:${f.ref}`, text: f.labels.nl, disabled: used.has(`vast:${f.ref}`) }));
		sel.push(g1);
		if (S.pages.length) { const g2 = el('optgroup', { label: 'Eigen pagina’s' }); for (const p of S.pages) g2.append(el('option', { value: `pagina:${p.ref}`, text: p.titels.nl || p.titels.en || `Pagina ${p.ref}`, disabled: used.has(`pagina:${p.ref}`) })); sel.push(g2); }
		sel.push(el('option', { value: 'link:', text: 'Eigen link…' }));
		return sel;
	}

	function render() {
		for (const name of ['header', 'footer']) {
			const box = $(`[data-list="${name}"]`);
			const ul = $('[data-items]', box);
			ul.replaceChildren(...menu[name].map((it, i) => row(it, name, i, menu[name])));
			$('[data-empty]', box).hidden = menu[name].length > 0;
			$('[data-count]', box).textContent = `${menu[name].length} van ${S.max[name]}`;
			const sel = $('[data-add-select]', box);
			if (sel) { const v = sel.value; sel.replaceChildren(...options(name)); sel.value = v; $('[data-add]', box).disabled = menu[name].length >= S.max[name]; }
		}
		const cbox = $('[data-cta-box]');
		cbox.replaceChildren();
		if (menu.cta) cbox.append(el('ul', { class: 'mlist' }, row(menu.cta, 'cta', 0, [menu.cta])));
		else if (S.canWrite) {
			const sel = el('select', { id: 'add-cta', 'aria-label': 'Doel van de knop' }, ...options('cta'));
			const btn = el('button', { type: 'button', class: 'secondary small', text: 'Knop instellen' });
			btn.addEventListener('click', () => { const it = make(sel.value); if (!it) return; menu.cta = it; touch(); render(); });
			cbox.append(el('div', { class: 'addrow' }, sel, btn));
		} else cbox.append(el('p', { class: 'hint', text: 'Geen knop.' }));
		mock();
	}

	function make(value) {
		if (!value) return null;
		const [soort, ...rest] = value.split(':');
		const ref = rest.join(':');
		return { id: uid(), soort, ref, labels: {}, zichtbaar: true, nieuw_tab: false, _open: soort === 'link' };
	}
	const find = (id) => { for (const name of ['header', 'footer']) { const i = menu[name].findIndex((x) => x.id === id); if (i > -1) return [menu[name], i, name]; } return menu.cta && menu.cta.id === id ? [null, -1, 'cta'] : [null, -1, null]; };

	form.addEventListener('click', (e) => {
		const t = e.target.closest('button');
		if (!t) return;
		if (t.dataset.add !== undefined) {
			const box = t.closest('[data-list]');
			const name = box.dataset.list;
			const it = make($('[data-add-select]', box).value);
			if (!it) return;
			menu[name].push(it); $('[data-add-select]', box).value = ''; touch(); render(); live('Toegevoegd');
			if (it._open) { const inp = $(`#u-${it.id}`); if (inp) inp.focus(); }
			return;
		}
		const id = t.dataset.up || t.dataset.down || t.dataset.edit || t.dataset.del;
		if (!id) return;
		const [arr, i, name] = find(id);
		if (name === null) return;
		if (t.dataset.up !== undefined && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; touch(); render(); live('Omhoog verplaatst'); const b = $(`[data-up="${id}"]`) || $(`[data-down="${id}"]`); if (b) b.focus(); }
		else if (t.dataset.down !== undefined && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; touch(); render(); live('Omlaag verplaatst'); const b = $(`[data-down="${id}"]`) || $(`[data-up="${id}"]`); if (b) b.focus(); }
		else if (t.dataset.edit !== undefined) { const it = name === 'cta' ? menu.cta : arr[i]; it._open = !it._open; render(); }
		else if (t.dataset.del !== undefined) { if (name === 'cta') menu.cta = null; else arr.splice(i, 1); touch(); render(); live('Verwijderd'); }
	});

	// drag and drop within one list
	let dragId = null;
	form.addEventListener('dragstart', (e) => { const li = e.target.closest && e.target.closest('.mrow'); if (!li || !e.target.classList.contains('grip')) return; dragId = li.dataset.id; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
	form.addEventListener('dragend', () => { dragId = null; for (const l of $$('.mrow')) l.classList.remove('dragging', 'over'); });
	form.addEventListener('dragover', (e) => { const li = e.target.closest && e.target.closest('.mrow'); if (!dragId || !li) return; const [a] = find(dragId); const [b] = find(li.dataset.id); if (a && a === b) { e.preventDefault(); for (const l of $$('.mrow')) l.classList.toggle('over', l === li && l.dataset.id !== dragId); } });
	form.addEventListener('drop', (e) => {
		const li = e.target.closest && e.target.closest('.mrow');
		if (!dragId || !li) return;
		const [a, from] = find(dragId); const [b, to] = find(li.dataset.id);
		if (!a || a !== b || from === to) return;
		e.preventDefault();
		const [moved] = a.splice(from, 1); a.splice(to, 0, moved); touch(); render(); live('Volgorde gewijzigd');
	});

	for (const b of $$('[data-mlang]')) b.addEventListener('click', () => { lang = b.dataset.mlang; for (const o of $$('[data-mlang]')) o.setAttribute('aria-pressed', String(o === b)); mock(); });
	form.addEventListener('submit', () => {
		const strip = (it) => ({ id: it.id, soort: it.soort, ref: it.ref, labels: it.labels, zichtbaar: it.zichtbaar, nieuw_tab: it.nieuw_tab });
		$('#menuinput').value = JSON.stringify({ header: menu.header.map(strip), footer: menu.footer.map(strip), cta: menu.cta ? strip(menu.cta) : null });
		dirty = false;
	});
	window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
	render();
})();
