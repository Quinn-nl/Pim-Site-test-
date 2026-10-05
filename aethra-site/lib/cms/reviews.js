'use strict';
/**
 * Review flow. A "redacteur" can write and save drafts but cannot make anything live: what would go live is stored here as a proposal.
 * An editor or administrator approves (it then goes through the normal publish door, with all compliance checks and override rules)
 * or rejects it with a comment. The proposer gets a mail either way.
 */
const db = require('./db');
const audit = require('./audit');
const publish = require('./publish');
const content = require('./content');
const pages = require('./pages');
const outbox = require('./outbox');
const cfg = require('../config');
const { LANGS } = require('../i18n');

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const objectOf = (kind, id) => (kind === 'tekst' ? content.textObject(String(id)) : kind === 'pagina' ? pages.object(Number(id)) : 'privacy');
const paramsOf = (p) => ({ ...(p.kind === 'tekst' ? { groupId: String(p.id) } : { id: Number(p.id) }), velden: p.velden, meta: p.meta });

/** Would this save change what visitors see? Then a redacteur may only propose it. */
const goesLive = (kind, body) => kind !== 'pagina' || (body.meta && body.meta.status === 'gepubliceerd');

function summarize(kind, velden, meta) {
	const per = LANGS.filter((l) => velden && velden[l] && Object.keys(velden[l]).length).map((l) => `${l.toUpperCase()}: ${Object.keys(velden[l]).length}`);
	return `${per.length ? `${per.join(', ')} veld(en)` : 'Geen tekstwijzigingen'}${kind === 'pagina' && meta && meta.status === 'gepubliceerd' ? ', publiceren' : ''}`;
}

function submit(body, user) {
	const kind = body.kind;
	if (!['tekst', 'privacy', 'pagina'].includes(kind)) throw fail(400, 'Onbekend onderdeel.');
	const params = paramsOf(body);
	const check = publish.check(kind, params);                     // hard errors: fix them before proposing
	if (check.fouten.length) throw fail(422, check.fouten[0].melding, { fouten: check.fouten, waarschuwingen: check.waarschuwingen });
	const object = objectOf(kind, body.id);
	db.tx(() => {
		db.run("UPDATE reviews SET status = 'ingetrokken' WHERE status = 'wacht' AND ingediend_door = ? AND soort = ? AND ref = ?", user.id, kind, String(body.id || 'privacy'));
		db.run('INSERT INTO reviews (soort, ref, payload, samenvatting, ingediend_door) VALUES (?, ?, ?, ?, ?)', kind, String(body.id || 'privacy'), JSON.stringify({ kind, id: body.id, velden: body.velden, meta: body.meta || null, baseVersie: body.baseVersie == null ? null : Number(body.baseVersie), notitie: String(body.notitie || '').slice(0, 500) }), summarize(kind, body.velden, body.meta), user.id);
	});
	const id = db.get('SELECT MAX(id) AS id FROM reviews').id;
	audit.log({ user, actie: 'review.ingediend', entiteit: object, nieuw: { review: id } });
	return { id, waarschuwingen: check.waarschuwingen };
}

const label = (r) => (r.soort === 'tekst' ? `tekst ${r.ref}` : r.soort === 'privacy' ? 'privacyverklaring' : `pagina ${r.ref}`);
function shape(r) {
	if (!r) return null;
	return { ...r, payload: JSON.parse(r.payload), naam_ingediend: r.naam_ingediend || null, naam_beoordeeld: r.naam_beoordeeld || null, label: label(r) };
}
const SELECT = 'SELECT r.*, g.naam AS naam_ingediend, b.naam AS naam_beoordeeld FROM reviews r LEFT JOIN gebruikers g ON g.id = r.ingediend_door LEFT JOIN gebruikers b ON b.id = r.beoordeeld_door';
const get = (id) => shape(db.get(`${SELECT} WHERE r.id = ?`, id));
function list({ status = '', mine = null, limit = 100 } = {}) {
	const w = []; const p = [];
	if (status) { w.push('r.status = ?'); p.push(status); }
	if (mine) { w.push('r.ingediend_door = ?'); p.push(mine); }
	return db.all(`${SELECT} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.id DESC LIMIT ?`, ...p, limit).map(shape);
}
const pendingCount = () => db.get("SELECT COUNT(*) AS n FROM reviews WHERE status = 'wacht'").n;

