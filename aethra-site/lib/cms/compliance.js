'use strict';
/**
 * validateAethraCompliance(payload): the editorial rules of the site, checked before anything is published.
 *   payload = { object, velden: { taal: { veld: waarde } }, meta?: { sjabloon, indeling } }
 *   returns { fouten: [...], waarschuwingen: [...] }
 * Hard errors (fouten) block publishing. Warnings can be overridden with a written reason (it ends up in the audit log).
 */
const { textOf } = require('./sanitize');

/** Extra terms added by administrators (table compliance_regels). They only ever add rules; the built-in ones below cannot be relaxed. */
let extraCache = null;
const escapeRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function extraRules() {
	if (extraCache) return extraCache;
	let rows = [];
	try { rows = require('./db').all('SELECT soort, term FROM compliance_regels'); } catch (e) { return { forbidden: null, doubtful: null }; }
	const build = (soort) => { const t = rows.filter((r) => r.soort === soort).map((r) => escapeRe(r.term)); return t.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${t.join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null; };
	extraCache = { forbidden: build('verboden'), doubtful: build('waarschuwing') };
	return extraCache;
}
const reloadExtra = () => { extraCache = null; };


// Forbidden: promises about money and guarantees. Dutch from the brief, the other site languages added.
const FORBIDDEN = /\b(aandelen|rendement|gegarandeerd|winstbelofte|shares|stock|equity|guaranteed|guarantee|profit promise|returns?|aktien|rendite|garantiert|winstgarantie|actions|rendement garanti|garanti)\b/gi;
// A sentence that says something is NOT offered ("not an offer of shares", "geen aanbod van aandelen") is the disclaimer itself.
const NEGATION = /\b(not|no|never|without|geen|niet|nooit|zonder|nee|kein|keine|nicht|nie|ohne|pas|ne|non|jamais|sans)\b|\bne\b.*\bpas\b/i;
const DOUBTFUL = /\b(bewezen|proven|beste|best[- ]in[- ]class|revolutionair|revolutionary|doorbraak|breakthrough|bespaart|reduceert|verlaagt|reduces|lowers|cuts|verringert|senkt|réduit|diminue|garantie)\b/gi;
const HOW = /\b(algorithm|neural|sensor fusion|telemetry|uplink|downlink|satellite data|CAN bus|ECU|firmware)\b/i;
const NOT_AN_OFFER = { en: /not an offer/i, nl: /geen aanbod/i, de: /kein Angebot/i, fr: /ne constitue pas une offre/i };

const sentences = (text) => String(text).split(/(?<=[.!?;])\s+|\n+/).filter(Boolean);
const plain = (v) => (/<[a-z][\s\S]*>/i.test(v) ? textOf(v) : String(v));

function validateAethraCompliance(payload) {
	const fouten = [];
	const waarschuwingen = [];
	const adviezen = [];
	const extra = extraRules();
	const velden = payload.velden || {};
	const meta = payload.meta || {};
	const add = (list, taal, veld, regel, melding) => list.push({ taal, veld, regel, melding });

	for (const [taal, fields] of Object.entries(velden)) {
		for (const [veld, raw] of Object.entries(fields || {})) {
			const waarde = String(raw == null ? '' : raw);
			if (!waarde.trim()) continue;
			const text = plain(waarde);
			// 1. forbidden words (hard), unless the sentence is itself a negation (the disclaimer)
			if (!/(^|\.)(url|href|slug)$/i.test(veld) && !/_url$|^slug$|\.link$|\.url$/.test(veld)) {
				for (const s of sentences(text)) {
					const hits = s.match(FORBIDDEN) || (extra.forbidden && s.match(extra.forbidden));
					if (hits && !NEGATION.test(s)) add(fouten, taal, veld, 'verboden_term', `"${hits[0]}" is niet toegestaan: geen beloftes over aandelen, rendement of garanties. Herschrijf "${s.slice(0, 80)}${s.length > 80 ? '…' : ''}".`);
				}
				// 2. doubtful claims (warning) and technical details (warning)
				const d = text.match(DOUBTFUL) || (extra.doubtful && text.match(extra.doubtful));
				if (d) add(waarschuwingen, taal, veld, 'twijfelachtige_claim', `"${d[0]}" klinkt als een claim. Noem alleen resultaten die door testdata worden gedragen.`);
				const h = text.match(HOW);
				if (h) add(waarschuwingen, taal, veld, 'technisch_detail', `"${h[0]}" is een technisch detail. Het “hoe” bespreken we alleen in een gesprek.`);
				// 2b. accessibility and readability advice (never blocks)
				if (/<h[1-6]/i.test(waarde)) {
					let prev = 0;
					for (const m of waarde.matchAll(/<h([1-6])\b/gi)) { const lvl = Number(m[1]); if (prev && lvl > prev + 1) { add(adviezen, taal, veld, 'kopniveau', `Kopniveau slaat een stap over (h${prev} gevolgd door h${lvl}). Schermlezers en zoekmachines gebruiken de volgorde van koppen.`); break; } prev = lvl; }
				}
				for (const m of waarde.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
					const label = textOf(m[1]).trim().toLowerCase();
					if (!label) { add(adviezen, taal, veld, 'lege_link', 'Er staat een link zonder tekst. Schermlezers kunnen die niet voorlezen.'); break; }
					if (/^(klik hier|hier|click here|here|lees meer|read more|more|meer|mehr|hier klicken|cliquez ici|ici)$/.test(label)) { add(adviezen, taal, veld, 'vage_linktekst', `De linktekst “${label}” zegt niet waar de link heen gaat. Noem het doel, bijvoorbeeld “bekijk de toepassingen”.`); break; }
				}
				const long = sentences(text).find((x) => x.trim().split(/\s+/).length > 40);
				if (long) add(adviezen, taal, veld, 'lange_zin', `Een zin van meer dan 40 woorden (“${long.trim().slice(0, 50)}…”) is moeilijk te lezen. Splits hem op.`);
			}
		}
		// 3. a number needs a source: ...value with a digit requires the matching ...source
		for (const [veld, raw] of Object.entries(fields || {})) {
			if (!/(^|[._])value$/.test(veld)) continue;
			if (!/\d/.test(String(raw || ''))) continue;
			const bronKey = veld.replace(/value$/, 'source');
			const bron = String(fields[bronKey] == null ? '' : fields[bronKey]).trim();
			if (!bron) add(fouten, taal, veld, 'bron_ontbreekt', `Het cijfer "${String(raw).slice(0, 40)}" heeft een bronnaam nodig (veld ${bronKey}).`);
		}
	}

	// 4. investor material always carries the not-an-offer statement
	const isInvestor = payload.object === 'tekst:aud_investors' || meta.sjabloon === 'investeerder';
	if (isInvestor) {
		if (payload.object === 'tekst:aud_investors') {
			for (const [taal, fields] of Object.entries(velden)) {
				if (fields.aud_investors_a1 != null && NOT_AN_OFFER[taal] && !NOT_AN_OFFER[taal].test(String(fields.aud_investors_a1))) add(fouten, taal, 'aud_investors_a1', 'disclaimer_ontbreekt', 'De investeerderspagina moet vermelden dat dit geen aanbod is.');
			}
		}
		if (meta.sjabloon === 'investeerder') {
			const ids = (meta.indeling || []).filter((s) => s.type === 'disclaimer').map((s) => s.id);
			for (const [taal, fields] of Object.entries(velden)) {
				if (!String(fields.titel || '').trim()) continue; // a language without content is not published
				for (const id of ids) {
					const t = String(fields[`s.${id}.tekst`] || '');
					if (NOT_AN_OFFER[taal] && !NOT_AN_OFFER[taal].test(t)) add(fouten, taal, `s.${id}.tekst`, 'disclaimer_ontbreekt', 'De disclaimer moet vermelden dat dit geen aanbod is.');
				}
			}
		}
	}

	// 5. pages in search: a description helps (warning only)
	if (payload.object && payload.object.startsWith('pagina:') && payload.publiceren) {
		for (const [taal, fields] of Object.entries(velden)) {
			if (String(fields.titel || '').trim() && !String(fields.seo_description || '').trim()) add(waarschuwingen, taal, 'seo_description', 'seo_omschrijving', 'Geen omschrijving voor zoekresultaten. Google kiest dan zelf een tekst.');
		}
	}
	return { fouten, waarschuwingen, adviezen };
}

const wordsOf = (re) => re.source.replace(/^\\b\(/, '').replace(/\)\\b$/, '').split('|');
const BUILTIN = { verboden: wordsOf(FORBIDDEN), waarschuwing: wordsOf(DOUBTFUL), technisch: wordsOf(HOW) };
module.exports = { validateAethraCompliance, reloadExtra, BUILTIN, FORBIDDEN, NOT_AN_OFFER };
