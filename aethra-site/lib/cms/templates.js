'use strict';
/**
 * The 14 building blocks (sections) and the 7 page templates. Hardcoded on purpose: the editor chooses a template and fills it in,
 * the design stays in the code. validateLayout() is the rule engine the back-end runs before any layout is saved.
 * Field keys inside a page are  s.<sectionId>.<field>  and, for repeated items,  s.<sectionId>.items.<n>.<field>.
 */
const T = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });

const SECTIONS = {
	hero: { label: 'Banner (hero)', velden: [T('eyebrow', 'Label above the title'), T('title', 'Title'), T('text', 'Intro text', 'textarea'), T('cta_label', 'Button text'), T('cta_url', 'Button link (for example /contact)', 'url')] },
	tekst: { label: 'Text', velden: [T('body', 'Text', 'rich')] },
	citaat: { label: 'Quote', velden: [T('quote', 'Quote', 'textarea'), T('by', 'Who said it (name and role)')] },
	foto: { label: 'Photo', velden: [T('media', 'Photo', 'media'), T('caption', 'Caption (optional)')] },
	feiten: { label: 'Facts with sources', velden: [T('title', 'Heading (optional)')], items: { max: 4, label: 'Fact', velden: [T('value', 'Figure'), T('label', 'What it says', 'textarea'), T('source', 'Source name'), T('url', 'Source link', 'url')] } },
	stappen: { label: 'Steps', velden: [T('title', 'Heading')], items: { max: 6, label: 'Step', velden: [T('title', 'Title'), T('text', 'Text', 'textarea')] } },
	kaarten: { label: 'Cards', velden: [T('title', 'Heading')], items: { max: 6, label: 'Card', velden: [T('title', 'Title'), T('text', 'Text', 'textarea'), T('url', 'Link', 'url'), T('link_label', 'Link text')] } },
	punten: { label: 'Points', velden: [T('title', 'Heading')], items: { max: 8, label: 'Point', velden: [T('text', 'Text', 'textarea')] } },
	faq: { label: 'Frequently asked questions', velden: [T('title', 'Heading')], items: { max: 10, label: 'Question', velden: [T('q', 'Question'), T('a', 'Answer', 'textarea')] } },
	statusband: { label: 'Project status', velden: [T('title', 'Title'), T('text', 'Text', 'textarea'), T('note', 'Note', 'textarea')] },
	chips: { label: 'Links to other pages', velden: [T('title', 'Heading')], items: { max: 8, label: 'Link', velden: [T('label', 'Text'), T('url', 'Link', 'url')] } },
	over: { label: 'Who is behind it', velden: [T('title', 'Title'), T('text', 'Text', 'textarea')], items: { max: 6, label: 'Person', velden: [T('name', 'Name'), T('role', 'Role'), T('bio', 'Short bio', 'textarea')] } },
	cta: { label: 'Closing call to action', velden: [T('title', 'Title'), T('text', 'Text', 'textarea'), T('label', 'Button text'), T('url', 'Button link', 'url')] },
	disclaimer: { label: 'Disclaimer (not an offer)', velden: [T('tekst', 'Statement', 'textarea')], vergrendeld: true },
};

const TEMPLATES = {
	standaard: {
		label: 'Standard page', uitleg: 'Heading, text and optionally a quote, photo or call to action. For information and legal pages.',
		toegestaan: ['tekst', 'citaat', 'foto', 'punten', 'faq', 'cta'], verplicht: ['tekst'], max: { cta: 1 }, ctaLaatst: true,
		standaard: ['tekst', 'cta'],
	},
	doelgroep: {
		label: 'Audience page', uitleg: 'Points with a contact button, questions, links to the other audiences and a closing call to action.',
		toegestaan: ['punten', 'faq', 'chips', 'over', 'cta', 'tekst', 'citaat', 'foto'], verplicht: ['punten', 'faq'], max: { punten: 1, faq: 1, chips: 1, over: 1, cta: 1 }, ctaLaatst: true,
		vast: ['punten', 'faq', 'chips', 'over', 'cta'], standaard: ['punten', 'faq', 'chips', 'cta'],
	},
	investeerder: {
		label: 'Investor page', uitleg: 'Like the audience page, with a disclaimer that cannot be removed or moved far down.',
		toegestaan: ['disclaimer', 'punten', 'faq', 'chips', 'over', 'cta', 'tekst', 'citaat', 'foto', 'statusband'], verplicht: ['disclaimer', 'punten', 'faq'], max: { disclaimer: 1, punten: 1, faq: 1, chips: 1, over: 1, cta: 1, statusband: 1 }, ctaLaatst: true,
		maxPositie: { disclaimer: 3 }, standaard: ['disclaimer', 'punten', 'faq', 'statusband', 'cta'],
	},
	landing: {
		label: 'Landing page', uitleg: 'Banner, short explanation, steps, cards and status. For a campaign.',
		toegestaan: ['hero', 'feiten', 'stappen', 'kaarten', 'statusband', 'citaat', 'foto', 'tekst', 'cta'], verplicht: ['hero'], max: { hero: 1, statusband: 1, cta: 1 }, eerste: 'hero', ctaLaatst: true,
		standaard: ['hero', 'stappen', 'kaarten', 'statusband', 'cta'],
	},
	feitenpagina: {
		label: 'Facts page', uitleg: 'Facts with their sources, a photo and text. For substantiation and research.',
		toegestaan: ['feiten', 'foto', 'tekst', 'citaat', 'cta'], verplicht: ['feiten'], max: { cta: 1 }, ctaLaatst: true,
		standaard: ['feiten', 'tekst', 'cta'],
	},
	update: {
		label: 'Update or news page', uitleg: 'Text with photos and quotes. For progress and publications.',
		toegestaan: ['tekst', 'foto', 'citaat', 'punten', 'cta'], verplicht: ['tekst'], max: { cta: 1 }, ctaLaatst: true,
		standaard: ['tekst', 'foto', 'cta'],
	},
	vrije_secties: {
		label: 'Free sections', uitleg: 'Choose any building blocks and put them in any order. No restrictions on order.',
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
