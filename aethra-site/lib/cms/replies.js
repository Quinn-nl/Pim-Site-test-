'use strict';
/** Reply templates: standard answers per language, filled in with the name and organisation of the sender. */
const db = require('./db');
const audit = require('./audit');
const { LANGS } = require('../i18n');

const MAX = 30;
const bad = (text, status = 422) => Object.assign(new Error(text), { status });
const shape = (r) => (r ? { id: r.id, naam: r.naam, teksten: JSON.parse(r.teksten || '{}') } : null);
const list = () => db.all('SELECT * FROM antwoord_sjablonen ORDER BY naam').map(shape);
const get = (id) => shape(db.get('SELECT * FROM antwoord_sjablonen WHERE id = ?', id));

function clean(input) {
	const naam = String(input.naam || '').replace(/\s+/g, ' ').trim().slice(0, 80);
	if (!naam) throw bad('Geef het sjabloon een naam.');
	const teksten = {};
	for (const l of LANGS) {
		const onderwerp = String(input[`onderwerp_${l}`] || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 150);
		const tekst = String(input[`tekst_${l}`] || '').replace(/\r/g, '').trim().slice(0, 4000);
		if (onderwerp || tekst) teksten[l] = { onderwerp, tekst };
	}
	if (!Object.keys(teksten).length) throw bad('Schrijf de tekst in minstens één taal.');
	return { naam, teksten };
}
function save(id, input, user) {
	const { naam, teksten } = clean(input);
	if (id) {
		if (!get(id)) throw bad('Sjabloon niet gevonden.', 404);
		db.run('UPDATE antwoord_sjablonen SET naam = ?, teksten = ? WHERE id = ?', naam, JSON.stringify(teksten), id);
		audit.log({ user, actie: 'sjabloon.gewijzigd', entiteit: `sjabloon:${id}` });
		return id;
	}
	if (db.get('SELECT COUNT(*) AS n FROM antwoord_sjablonen').n >= MAX) throw bad(`Maximaal ${MAX} sjablonen.`);
	const r = db.run('INSERT INTO antwoord_sjablonen (naam, teksten) VALUES (?, ?)', naam, JSON.stringify(teksten));
	audit.log({ user, actie: 'sjabloon.aangemaakt', entiteit: `sjabloon:${r.id}` });
	return r.id;
}
function remove(id, user) { if (db.run('DELETE FROM antwoord_sjablonen WHERE id = ?', id).changes) audit.log({ user, actie: 'sjabloon.verwijderd', entiteit: `sjabloon:${id}` }); }

/** Subject and body for a message, in the language of the sender (English when that language has no text). {naam} and {organisatie} are replaced. */
function fill(template, message) {
	const t = template.teksten[message.taal] || template.teksten.en || Object.values(template.teksten)[0];
	const sub = (x) => String(x || '').replace(/\{naam\}/gi, message.naam).replace(/\{organisatie\}/gi, message.organisatie || '').replace(/ +\)/g, ')').replace(/ {2,}/g, ' ');
	return { onderwerp: sub(t.onderwerp), tekst: sub(t.tekst), taal: template.teksten[message.taal] ? message.taal : (template.teksten.en ? 'en' : Object.keys(template.teksten)[0]) };
}
module.exports = { list, get, save, remove, fill, MAX };
