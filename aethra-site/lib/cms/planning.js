'use strict';
/**
 * Scheduled publishing. A planned publication stores the editor state (what would go live) and runs through the normal publish door at the
 * chosen time, as the person who planned it: same compliance checks, same audit trail. If it cannot run (content changed meanwhile, the person lost
 * their rights, a check fails) it is marked "mislukt" with the reason, and that person gets a mail. Nothing is ever published half.
 */
const db = require('./db');
const audit = require('./audit');
const publish = require('./publish');
const pages = require('./pages');
const content = require('./content');
const users = require('./users');
const outbox = require('./outbox');
const cfg = require('../config');

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const objectOf = (kind, id) => (kind === 'tekst' ? content.textObject(String(id)) : kind === 'pagina' ? pages.object(Number(id)) : 'privacy');
const paramsOf = (p) => ({ ...(p.kind === 'tekst' ? { groupId: String(p.id) } : { id: Number(p.id) }), velden: p.velden, meta: p.meta });

function schedule({ kind, id, actie, wanneer, payload = null, reden = null, user }, now = Date.now()) {
	if (!['tekst', 'privacy', 'pagina'].includes(kind)) throw fail(400, 'Onbekend onderdeel.');
	if (!['publiceren', 'depubliceren'].includes(actie)) throw fail(400, 'Onbekende actie.');
	if (actie === 'depubliceren' && kind !== 'pagina') throw fail(400, 'Alleen een pagina kan offline worden gehaald.');
	if (!Number.isFinite(wanneer) || wanneer < now + 60 * 1000) throw fail(400, 'Kies een moment in de toekomst (minstens een minuut vooruit).');
	if (wanneer > now + 366 * 86400000) throw fail(400, 'Plan niet verder dan een jaar vooruit.');
	let stored = null;
	if (actie === 'publiceren') {
		if (!payload) throw fail(400, 'Er is niets om te publiceren.');
		stored = { kind, id, velden: payload.velden, meta: kind === 'pagina' ? { ...(payload.meta || {}), status: 'gepubliceerd' } : (payload.meta || null), baseVersie: payload.baseVersie == null ? null : Number(payload.baseVersie) };
		const check = publish.check(kind, paramsOf(stored));
		if (check.fouten.length) throw fail(422, check.fouten[0].melding, { fouten: check.fouten, waarschuwingen: check.waarschuwingen });
		if (check.waarschuwingen.length && String(reden || '').trim().length < 10) throw fail(409, 'Er zijn waarschuwingen. Geef een reden (minstens 10 tekens) om toch te plannen.', { waarschuwingen: check.waarschuwingen });
	} else if (!pages.get(Number(id))) throw fail(404, 'Pagina niet gevonden.');
	db.tx(() => {
		db.run("UPDATE planning SET status = 'geannuleerd' WHERE status = 'wacht' AND soort = ? AND ref = ? AND actie = ?", kind, String(id || 'privacy'), actie);
		db.run('INSERT INTO planning (soort, ref, actie, wanneer, door, payload, reden) VALUES (?, ?, ?, ?, ?, ?, ?)', kind === 'privacy' ? 'tekst' : kind, kind === 'privacy' ? 'privacy' : String(id), actie, wanneer, user.id, stored ? JSON.stringify(stored) : null, String(reden || '').trim() || null);
	});
	const rowId = db.get('SELECT MAX(id) AS id FROM planning').id;
	audit.log({ user, actie: 'planning.gepland', entiteit: objectOf(kind, id), nieuw: { actie, wanneer: new Date(wanneer).toISOString() } });
	return rowId;
}

const shape = (r) => ({ ...r, object: r.soort === 'pagina' ? pages.object(Number(r.ref)) : r.ref === 'privacy' ? 'privacy' : content.textObject(r.ref), payload: r.payload ? JSON.parse(r.payload) : null });
const SELECT = 'SELECT p.*, g.naam AS naam FROM planning p LEFT JOIN gebruikers g ON g.id = p.door';
function list({ status = '', limit = 100 } = {}) {
	return db.all(`${SELECT} ${status ? 'WHERE p.status = ?' : ''} ORDER BY CASE p.status WHEN 'wacht' THEN 0 ELSE 1 END, CASE p.status WHEN 'wacht' THEN p.wanneer END ASC, p.id DESC LIMIT ?`, ...(status ? [status] : []), limit).map(shape);
}
const forObject = (object) => list({ status: 'wacht' }).filter((r) => r.object === object);
const pendingCount = () => db.get("SELECT COUNT(*) AS n FROM planning WHERE status = 'wacht'").n;
const failedCount = () => db.get("SELECT COUNT(*) AS n FROM planning WHERE status = 'mislukt'").n;
function cancel(id, user) {
	const r = db.run("UPDATE planning SET status = 'geannuleerd' WHERE id = ? AND status = 'wacht'", id);
	if (!r.changes) throw fail(404, 'Dit gepland moment bestaat niet meer.');
	audit.log({ user, actie: 'planning.geannuleerd', entiteit: 'planning', nieuw: { id } });
}

/** Runs everything that is due. Returns { ran, failed }. */
function run(now = Date.now()) {
	const out = { ran: 0, failed: 0 };
	for (const row of db.all("SELECT * FROM planning WHERE status = 'wacht' AND wanneer <= ? ORDER BY wanneer, id", now)) {
		const item = shape(row);
		const who = users.byId(row.door);
		let error = null;
		try {
			if (!who || !who.actief || !users.can(who, 'publiceren')) throw fail(403, 'De persoon die dit plande mag niet meer publiceren.');
			const user = { id: who.id, rol: who.rol, email: who.email };
			if (row.actie === 'publiceren') publish.publish(item.payload.kind, { ...paramsOf(item.payload), baseVersie: item.payload.baseVersie, overrideReden: row.reden }, user);
			else {
				const cur = pages.get(Number(row.ref));
				if (!cur) throw fail(404, 'De pagina bestaat niet meer.');
				publish.publish('pagina', { id: Number(row.ref), velden: cur.velden, meta: { ...cur.meta, status: 'concept' }, baseVersie: null }, user);
			}
		} catch (e) { error = e.status === 409 && !e.waarschuwingen ? 'Er is intussen iets anders gewijzigd op deze plek. Plan het opnieuw.' : e.message; }
		if (error) {
			db.run("UPDATE planning SET status = 'mislukt', fout = ?, uitgevoerd_op = ? WHERE id = ?", String(error).slice(0, 300), db.iso(), row.id);
			out.failed += 1;
			if (who) outbox.send({ aan: who.email, soort: 'planning', onderwerp: 'Een geplande publicatie is niet gelukt', tekst: `Hallo ${who.naam},\n\nDe geplande actie “${row.actie}” voor ${item.object} kon niet worden uitgevoerd: ${error}\n\nPlan het opnieuw in het beheer: ${cfg.SITE_URL ? cfg.SITE_URL + '/admin/planning' : '/admin/planning'}\n` });
		} else {
			db.run("UPDATE planning SET status = 'klaar', uitgevoerd_op = ? WHERE id = ?", db.iso(), row.id);
			audit.log({ user: row.door, actie: 'planning.uitgevoerd', entiteit: item.object, nieuw: { actie: row.actie } });
			out.ran += 1;
		}
	}
	return out;
}

module.exports = { schedule, list, forObject, pendingCount, failedCount, cancel, run };
