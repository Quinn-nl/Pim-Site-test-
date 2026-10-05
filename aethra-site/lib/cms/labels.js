'use strict';
/** Dutch labels and short hints for the editable texts (lib/fields.js keeps the English ones as the source of the keys). */
const NL = {
	site_name: 'Naam van de site', meta_description: 'Beschrijving voor zoekmachines', company_line: 'Regel over het bedrijf in de footer',
	home_problem_line: 'Korte regel over het probleem (homepage)', status_short: 'Korte status (homepage)', cta_title: 'Afsluitende oproep: titel', cta_text: 'Afsluitende oproep: tekst',
	seo_home: 'Titel van de homepage', seo_problem: 'Titel: het probleem', seo_how: 'Titel: hoe het werkt', seo_apps: 'Titel: toepassingen', seo_contact: 'Titel: contact',
	hero_eyebrow: 'Klein label boven de titel', hero_title: 'Titel', hero_text: 'Introductietekst', hero_cta: 'Tekst op de knop',
	problem_title: 'Titel', problem_text: 'Tekst',
	steps_title: 'Titel', apps_title: 'Titel', status_title: 'Titel', status_text: 'Tekst', status_note: 'Opmerking',
	today_enabled: 'Pagina publiceren (typ yes)', seo_today: 'Titel voor zoekmachines', today_title: 'Kop', today_lead: 'Inleiding', today_exists_title: 'Kop: wat bestaat er al', today_item1: 'Punt 1 (bron: Ford Media Center)', today_item2: 'Punt 2 (bron: BMW-berichtgeving)', today_item3: 'Punt 3 (bron: Fleet News)', today_gap_title: 'Kop: wat ontbreekt er', today_gap_text: 'Tekst',
	about_title: 'Titel', about_text: 'Inleiding (optioneel)', company_details: 'Bedrijfsgegevens (naam, KvK-nummer, adres)',
	contact_title: 'Titel', contact_text: 'Tekst', contact_reply: 'Wanneer reageren jullie?', linkedin_url: 'LinkedIn-bedrijfspagina (link, optioneel)',
};
for (let n = 1; n <= 2; n++) Object.assign(NL, { [`fact${n}_value`]: `Feit ${n}: cijfer`, [`fact${n}_label`]: `Feit ${n}: omschrijving`, [`fact${n}_source`]: `Feit ${n}: naam van de bron`, [`fact${n}_url`]: `Feit ${n}: link naar de bron`,
	[`p${n}_name`]: `Persoon ${n}: naam`, [`p${n}_role`]: `Persoon ${n}: rol`, [`p${n}_bio`]: `Persoon ${n}: korte achtergrond`, [`p${n}_link`]: `Persoon ${n}: LinkedIn (link, optioneel)` });
for (let n = 1; n <= 3; n++) Object.assign(NL, { [`step${n}_title`]: `Stap ${n}: titel`, [`step${n}_text`]: `Stap ${n}: tekst` });
for (let n = 1; n <= 4; n++) Object.assign(NL, { [`app${n}_title`]: `Kaart ${n}: titel`, [`app${n}_text`]: `Kaart ${n}: tekst` });
const AUD = { seo: 'Titel voor zoekmachines', title: 'Kop', lead: 'Inleiding', p1: 'Punt 1', p2: 'Punt 2', p3: 'Punt 3', q1: 'Vraag 1', a1: 'Antwoord 1', q2: 'Vraag 2', a2: 'Antwoord 2', q3: 'Vraag 3', a3: 'Antwoord 3' };

const HINTS = {
	meta_description: 'Ongeveer 150 tekens. Verschijnt onder de titel in zoekresultaten.',
	seo_home: 'Hooguit 60 tekens. De sitenaam wordt automatisch toegevoegd.', seo_problem: 'Ongeveer 50 tekens.', seo_how: 'Ongeveer 50 tekens.', seo_apps: 'Ongeveer 50 tekens.', seo_contact: 'Ongeveer 50 tekens.', seo_today: 'Ongeveer 50 tekens.',
	fact1_value: 'Een cijfer heeft altijd een bron nodig.', fact2_value: 'Een cijfer heeft altijd een bron nodig.', fact1_source: 'Verplicht bij een cijfer.', fact2_source: 'Verplicht bij een cijfer.',
	today_enabled: 'De pagina blijft verborgen tot hier “yes” staat. Controleer eerst de bronnen.',
	company_details: 'Verschijnt alleen als het is ingevuld.', about_text: 'Het blok “Wie zit erachter” verschijnt pas als er iets is ingevuld.',
	contact_reply: 'Bijvoorbeeld: “We reageren meestal binnen twee werkdagen.”',
};

/** { label, hint } for a field of lib/fields.js; falls back to the English label. */
function labelOf(field) {
	const m = /^(aud_[a-z]+)_(seo|title|lead|p[123]|q[123]|a[123])$/.exec(field.key);
	const label = NL[field.key] || (m && AUD[m[2]]) || field.label;
	const hint = HINTS[field.key] || (m && m[2] === 'seo' ? 'Ongeveer 50 tekens.' : '') || '';
	return { label, hint };
}

const SLOTS = { hero: 'Foto bij de banner (homepage)', problem: 'Foto bij het probleem', status: 'Foto bij de status', social: 'Deelafbeelding (1200 × 630, zichtbaar als de site wordt gedeeld)' };

module.exports = { labelOf, SLOTS };
