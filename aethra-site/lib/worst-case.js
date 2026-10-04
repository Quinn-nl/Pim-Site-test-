'use strict';
/**
 * Development-only stress data (enabled with DEV_TOGGLE=1, never in production).
 * "worst": plausible overruns of every editable text (limits come from store.cleanValue: 300 / 2000 characters).
 * "empty": every optional text cleared, as an editor could do in the admin panel.
 */
const { FIELDS } = require('./fields');

const OPTIONAL = /^(about_text|p\d_(name|role|bio|link)|company_details|linkedin_url|status_note|contact_reply|company_line|home_problem_line|status_short|cta_text|meta_description|fact\d_url|fact\d_source)$/;

function worstCase(base) {
	const out = {};
	for (const f of Object.values(FIELDS)) {
		const v = base[f.key];
		if (f.key === 'site_name') out[f.key] = 'Aethra Aerospace Mobility Solutions';
		else if (/^fact\d_value$/.test(f.key)) out[f.key] = '1,284,000,000';
		else if (/^fact\d_source$/.test(f.key)) out[f.key] = 'EEA-Europe-environment-2025-thematic-briefing-air-pollution-and-impacts-on-human-health';
		else if (f.type === 'url') out[f.key] = '';
		else if (f.type === 'textarea') out[f.key] = `${v} ${v} ${v}`.slice(0, 2000);
		else out[f.key] = `${v} ${v}`.slice(0, 300);
	}
	return out;
}

function emptyCase(base) {
	const out = {};
	for (const f of Object.values(FIELDS)) out[f.key] = OPTIONAL.test(f.key) ? '' : base[f.key];
	return out;
}

const overlay = (mode, base) => (mode === 'worst' ? worstCase(base) : mode === 'empty' ? emptyCase(base) : base);

function toggleHtml(mode, back) {
	const link = (m, label) => `<a href="/__data?mode=${m}&amp;back=${encodeURIComponent(back)}"${m === mode ? ' aria-current="true"' : ''}>${label}</a>`;
	return `<link rel="stylesheet" href="/css/dev-toggle.css"><div class="dev-toggle" role="group" aria-label="Test data">${link('demo', 'Demo data')}${link('worst', 'Worst case')}${link('empty', 'Empty')}</div>`;
}

module.exports = { overlay, toggleHtml };
