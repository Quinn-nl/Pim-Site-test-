'use strict';
const { ROLES } = require('./fields');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LOGO = '<svg class="logo-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="6" fill="currentColor"/><ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-28 16 16)"/></svg>';

const ICONS = {
	detect: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
	decide: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 6.5l10 4.5M7 17.5l10-4.5"/>',
	switch: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3"/>',
	city: '<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>',
	fleet: '<path d="M2 17V6h11v11M13 9h4l4 4v4h-2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
	factory: '<path d="M3 21V10l6 4v-4l6 4V5h6v16z"/>',
	route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 000-6h-4a3 3 0 010-6h6"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
const STEP_ICONS = ['detect', 'decide', 'switch'];
const APP_ICONS = ['city', 'fleet', 'factory', 'route'];

const NAV = [['/problem', 'The problem'], ['/how-it-works', 'How it works'], ['/applications', 'Applications']];

function layout({ title, description, body, name, footerNote = '', path = '' }) {
	const link = ([href, label]) => `<a href="${href}"${path === href ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<meta name="theme-color" content="#0b1b33">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<script src="/js/init.js"></script>
<link rel="stylesheet" href="/css/site.css">
<script src="/js/site.js" defer></script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
	<div class="wrap header-inner">
		<a class="brand" href="/" aria-label="${esc(name)} home">${LOGO}<span class="brand-name">${esc(name.toUpperCase())}</span></a>
		<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
		<nav id="site-nav" class="site-nav" aria-label="Primary">
			${NAV.map(link).join('\n\t\t\t')}
			<a class="btn btn-small" href="/contact"${path === '/contact' ? ' aria-current="page"' : ''}>Contact</a>
		</nav>
	</div>
</header>
${body}
<footer class="site-footer">
	<div class="wrap footer-inner">
		<div><p class="footer-brand">${esc(name.toUpperCase())}</p><p class="footer-note">${esc(footerNote)}</p></div>
		<nav aria-label="Footer">${NAV.map(link).join('')}<a href="/contact">Contact</a><a href="/privacy"${path === '/privacy' ? ' aria-current="page"' : ''}>Privacy statement</a></nav>
	</div>
	<div class="wrap footer-bottom"><small>&copy; ${new Date().getFullYear()} ${esc(name)}. Informational website; not an offer of securities or financial products.</small></div>
</footer>
</body>
</html>`;
}

function photo(images, slot, cls) {
	const img = images[slot];
	if (!img) return '';
	return `<img class="${cls}" src="/uploads/${esc(img.file)}" alt="${esc(img.alt || '')}" loading="lazy" decoding="async">`;
}

const pageHead = (kicker, title, lead) => `
<section class="page-head" aria-labelledby="page-title">
	<div class="hero-sky" aria-hidden="true"></div>
	<div class="wrap page-head-inner">
		<p class="eyebrow">${esc(kicker)}</p>
		<h1 id="page-title">${esc(title)}</h1>
		${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
	</div>
</section>`;

const ctaBand = (v) => `
<section class="cta-band" aria-labelledby="cta-title">
	<div class="wrap cta-inner">
		<div><h2 id="cta-title">${esc(v.cta_title)}</h2><p>${esc(v.cta_text)}</p></div>
		<a class="btn btn-light" href="/contact">${esc(v.hero_cta)}</a>
	</div>
</section>`;

const fact = (v, n) => `
<figure class="fact">
	<p class="fact-value">${esc(v[`fact${n}_value`])}</p>
	<figcaption>${esc(v[`fact${n}_label`])}
		<span class="source">Source: ${v[`fact${n}_url`] ? `<a href="${esc(v[`fact${n}_url`])}" rel="noopener noreferrer" target="_blank">${esc(v[`fact${n}_source`])}</a>` : esc(v[`fact${n}_source`])}</span>
	</figcaption>
</figure>`;

const roadmap = '<ul><li class="done">Concept</li><li class="current" aria-current="step">Prototype</li><li>Validation</li><li>Pilots</li></ul>';

function renderHome({ values: v, images }) {
	const steps = [1, 2, 3].map((n) => `
		<li class="mini-step">${icon(STEP_ICONS[n - 1])}<div><h3>${esc(v[`step${n}_title`])}</h3><p>${esc(v[`step${n}_text`])}</p></div></li>`).join('');
	const apps = [1, 2, 3, 4].map((n) => `<li>${icon(APP_ICONS[n - 1])}<span>${esc(v[`app${n}_title`])}</span></li>`).join('');
	const body = `
<main id="main">
<section class="hero" aria-labelledby="hero-title">
	<div class="hero-sky" aria-hidden="true"></div>
	<div class="wrap hero-inner">
		<p class="eyebrow">${esc(v.hero_eyebrow)}</p>
		<h1 id="hero-title">${esc(v.hero_title)}</h1>
		<p class="lead">${esc(v.hero_text)}</p>
		<p class="hero-actions"><a class="btn btn-light" href="/contact">${esc(v.hero_cta)}</a><a class="btn btn-ghost" href="/how-it-works">How it works</a></p>
		${photo(images, 'hero', 'photo hero-photo')}
	</div>
</section>

<section class="section" aria-labelledby="home-problem">
	<div class="wrap split">
		${fact(v, 1)}
		<div>
			<p class="kicker">The problem</p>
			<h2 id="home-problem">${esc(v.home_problem_line)}</h2>
			<p><a class="more" href="/problem">The problem in detail</a></p>
		</div>
	</div>
</section>

<section class="section section-tint" aria-labelledby="home-how">
	<div class="wrap">
		<p class="kicker">How it works</p>
		<h2 id="home-how">${esc(v.steps_title)}</h2>
		<ol class="mini-steps">${steps}
		</ol>
		<p><a class="more" href="/how-it-works">More about how it works</a></p>
	</div>
</section>

<section class="section" aria-labelledby="home-apps">
	<div class="wrap">
		<p class="kicker">Applications</p>
		<h2 id="home-apps">${esc(v.apps_title)}</h2>
		<ul class="chips">${apps}</ul>
		<p><a class="more" href="/applications">See the applications</a></p>
	</div>
</section>

<section class="status-band" aria-label="Status">
	<div class="wrap status-inner">
		<div class="status-track" aria-label="Development phase">${roadmap}</div>
		<p>${esc(v.status_short)}</p>
	</div>
</section>
${ctaBand(v)}
</main>`;
	return layout({ title: `${v.site_name}: ${v.hero_title}`, description: v.meta_description, body, name: v.site_name, footerNote: v.company_line, path: '/' });
}

function renderProblem({ values: v, images }) {
	const body = `
<main id="main">
${pageHead('The problem', v.problem_title, v.problem_text)}
<section class="section">
	<div class="wrap">
		<div class="facts">${fact(v, 1)}${fact(v, 2)}</div>
		${photo(images, 'problem', 'photo section-photo')}
		<p class="next"><a class="more" href="/how-it-works">How Aethra responds</a></p>
	</div>
</section>
${ctaBand(v)}
</main>`;
	return layout({ title: `${v.problem_title} | ${v.site_name}`, description: v.problem_text, body, name: v.site_name, footerNote: v.company_line, path: '/problem' });
}

function renderHow({ values: v, images }) {
	const steps = [1, 2, 3].map((n) => `
		<li class="step">${icon(STEP_ICONS[n - 1])}<span class="step-num" aria-hidden="true">0${n}</span><h2>${esc(v[`step${n}_title`])}</h2><p>${esc(v[`step${n}_text`])}</p></li>`).join('');
	const body = `
<main id="main">
${pageHead('How it works', v.steps_title, '')}
<section class="section">
	<div class="wrap">
		<ol class="steps">${steps}
		</ol>
	</div>
</section>
<section class="section section-dark" aria-labelledby="status-title">
	<div class="wrap status-grid">
		<div>
			<p class="kicker">Status</p>
			<h2 id="status-title">${esc(v.status_title)}</h2>
			<p class="section-lead">${esc(v.status_text)}</p>
			<p class="status-note">${esc(v.status_note)}</p>
			${photo(images, 'status', 'photo section-photo')}
		</div>
		<div class="status-track" aria-label="Development phase">${roadmap}</div>
	</div>
</section>
${ctaBand(v)}
</main>`;
	return layout({ title: `How it works | ${v.site_name}`, description: v.meta_description, body, name: v.site_name, footerNote: v.company_line, path: '/how-it-works' });
}

function renderApplications({ values: v }) {
	const cards = [1, 2, 3, 4].map((n) => `
		<article class="card">${icon(APP_ICONS[n - 1])}<h2>${esc(v[`app${n}_title`])}</h2><p>${esc(v[`app${n}_text`])}</p></article>`).join('');
	const body = `
<main id="main">
${pageHead('Applications', v.apps_title, '')}
<section class="section">
	<div class="wrap"><div class="cards">${cards}
	</div></div>
</section>
${ctaBand(v)}
</main>`;
	return layout({ title: `Applications | ${v.site_name}`, description: v.meta_description, body, name: v.site_name, footerNote: v.company_line, path: '/applications' });
}

function renderContact({ values: v }, { status = '', token = '' } = {}) {
	const notice = {
		sent: '<p class="notice notice-ok" role="status">Thank you. Your message has been sent.</p>',
		invalid: '<p class="notice notice-err" role="alert">Please complete all required fields, including consent.</p>',
		error: '<p class="notice notice-err" role="alert">Your message could not be sent. Please try again later.</p>',
		limit: '<p class="notice notice-err" role="alert">Too many messages from your network. Please try again later.</p>',
	}[status] || '';
	const body = `
<main id="main">
${pageHead('Contact', v.contact_title, v.contact_text)}
<section class="section">
	<div class="wrap narrow-form">
		${notice}
		<form class="form" method="post" action="/contact">
			<input type="hidden" name="token" value="${esc(token)}">
			<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
			<div class="field"><label for="f-name">Name *</label><input id="f-name" name="name" type="text" autocomplete="name" maxlength="120" required></div>
			<div class="field"><label for="f-email">Email *</label><input id="f-email" name="email" type="email" autocomplete="email" maxlength="200" required></div>
			<div class="field"><label for="f-org">Organisation</label><input id="f-org" name="organisation" type="text" autocomplete="organization" maxlength="160"></div>
			<div class="field"><label for="f-role">I am a(n)</label><select id="f-role" name="role">${ROLES.map((r) => `<option>${esc(r)}</option>`).join('')}</select></div>
			<div class="field"><label for="f-msg">Message *</label><textarea id="f-msg" name="message" rows="5" maxlength="5000" required></textarea></div>
			<div class="field check"><input id="f-consent" name="consent" type="checkbox" value="1" required><label for="f-consent">I agree that my details are used to reply to this message. See the <a href="/privacy">privacy statement</a>.</label></div>
			<button class="btn" type="submit">Send message</button>
		</form>
	</div>
</section>
</main>`;
	return layout({ title: `Contact | ${v.site_name}`, description: v.contact_text, body, name: v.site_name, footerNote: v.company_line, path: '/contact' });
}

function renderPrivacy({ values: v, privacy }) {
	const blocks = privacy.split(/\n{2,}|\n(?=# )/).map((b) => b.trim()).filter(Boolean).map((b) => {
		if (b.startsWith('# ')) {
			const [head, ...rest] = b.split('\n');
			return `<h2>${esc(head.slice(2))}</h2>${rest.length ? `<p>${esc(rest.join(' '))}</p>` : ''}`;
		}
		return `<p>${esc(b.replace(/\n/g, ' '))}</p>`;
	}).join('\n');
	const body = `<main id="main" class="wrap prose page-main"><h1>Privacy statement</h1>\n${blocks}</main>`;
	return layout({ title: `Privacy statement | ${v.site_name}`, body, name: v.site_name, footerNote: v.company_line, path: '/privacy' });
}

function renderNotFound({ values: v }) {
	return layout({ title: `Not found | ${v.site_name}`, name: v.site_name, footerNote: v.company_line, body: '<main id="main" class="wrap prose page-main"><h1>Page not found</h1><p><a href="/">Back to the home page</a></p></main>' });
}

module.exports = { esc, layout, renderHome, renderProblem, renderHow, renderApplications, renderContact, renderPrivacy, renderNotFound };
