'use strict';
/**
 * The 14 building blocks (sections) and the 7 page templates. Hardcoded on purpose: the editor chooses a template and fills it in,
 * the design stays in the code. validateLayout() is the rule engine the back-end runs before any layout is saved.
 * Field keys inside a page are  s.<sectionId>.<field>  and, for repeated items,  s.<sectionId>.items.<n>.<field>.
 */
const T = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });

const SECTIONS = {
	hero: { label: 'Banner', velden: [T('eyebrow', 'Klein label boven de titel'), T('title', 'Titel'), T('text', 'Introductietekst', 'textarea'), T('cta_label', 'Tekst op de knop'), T('cta_url', 'Link van de knop (bijvoorbeeld /contact)', 'url')] },
	tekst: { label: 'Tekst', velden: [T('body', 'Tekst', 'rich')] },
	citaat: { label: 'Citaat', velden: [T('quote', 'Citaat', 'textarea'), T('by', 'Van wie (naam en functie)')] },
	foto: { label: 'Foto', velden: [T('media', 'Foto', 'media'), T('caption', 'Bijschrift (optioneel)')] },
	feiten: { label: 'Feiten met bronnen', velden: [T('title', 'Kop (optioneel)')], items: { max: 4, label: 'Feit', velden: [T('value', 'Cijfer'), T('label', 'Wat het zegt', 'textarea'), T('source', 'Naam van de bron'), T('url', 'Link naar de bron', 'url')] } },
	stappen: { label: 'Stappen', velden: [T('title', 'Kop')], items: { max: 6, label: 'Stap', velden: [T('title', 'Titel'), T('text', 'Tekst', 'textarea')] } },
	kaarten: { label: 'Kaarten', velden: [T('title', 'Kop')], items: { max: 6, label: 'Kaart', velden: [T('title', 'Titel'), T('text', 'Tekst', 'textarea'), T('url', 'Link', 'url'), T('link_label', 'Tekst van de link')] } },
	punten: { label: 'Punten', velden: [T('title', 'Kop')], items: { max: 8, label: 'Punt', velden: [T('text', 'Tekst', 'textarea')] } },
	faq: { label: 'Veelgestelde vragen', velden: [T('title', 'Kop')], items: { max: 10, label: 'Vraag', velden: [T('q', 'Vraag'), T('a', 'Antwoord', 'textarea')] } },
	statusband: { label: 'Status van het project', velden: [T('title', 'Titel'), T('text', 'Tekst', 'textarea'), T('note', 'Opmerking', 'textarea')] },
	chips: { label: 'Links naar andere pagina’s', velden: [T('title', 'Kop')], items: { max: 8, label: 'Link', velden: [T('label', 'Tekst'), T('url', 'Link', 'url')] } },
	over: { label: 'Wie zit erachter', velden: [T('title', 'Titel'), T('text', 'Tekst', 'textarea')], items: { max: 6, label: 'Persoon', velden: [T('name', 'Naam'), T('role', 'Rol'), T('bio', 'Korte achtergrond', 'textarea')] } },
	cta: { label: 'Afsluitende oproep', velden: [T('title', 'Titel'), T('text', 'Tekst', 'textarea'), T('label', 'Tekst op de knop'), T('url', 'Link van de knop', 'url')] },
	disclaimer: { label: 'Disclaimer (geen aanbod)', velden: [T('tekst', 'Verklaring', 'textarea')], vergrendeld: true },
};

const TEMPLATES = {
	standaard: {
		label: 'Standaardpagina', uitleg: 'Kop, tekst en eventueel een citaat, foto of oproep. Voor informatie en juridische pagina’s.',
		toegestaan: ['tekst', 'citaat', 'foto', 'punten', 'faq', 'cta'], verplicht: ['tekst'], max: { cta: 1 }, ctaLaatst: true,
		standaard: ['tekst', 'cta'],
	},
	doelgroep: {
		label: 'Doelgroeppagina', uitleg: 'Punten met een contactknop, vragen, links naar de andere doelgroepen en een afsluitende oproep.',
		toegestaan: ['punten', 'faq', 'chips', 'over', 'cta', 'tekst', 'citaat', 'foto'], verplicht: ['punten', 'faq'], max: { punten: 1, faq: 1, chips: 1, over: 1, cta: 1 }, ctaLaatst: true,
		vast: ['punten', 'faq', 'chips', 'over', 'cta'], standaard: ['punten', 'faq', 'chips', 'cta'],
	},
	investeerder: {
		label: 'Investeerderspagina', uitleg: 'Zoals de doelgroeppagina, met een disclaimer die niet weg kan en niet ver naar beneden mag.',
		toegestaan: ['disclaimer', 'punten', 'faq', 'chips', 'over', 'cta', 'tekst', 'citaat', 'foto', 'statusband'], verplicht: ['disclaimer', 'punten', 'faq'], max: { disclaimer: 1, punten: 1, faq: 1, chips: 1, over: 1, cta: 1, statusband: 1 }, ctaLaatst: true,
		maxPositie: { disclaimer: 3 }, standaard: ['disclaimer', 'punten', 'faq', 'statusband', 'cta'],
	},
	landing: {
		label: 'Landingspagina', uitleg: 'Banner, korte uitleg, stappen, kaarten en status. Voor een campagne.',
		toegestaan: ['hero', 'feiten', 'stappen', 'kaarten', 'statusband', 'citaat', 'foto', 'tekst', 'cta'], verplicht: ['hero'], max: { hero: 1, statusband: 1, cta: 1 }, eerste: 'hero', ctaLaatst: true,
		standaard: ['hero', 'stappen', 'kaarten', 'statusband', 'cta'],
	},
	feitenpagina: {
		label: 'Feitenpagina', uitleg: 'Feiten met hun bronnen, een foto en tekst. Voor onderbouwing en onderzoek.',
		toegestaan: ['feiten', 'foto', 'tekst', 'citaat', 'cta'], verplicht: ['feiten'], max: { cta: 1 }, ctaLaatst: true,
		standaard: ['feiten', 'tekst', 'cta'],
	},
	update: {
		label: 'Nieuws- of updatepagina', uitleg: 'Tekst met foto’s en citaten. Voor voortgang en publicaties.',
		toegestaan: ['tekst', 'foto', 'citaat', 'punten', 'cta'], verplicht: ['tekst'], max: { cta: 1 }, ctaLaatst: true,
		standaard: ['tekst', 'foto', 'cta'],
	},
	vrije_secties: {
		label: 'Vrije indeling', uitleg: 'Kies zelf bouwstenen en zet ze in elke volgorde. Geen regels voor de volgorde.',
		toegestaan: Object.keys(SECTIONS), verplicht: [], max: {}, vrij: true, standaard: ['tekst'],
	},
};

