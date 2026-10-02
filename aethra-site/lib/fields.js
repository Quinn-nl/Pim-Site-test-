'use strict';
/**
 * Single source of truth for every editable text: label, type, default.
 * The admin form and the public page are both generated from this.
 */
const G = (id, title, fields) => ({ id, title, fields });
const F = (key, label, type, def) => ({ key, label, type, default: def });

const GROUPS = [
	G('site', 'Site', [
		F('site_name', 'Site name', 'text', 'Aethra'),
		F('meta_description', 'Search description', 'textarea', 'Aethra develops CubeSats and AI that help vehicles switch to an eco mode in areas with high air pollution.'),
		F('company_line', 'Footer company line', 'text', 'Company details will follow.'),
	]),
	G('home', 'Home page extras', [
		F('home_problem_line', 'Problem teaser line', 'text', 'Pollution peaks in specific places. Vehicles drive on as if every street were the same.'),
		F('status_short', 'Status teaser', 'text', 'Prototype phase. Open to conversations with investors and partners.'),
		F('cta_title', 'Closing call to action: title', 'text', 'Want to know more?'),
		F('cta_text', 'Closing call to action: text', 'text', 'We are open to conversations with municipalities, fleets, manufacturers, platforms and investors.'),
	]),
	G('hero', 'Hero', [
		F('hero_eyebrow', 'Label above the title', 'text', 'Prototype phase'),
		F('hero_title', 'Title', 'text', 'Cleaner air, right where traffic is heaviest'),
		F('hero_text', 'Intro text', 'textarea', 'CubeSats and AI that help vehicles switch to an eco mode in areas with high air pollution.'),
		F('hero_cta', 'Button text', 'text', 'Get in touch'),
	]),
	G('problem', 'The problem', [
		F('problem_title', 'Title', 'text', 'Air pollution is concentrated where people and traffic meet'),
		F('problem_text', 'Text', 'textarea', 'Road traffic is a major local source of air pollution in cities. Pollution peaks in specific places and at specific times, while vehicles drive on as if every street were the same.'),
		F('fact1_value', 'Fact 1: figure', 'text', '4.2 million'),
		F('fact1_label', 'Fact 1: description', 'textarea', 'premature deaths worldwide in 2019 were attributed to ambient (outdoor) air pollution.'),
		F('fact1_source', 'Fact 1: source name', 'text', 'WHO, Ambient (outdoor) air quality and health'),
		F('fact1_url', 'Fact 1: source link', 'url', 'https://www.who.int/news-room/fact-sheets/detail/ambient-(outdoor)-air-quality-and-health'),
		F('fact2_value', 'Fact 2: figure', 'text', '182,000'),
		F('fact2_label', 'Fact 2: description', 'textarea', 'premature deaths in the EU-27 in 2023 were attributable to fine particulate matter above WHO guideline levels.'),
		F('fact2_source', 'Fact 2: source name', 'text', 'European Environment Agency, 2025'),
		F('fact2_url', 'Fact 2: source link', 'url', 'https://www.eea.europa.eu/en/europe-environment-2025/thematic-briefings/environment-and-human-health/air-pollution-and-impacts-on-human-health/'),
	]),
	G('steps', 'Three steps', [
		F('steps_title', 'Title', 'text', 'What Aethra does, in three steps'),
		F('step1_title', 'Step 1: title', 'text', 'Detect'),
		F('step1_text', 'Step 1: text', 'textarea', 'Find where air quality is under pressure.'),
		F('step2_title', 'Step 2: title', 'text', 'Decide'),
		F('step2_text', 'Step 2: text', 'textarea', 'AI decides when a vehicle should adapt.'),
		F('step3_title', 'Step 3: title', 'text', 'Switch'),
		F('step3_text', 'Step 3: text', 'textarea', 'Vehicles move to eco mode inside those areas.'),
	]),
	G('apps', 'Applications', [
		F('apps_title', 'Title', 'text', 'Built for the parties that shape urban mobility'),
		F('app1_title', 'Card 1: title', 'text', 'Municipalities'),
		F('app1_text', 'Card 1: text', 'textarea', 'Protect the air where it matters most to residents.'),
		F('app2_title', 'Card 2: title', 'text', 'Fleet operators'),
		F('app2_text', 'Card 2: text', 'textarea', 'Vehicles that respond to local conditions, with no extra work for drivers.'),
		F('app3_title', 'Card 3: title', 'text', 'Vehicle manufacturers'),
		F('app3_text', 'Card 3: text', 'textarea', 'An extra layer of intelligence for vehicle control systems.'),
		F('app4_title', 'Card 4: title', 'text', 'Mobility platforms'),
		F('app4_text', 'Card 4: text', 'textarea', 'Offer cleaner trips in the busiest areas.'),
	]),
	G('status', 'Status', [
		F('status_title', 'Title', 'text', 'Where we are'),
		F('status_text', 'Text', 'textarea', 'Aethra is in the prototype phase. We are open to conversations with investors and partners.'),
		F('status_note', 'Note', 'textarea', 'Results will be published once they are supported by test data.'),
	]),
	G('contact', 'Contact', [
		F('contact_title', 'Title', 'text', 'Let us talk'),
		F('contact_text', 'Text', 'textarea', 'City, fleet, manufacturer, platform or investor: send us a message and we will reply.'),
		F('contact_reply', 'Reply expectation', 'text', 'We usually reply within two working days.'),
	]),
];

const FIELDS = Object.fromEntries(GROUPS.flatMap((g) => g.fields).map((f) => [f.key, f]));
const DEFAULTS = Object.fromEntries(Object.values(FIELDS).map((f) => [f.key, f.default]));

const IMAGE_SLOTS = [
	{ slot: 'hero', label: 'Hero photo' },
	{ slot: 'problem', label: 'Problem section photo' },
	{ slot: 'status', label: 'Status section photo' },
];

const ROLES = ['Investor', 'Municipality', 'Fleet operator', 'Vehicle manufacturer', 'Mobility platform', 'Other'];

module.exports = { GROUPS, FIELDS, DEFAULTS, IMAGE_SLOTS, ROLES };
