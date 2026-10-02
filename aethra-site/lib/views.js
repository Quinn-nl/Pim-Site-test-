'use strict';
const { ROLES } = require('./fields');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LOGO = '<svg class="logo-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="6" fill="currentColor"/><ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-28 16 16)"/></svg>';

function layout({ title, description, body, name, footerNote = '', bodyClass = '' }) {
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
<body class="${esc(bodyClass)}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
	<div class="wrap header-inner">
		<a class="brand" href="/" aria-label="${esc(name)} home">${LOGO}<span class="brand-name">${esc(name.toUpperCase())}</span></a>
		<nav class="site-nav" aria-label="Primary">
			<a href="/#problem">Problem</a>
			<a href="/#how">How it works</a>
			<a href="/#applications">Applications</a>
			<a href="/#status">Status</a>
			<a class="btn btn-small" href="/#contact">Contact</a>
		</nav>
	</div>
</header>
${body}
<footer class="site-footer">
	<div class="wrap footer-inner">
		<div><p class="footer-brand">${esc(name.toUpperCase())}</p><p class="footer-note">${esc(footerNote)}</p></div>
		<nav aria-label="Legal"><a href="/privacy">Privacy statement</a></nav>
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

function renderHome({ values: v, images }, { status = '', token = '' } = {}) {
	const notice = {
		sent: '<p class="notice notice-ok" role="status">Thank you. Your message has been sent.</p>',
		invalid: '<p class="notice notice-err" role="alert">Please complete all required fields, including consent.</p>',
		error: '<p class="notice notice-err" role="alert">Your message could not be sent. Please try again later.</p>',
		limit: '<p class="notice notice-err" role="alert">Too many messages from your network. Please try again later.</p>',
	}[status] || '';

	const facts = [1, 2].map((n) => `
				<figure class="fact" data-reveal>
					<p class="fact-value">${esc(v[`fact${n}_value`])}</p>
					<figcaption>${esc(v[`fact${n}_label`])}
						<span class="source">Source: ${v[`fact${n}_url`] ? `<a href="${esc(v[`fact${n}_url`])}" rel="noopener noreferrer" target="_blank">${esc(v[`fact${n}_source`])}</a>` : esc(v[`fact${n}_source`])}</span>
					</figcaption>
				</figure>`).join('');

	const steps = [1, 2, 3].map((n) => `
				<li class="step" data-reveal><span class="step-num" aria-hidden="true">0${n}</span><h3>${esc(v[`step${n}_title`])}</h3><p>${esc(v[`step${n}_text`])}</p></li>`).join('');

	const apps = [1, 2, 3, 4].map((n) => `
				<article class="card" data-reveal><h3>${esc(v[`app${n}_title`])}</h3><p>${esc(v[`app${n}_text`])}</p></article>`).join('');

	const body = `
<main id="main">
<section class="hero" aria-labelledby="hero-title">
	<div class="hero-sky" aria-hidden="true"></div>
	<div class="wrap hero-inner">
		<p class="eyebrow">${esc(v.hero_eyebrow)}</p>
		<h1 id="hero-title">${esc(v.hero_title)}</h1>
		<p class="lead">${esc(v.hero_text)}</p>
		<p><a class="btn" href="#contact">${esc(v.hero_cta)}</a></p>
		${photo(images, 'hero', 'photo hero-photo')}
	</div>
</section>

<section id="problem" class="section" aria-labelledby="problem-title">
	<div class="wrap">
		<p class="kicker">01 · The problem</p>
		<h2 id="problem-title" data-reveal>${esc(v.problem_title)}</h2>
		<p class="section-lead" data-reveal>${esc(v.problem_text)}</p>
		<div class="facts">${facts}
		</div>
		${photo(images, 'problem', 'photo section-photo')}
	</div>
</section>

<section id="how" class="section section-tint" aria-labelledby="how-title">
	<div class="wrap">
		<p class="kicker">02 · What it does</p>
		<h2 id="how-title" data-reveal>${esc(v.steps_title)}</h2>
		<ol class="steps">${steps}
		</ol>
	</div>
</section>

<section id="applications" class="section" aria-labelledby="apps-title">
	<div class="wrap">
		<p class="kicker">03 · Applications</p>
		<h2 id="apps-title" data-reveal>${esc(v.apps_title)}</h2>
		<div class="cards">${apps}
		</div>
	</div>
</section>

<section id="status" class="section section-dark" aria-labelledby="status-title">
	<div class="wrap status-grid">
		<div>
			<p class="kicker">04 · Status</p>
			<h2 id="status-title" data-reveal>${esc(v.status_title)}</h2>
			<p class="section-lead" data-reveal>${esc(v.status_text)}</p>
			<p class="status-note">${esc(v.status_note)}</p>
			${photo(images, 'status', 'photo section-photo')}
		</div>
		<div class="status-track" aria-label="Development phase">
			<ul><li class="done">Concept</li><li class="current" aria-current="step">Prototype</li><li>Validation</li><li>Pilots</li></ul>
		</div>
	</div>
</section>

<section id="contact" class="section" aria-labelledby="contact-title">
	<div class="wrap contact-grid">
		<div>
			<p class="kicker">05 · Contact</p>
			<h2 id="contact-title" data-reveal>${esc(v.contact_title)}</h2>
			<p class="section-lead" data-reveal>${esc(v.contact_text)}</p>
		</div>
		<div>
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
	</div>
</section>
</main>`;
	return layout({ title: `${v.site_name}: ${v.hero_title}`, description: v.meta_description, body, name: v.site_name, footerNote: v.company_line });
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
	return layout({ title: `Privacy statement | ${v.site_name}`, body, name: v.site_name, footerNote: v.company_line });
}

function renderNotFound(name) {
	return layout({ title: `Not found | ${name}`, name, body: '<main id="main" class="wrap prose page-main"><h1>Page not found</h1><p><a href="/">Back to the home page</a></p></main>' });
}

module.exports = { esc, layout, renderHome, renderPrivacy, renderNotFound };
