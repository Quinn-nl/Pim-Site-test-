'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LANGS, defaultsFor } = require('../lib/i18n');
const { FIELDS } = require('../lib/fields');

// Guardrails from docs/brand-guidelines.md section 3, applied to every default text in every language.
const BANNED = {
	en: [/\d+\s?%/, /reduc\w*[^.]{0,40}(emission|pollut)/i, /guarant/i, /revolution/i, /\b(best|leading|world-class|unique)\b/i, /\b(return|profit|yield)s?\b/i],
	nl: [/\d+\s?%/, /verminder\w*[^.]{0,40}(uitstoot|vervuil)/i, /garantie|gegarandeerd/i, /revolution/i, /\b(beste|toonaangevend|uniek)\b/i, /rendement|winst/i],
	de: [/\d+\s?%/, /reduzier\w*[^.]{0,40}(emission|verschmutz)/i, /garantie/i, /revolution/i, /\b(beste|führend|einzigartig)\b/i, /rendite|gewinn/i],
	fr: [/\d+\s?%/, /réduc\w*[^.]{0,40}(émission|pollution)/i, /garanti/i, /révolution/i, /\b(meilleur|leader|unique)\b/i, /rendement|bénéfice/i],
};
const ECO = { en: [/eco[ -]?mode/gi, 'eco mode'], nl: [/eco[ -]?mod(us|e)/gi, 'ecomodus'], de: [/eco[ -]?modus/gi, 'Eco-Modus'], fr: [/mode[ -]?[ée]co/gi, 'mode éco'] };
const PROTO = { en: [/prototype phase/gi, 'prototype phase'], nl: [/prototype-?fase/gi, 'prototypefase'], de: [/prototyp-?phase/gi, 'Prototypphase'], fr: [/phase de prototype/gi, 'phase de prototype'] };
const copyKeys = Object.values(FIELDS).filter((f) => f.type !== 'url' && !/_source$/.test(f.key)).map((f) => f.key);

test('copy contains no banned claim patterns in any language', () => {
	for (const lang of LANGS) {
		const v = defaultsFor(lang);
		for (const key of copyKeys) for (const re of BANNED[lang]) assert.ok(!re.test(v[key]), `${lang}.${key} matches ${re}: ${v[key]}`);
	}
});

test('agreed terms are spelled consistently in every language', () => {
	for (const lang of LANGS) {
		const v = defaultsFor(lang);
		for (const key of copyKeys) {
			for (const h of v[key].match(ECO[lang][0]) || []) assert.equal(h.toLowerCase(), ECO[lang][1].toLowerCase(), `${lang}.${key}: "${h}"`);
			for (const h of v[key].match(PROTO[lang][0]) || []) assert.equal(h.toLowerCase(), PROTO[lang][1].toLowerCase(), `${lang}.${key}: "${h}"`);
			assert.ok(!/AETHRA/.test(v[key]), `${lang}.${key}: brand name must not be uppercase in running text`);
			assert.ok(!/\bcubesats?\b/.test(v[key]) && !/\bCubesats?\b/.test(v[key]), `${lang}.${key}: write CubeSats`);
		}
	}
});

test('the investor page always carries the not-an-offer statement', () => {
	const needles = { en: /not an offer/i, nl: /geen aanbod/i, de: /kein Angebot/i, fr: /ne constitue pas une offre/i };
	for (const lang of LANGS) assert.match(defaultsFor(lang).aud_investors_a1, needles[lang], lang);
});

test('technical details are never published (the how stays in conversation)', () => {
	const HOW = /\b(algorithm|neural|sensor fusion|telemetry|uplink|downlink|satellite data|CAN bus|ECU|firmware)\b/i;
	for (const lang of LANGS) {
		const v = defaultsFor(lang);
		for (const key of copyKeys) assert.ok(!HOW.test(v[key]), `${lang}.${key}: ${v[key]}`);
	}
});