const ID = /^s[0-9]{1,3}$/;

/** Returns a list of error strings (empty when the layout is allowed). indeling: [{ id, type }] */
function validateLayout(templateId, indeling) {
	const errors = [];
	const tpl = TEMPLATES[templateId];
	if (!tpl) return ['Onbekend sjabloon.'];
	if (!Array.isArray(indeling)) return ['De indeling is geen lijst.'];
	if (indeling.length > 40) errors.push('Een pagina kan maximaal 40 bouwstenen hebben.');
	const ids = new Set();
	for (const s of indeling) {
		if (!s || typeof s !== 'object' || !ID.test(String(s.id))) { errors.push('Een bouwsteen heeft een ongeldig id.'); continue; }
		if (ids.has(s.id)) errors.push(`Bouwsteen-id ${s.id} wordt twee keer gebruikt.`);
		ids.add(s.id);
		if (!SECTIONS[s.type]) errors.push(`Onbekende bouwsteen "${String(s.type).slice(0, 30)}".`);
	}
	if (errors.length) return errors;
	if (tpl.vrij) return errors; // free sections: the only rules are the ones above
	const types = indeling.map((s) => s.type);
	for (const t of types) if (!tpl.toegestaan.includes(t)) errors.push(`De bouwsteen "${SECTIONS[t].label}" is niet toegestaan in het sjabloon "${tpl.label}".`);
	for (const t of tpl.verplicht) if (!types.includes(t)) errors.push(`Het sjabloon "${tpl.label}" vereist de bouwsteen "${SECTIONS[t].label}".`);
	for (const [t, max] of Object.entries(tpl.max || {})) if (types.filter((x) => x === t).length > max) errors.push(`Maximaal ${max} keer "${SECTIONS[t].label}" in dit sjabloon.`);
	if (tpl.eerste && types[0] !== tpl.eerste) errors.push(`De bouwsteen "${SECTIONS[tpl.eerste].label}" moet bovenaan staan.`);
	if (tpl.ctaLaatst && types.includes('cta') && types[types.length - 1] !== 'cta') errors.push('De afsluitende oproep moet de laatste bouwsteen zijn.');
	if (tpl.vast) {
		const order = types.filter((t) => tpl.vast.includes(t)).map((t) => tpl.vast.indexOf(t));
		for (let i = 1; i < order.length; i++) if (order[i] < order[i - 1]) { errors.push(`De bouwstenen van dit sjabloon hebben een vaste volgorde: ${tpl.vast.map((t) => SECTIONS[t].label).join(', ')}.`); break; }
	}
	for (const [t, pos] of Object.entries(tpl.maxPositie || {})) {
		const at = types.indexOf(t);
		if (at !== -1 && at + 1 > pos) errors.push(`"${SECTIONS[t].label}" moet binnen de eerste ${pos} bouwstenen blijven.`);
	}
	return errors;
}

const defaultLayout = (templateId) => ((TEMPLATES[templateId] || TEMPLATES.standaard).standaard).map((type, i) => ({ id: `s${i + 1}`, type }));
const nextId = (indeling) => `s${Math.max(0, ...indeling.map((s) => parseInt(String(s.id).slice(1), 10) || 0)) + 1}`;

/** All field keys a section can have, for a given id: [{ key, label, type }] (items expanded to their maximum). */
function sectionFields(section) {
	const def = SECTIONS[section.type];
	const out = def.velden.map((f) => ({ ...f, key: `s.${section.id}.${f.key}` }));
	if (def.items) for (let n = 1; n <= def.items.max; n++) for (const f of def.items.velden) out.push({ ...f, key: `s.${section.id}.items.${n}.${f.key}`, item: n });
	return out;
}

module.exports = { SECTIONS, TEMPLATES, validateLayout, defaultLayout, nextId, sectionFields };