/** Old (live) against proposed values for the changed fields, per language. */
function changes(r) {
	const object = objectOf(r.payload.kind, r.payload.id);
	const now = content.readObject(object);
	const out = [];
	for (const l of LANGS) for (const [veld, nieuw] of Object.entries((r.payload.velden || {})[l] || {})) {
		const oud = (now[l] && now[l][veld]) || '';
		if (String(oud) !== String(nieuw)) out.push({ taal: l, veld, oud: String(oud), nieuw: String(nieuw) });
	}
	return out;
}

function mailTo(r, text) {
	const u = db.get('SELECT email, naam FROM gebruikers WHERE id = ? AND actief = 1', r.ingediend_door);
	if (u) outbox.send({ aan: u.email, soort: 'review', onderwerp: `Je voorstel voor ${r.label} is ${text.status}`, tekst: `Hallo ${u.naam},\n\nJe voorstel voor ${r.label} is ${text.status}.${text.opmerking ? `\n\nOpmerking van de beoordelaar:\n${text.opmerking}` : ''}\n\n${cfg.SITE_URL ? `${cfg.SITE_URL}/admin/reviews` : '/admin/reviews'}\n` });
}

/** force: also publish when someone changed the same object in the meantime (their change is then replaced). */
function approve(id, reviewer, { overrideReden = null, force = false } = {}) {
	const r = get(id);
	if (!r) throw fail(404, 'Voorstel niet gevonden.');
	if (r.status !== 'wacht') throw fail(409, 'Dit voorstel is al behandeld.');
	const p = { ...paramsOf(r.payload), baseVersie: force ? null : r.payload.baseVersie, overrideReden };
	let result;
	try { result = publish.publish(r.payload.kind, p, reviewer); } catch (e) {
		if (e.status === 409 && !e.waarschuwingen) e.message = 'Er is intussen iets anders gewijzigd op deze plek. Bekijk de wijzigingen of vink “toch publiceren” aan.';
		throw e;
	}
	db.run("UPDATE reviews SET status = 'goedgekeurd', beoordeeld_door = ?, beoordeeld_op = ? WHERE id = ?", reviewer.id, db.iso(), id);
	audit.log({ user: reviewer, actie: 'review.goedgekeurd', entiteit: objectOf(r.payload.kind, r.payload.id), nieuw: { review: id, door: r.ingediend_door } });
	mailTo(r, { status: 'goedgekeurd en gepubliceerd', opmerking: '' });
	return result;
}
function reject(id, reviewer, opmerking) {
	const r = get(id);
	if (!r) throw fail(404, 'Voorstel niet gevonden.');
	if (r.status !== 'wacht') throw fail(409, 'Dit voorstel is al behandeld.');
	const text = String(opmerking || '').trim();
	if (text.length < 5) throw fail(400, 'Schrijf kort op waarom (minstens 5 tekens), zodat de schrijver weet wat er moet veranderen.');
	db.run("UPDATE reviews SET status = 'afgewezen', beoordeeld_door = ?, beoordeeld_op = ?, opmerking = ? WHERE id = ?", reviewer.id, db.iso(), text.slice(0, 1000), id);
	audit.log({ user: reviewer, actie: 'review.afgewezen', entiteit: objectOf(r.payload.kind, r.payload.id), nieuw: { review: id }, reden: text.slice(0, 200) });
	mailTo(r, { status: 'afgewezen', opmerking: text });
}
function withdraw(id, user) {
	const r = get(id);
	if (!r || r.ingediend_door !== user.id || r.status !== 'wacht') throw fail(404, 'Voorstel niet gevonden.');
	db.run("UPDATE reviews SET status = 'ingetrokken' WHERE id = ?", id);
	audit.log({ user, actie: 'review.ingetrokken', entiteit: objectOf(r.payload.kind, r.payload.id), nieuw: { review: id } });
}

module.exports = { goesLive, submit, get, list, pendingCount, changes, approve, reject, withdraw };
