'use strict';
/**
 * The one door through which content goes live: clean -> validate -> compliance -> write (one transaction) -> audit -> cache.
 *  - hard errors (fouten)           -> 422, nothing is written
 *  - warnings (waarschuwingen)      -> 409 with the list; repeat with overrideReden (a written reason) to publish anyway, logged in audit_logs
 * Drafts of pages (status concept) are not live: compliance results are returned as notes and never block saving.
 */
const content = require('./content');
const pages = require('./pages');
const audit = require('./audit');
const { validateAethraCompliance } = require('./compliance');
const { GROUPS, FIELDS } = require('../fields');
const { LANGS } = require('../i18n');
const { cleanValue } = require('../store');

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

function prepareText(groupId, velden) {
	const group = GROUPS.find((g) => g.id === groupId);
	if (!group) throw fail(404, 'Onbekende tekstgroep.');
	const out = {};
	const errors = [];
	for (const taal of LANGS) {
		const given = (velden || {})[taal];
		if (!given) continue;
		out[taal] = {};
		for (const f of group.fields) {
			if (!(f.key in given)) continue;
			const v = cleanValue(FIELDS[f.key], given[f.key]);
			if (v === null) errors.push(`${taal.toUpperCase()}: ${f.label}: vul een geldige http(s)-link in`);
			else out[taal][f.key] = v;
		}
	}
	if (errors.length) throw fail(422, errors[0], { fouten: errors.map((melding) => ({ melding })) });
	return out;
}
function preparePrivacy(velden) {
	const out = {};
	for (const taal of LANGS) if (velden && velden[taal] && 'text' in velden[taal]) out[taal] = { text: String(velden[taal].text || '').replace(/\r/g, '').slice(0, 20000) };
	return out;
}

function gate(check, overrideReden, user, object, enforce = true) {
	if (!enforce) return { notes: [...check.fouten, ...check.waarschuwingen, ...(check.adviezen || [])] };
	if (check.fouten.length) throw fail(422, check.fouten[0].melding, { fouten: check.fouten, waarschuwingen: check.waarschuwingen });
	if (check.waarschuwingen.length) {
		const reden = String(overrideReden || '').trim();
		if (reden.length < 10) throw fail(409, 'Er zijn waarschuwingen. Geef een reden (minstens 10 tekens) om toch te publiceren.', { waarschuwingen: check.waarschuwingen });
		audit.log({ user, actie: 'publicatie.override', entiteit: object, nieuw: check.waarschuwingen, reden });
	}
	return { notes: check.adviezen || [] };
}

/**
 * kind: 'tekst' | 'privacy' | 'pagina'
 * params: { groupId | id, velden, meta, baseVersie, overrideReden }
 */
function publish(kind, params, user) {
	const { baseVersie = null, overrideReden = null } = params;
	if (kind === 'tekst') {
		const object = content.textObject(params.groupId);
		const velden = prepareText(params.groupId, params.velden);
		gate(validateAethraCompliance({ object, velden }), overrideReden, user, object);
		const r = content.writeFields(object, velden, { user, baseVersie });
		return { ...r, object };
	}
	if (kind === 'privacy') {
		const velden = preparePrivacy(params.velden);
		const r = content.writeFields('privacy', velden, { user, baseVersie });
		return { ...r, object: 'privacy' };
	}
	if (kind === 'pagina') {
		const object = pages.object(params.id);
		const prepared = pages.prepare(params.id, { velden: params.velden, meta: params.meta });
		const live = prepared.status === 'gepubliceerd';
		const check = validateAethraCompliance({ object, velden: prepared.velden, meta: { sjabloon: prepared.row.sjabloon, indeling: prepared.indeling }, publiceren: live });
		const { notes } = gate(check, overrideReden, user, object, live);
		const r = pages.save(params.id, prepared, { user, baseVersie });
		return { ...r, object, notes };
	}
	throw fail(400, 'Onbekend onderdeel.');
}

/** What the editor would hear if it published now (used by the live "check" in the form). */
function check(kind, params) {
	if (kind === 'tekst') return validateAethraCompliance({ object: content.textObject(params.groupId), velden: prepareText(params.groupId, params.velden) });
	if (kind === 'pagina') {
		const prepared = pages.prepare(params.id, { velden: params.velden, meta: params.meta });
		return validateAethraCompliance({ object: pages.object(params.id), velden: prepared.velden, meta: { sjabloon: prepared.row.sjabloon, indeling: prepared.indeling }, publiceren: true });
	}
	return { fouten: [], waarschuwingen: [], adviezen: [] };
}

module.exports = { publish, check, prepareText };
