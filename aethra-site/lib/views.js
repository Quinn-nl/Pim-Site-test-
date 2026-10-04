'use strict';
const { ROLES } = require('./fields');
const { LANGS, LANG_NAMES, OG_LOCALE, UI } = require('./i18n');
const { AUDIENCES, labelFor } = require('./audiences');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LOGO = '<svg class="logo-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false"><g transform="translate(16 16) rotate(-28)"><defs><mask id="am"><rect x="-16" y="-16" width="32" height="32" fill="#fff"/><path d="M-14 0A14 5.5 0 0 0 14 0" fill="none" stroke="#000" stroke-width="4.2"/></mask></defs><path d="M-14 0A14 5.5 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle r="6" fill="currentColor" mask="url(#am)"/><path d="M-14 0A14 5.5 0 0 0 14 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="6.6" y="-6.1" width="3.8" height="3.8" rx=".6" fill="currentColor" transform="rotate(32 8.5 -4.2)"/></g></svg>';

const ICONS = {
	detect: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
	decide: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 6.5l10 4.5M7 17.5l10-4.5"/>',
	switch: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3"/>',
	city: '<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>',
	fleet: '<path d="M2 17V6h11v11M13 9h4l4 4v4h-2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
	factory: '<path d="M3 21V10l6 4v-4l6 4V5h6v16z"/>',
	check: '<path d="M4 12.5l5 5L20 6.5"/>',
	chart: '<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
	route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 000-6h-4a3 3 0 010-6h6"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
const STEP_ICONS = ['detect', 'decide', 'switch'];
const APP_ICONS = ['city', 'fleet', 'factory', 'route'];
const APP_ROLES = ['Municipality', 'Fleet operator', 'Vehicle manufacturer', 'Mobility platform'];

/** Localised URL for a page key ('/' for home). */
const url = (lang, page = '/') => `/${lang}${page === '/' ? '/' : page}`;
/* UTM tags seen on the current request are passed on through internal links, so a campaign visitor
   stays attributed on the way to the contact form without any cookie or storage. Rendering is synchronous. */
let carry = '';
const setCarry = (utm) => {
	const parts = [];
	if (utm && utm.source) parts.push(`utm_source=${encodeURIComponent(utm.source)}`);
	if (utm && utm.campaign) parts.push(`utm_campaign=${encodeURIComponent(utm.campaign)}`);
	carry = parts.join('&amp;'); // used only inside HTML attributes
};
const link = (lang, page = '/') => {
	const u = url(lang, page);
	return carry ? `${u}${u.includes('?') ? '&amp;' : '?'}${carry}` : u;
};
const clip = (text, max = 155) => {
	const t = String(text || '').replace(/\s+/g, ' ').trim();
	if (t.length <= max) return t;
	return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
};
const jsonLd = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

function layout({ lang, page, title, description, body, v, siteUrl, images = {}, noindex = false, graph = null, stickyCta = true }) {
	const t = UI[lang];
	const name = v.site_name;
	const navLink = (p, label) => `<a href="${link(lang, p)}"${page === p ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
	const nav = [['/problem', t.nav_problem], ['/how-it-works', t.nav_how], ['/applications', t.nav_apps]];
	const canonical = `${siteUrl}${url(lang, page)}`;
	const social = images.social ? `${siteUrl}/uploads/${images.social.file}` : `${siteUrl}/img/og-default-${lang}.png`;
	const socialSize = images.social && images.social.w ? [images.social.w, images.social.h] : (images.social ? null : [1200, 630]);
	const desc = clip(description);
	const alternates = page === null || noindex ? '' : [
		...LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${esc(siteUrl + url(l, page))}">`),
		`<link rel="alternate" hreflang="x-default" href="${esc(siteUrl + '/')}">`,
	].join('\n');
	const switcher = `<span class="lang" role="group" aria-label="${esc(t.language)}">${LANGS.map((l) => `<a href="${link(l, page || '/')}" hreflang="${l}" lang="${l}" data-lang="${l}" title="${esc(LANG_NAMES[l])}"${l === lang ? ' aria-current="true"' : ''}>${l.toUpperCase()}</a>`).join('')}</span>`;
	return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>${esc(title)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}
<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
<link rel="canonical" href="${esc(canonical)}">
${alternates}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(name)}">
<meta property="og:title" content="${esc(title)}">
${desc ? `<meta property="og:description" content="${esc(desc)}">` : ''}
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="${OG_LOCALE[lang]}">
${LANGS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`).join('\n')}
<meta property="og:image" content="${esc(social)}">
<meta property="og:image:alt" content="${esc(v.site_name)}: ${esc(v.hero_title)}">
${socialSize ? `<meta property="og:image:width" content="${socialSize[0]}">
<meta property="og:image:height" content="${socialSize[1]}">
` : ''}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(social)}">
<meta name="twitter:image:alt" content="${esc(v.site_name)}: ${esc(v.hero_title)}">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#f7f9fc">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
${graph ? `<script type="application/ld+json">${jsonLd(graph)}</script>` : ''}
<link rel="preload" href="/fonts/exo-2-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/ibm-plex-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<script src="/js/init.js"></script>
<link rel="stylesheet" href="/css/design-tokens.css">
<link rel="stylesheet" href="/css/site.css">
<script src="/js/site.js" defer></script>
</head>
<body>
<a class="skip-link" href="#main">${esc(t.skip)}</a>
<header class="site-header">
	<div class="wrap header-inner">
		<a class="brand" href="${link(lang)}" aria-label="${esc(name)}">${LOGO}<span class="brand-name">${esc(name.toUpperCase())}</span></a>
		<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">${esc(t.menu)}</button>
		<nav id="site-nav" class="site-nav" aria-label="${esc(t.primary_nav)}">
			${nav.map(([p, l]) => navLink(p, l)).join('\n\t\t\t')}
			${switcher}
			<a class="btn btn-small" href="${link(lang, '/contact')}"${page === '/contact' ? ' aria-current="page"' : ''}>${esc(t.nav_contact)}</a>
		</nav>
	</div>
</header>
${body}
${stickyCta && page !== '/contact' ? `<aside aria-label="${esc(t.contact_aside)}"><a class="sticky-cta" href="${link(lang, '/contact')}">${esc(v.hero_cta)}</a></aside>` : ''}
<footer class="site-footer">
	<div class="wrap footer-inner">
		<div><p class="footer-brand">${esc(name.toUpperCase())}</p>${v.company_line ? `<p class="footer-note">${esc(v.company_line)}</p>` : ''}</div>
		<nav aria-label="${esc(t.footer_nav)}">${nav.map(([p, l]) => navLink(p, l)).join('')}${navLink('/contact', t.nav_contact)}${navLink('/privacy', t.privacy)}</nav>
	</div>
	<div class="wrap footer-audiences"><nav aria-label="${esc(t.aud_other)}">${AUDIENCES.map((a) => `<a href="${link(lang, '/for/' + a.slug)}"${page === '/for/' + a.slug ? ' aria-current="page"' : ''}>${esc(labelFor(a, lang))}</a>`).join('')}</nav></div>
	<div class="wrap footer-bottom"><small>&copy; ${new Date().getFullYear()} ${esc(name)}. ${esc(t.disclaimer)}</small></div>
</footer>
</body>
</html>`;
}

const crumbs = (lang, siteUrl, v, page, label) => ({
	'@type': 'BreadcrumbList',
	itemListElement: [
		{ '@type': 'ListItem', position: 1, name: v.site_name, item: siteUrl + url(lang) },
		{ '@type': 'ListItem', position: 2, name: label, item: siteUrl + url(lang, page) },
	],
});

function photo(images, slot, cls, { priority = false } = {}) {
	const img = images[slot];
	if (!img) return '';
	const size = img.w && img.h ? ` width="${Number(img.w)}" height="${Number(img.h)}"` : '';
	const load = priority ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"';
	return `<img class="${cls}" src="/uploads/${esc(img.file)}" alt="${esc(img.alt || '')}"${size}${load}>`;
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

const ctaBand = (lang, v) => `
<section class="cta-band" aria-labelledby="cta-title">
	<div class="wrap cta-inner">
		<div><h2 id="cta-title">${esc(v.cta_title)}</h2>${v.cta_text ? `<p>${esc(v.cta_text)}</p>` : ''}</div>
		<a class="btn btn-light" href="${link(lang, '/contact')}">${esc(v.hero_cta)}</a>
	</div>
</section>`;

const fact = (t, v, n) => `
<figure class="fact" data-reveal>
	<p class="fact-value">${esc(v[`fact${n}_value`])}</p>
	<figcaption>${esc(v[`fact${n}_label`])}
		${v[`fact${n}_source`] || v[`fact${n}_url`] ? `<span class="source">${esc(t.source)}: ${v[`fact${n}_url`] ? `<a href="${esc(v[`fact${n}_url`])}" rel="noopener noreferrer" target="_blank">${esc(v[`fact${n}_source`] || v[`fact${n}_url`])}</a>` : esc(v[`fact${n}_source`])}</span>` : ''}
	</figcaption>
</figure>`;

const roadmap = (t) => `<ul><li class="done">${esc(t.rm[0])}<span class="sr"> (${esc(t.rm_done)})</span></li><li class="current" aria-current="step">${esc(t.rm[1])}<span class="sr"> (${esc(t.rm_current)})</span></li><li>${esc(t.rm[2])}</li><li>${esc(t.rm[3])}</li></ul>`;

function renderHome({ lang, values: v, images }, { siteUrl }) {
	const t = UI[lang];
	const steps = [1, 2, 3].map((n) => `
		<li class="mini-step">${icon(STEP_ICONS[n - 1])}<div><h3>${esc(v[`step${n}_title`])}</h3><p>${esc(v[`step${n}_text`])}</p></div></li>`).join('');
	const apps = AUDIENCES.map((a) => `<li><a href="${link(lang, '/for/' + a.slug)}">${icon(a.icon)}<span>${esc(labelFor(a, lang))}</span></a></li>`).join('');
	const body = `
<main id="main">
<section class="hero" aria-labelledby="hero-title">
	<div class="hero-sky" aria-hidden="true"></div>
	<div class="wrap hero-inner">
		${v.hero_eyebrow ? `<p class="eyebrow">${esc(v.hero_eyebrow)}</p>` : ''}
		<h1 id="hero-title">${esc(v.hero_title)}</h1>
		${v.hero_text ? `<p class="lead">${esc(v.hero_text)}</p>` : ''}
		<p class="hero-actions"><a class="btn btn-light" href="${link(lang, '/contact')}">${esc(v.hero_cta)}</a><a class="btn btn-ghost" href="${link(lang, '/how-it-works')}">${esc(t.how_cta)}</a></p>
		${photo(images, 'hero', 'photo hero-photo', { priority: true })}
	</div>
</section>

<section class="section" aria-labelledby="home-problem">
	<div class="wrap split">
		${fact(t, v, 1)}
		<div>
			<p class="kicker">${esc(t.k_problem)}</p>
			<h2 id="home-problem">${esc(v.home_problem_line)}</h2>
			<p><a class="more" href="${link(lang, '/problem')}">${esc(t.read_problem)}</a></p>
		</div>
	</div>
</section>

<section class="section section-tint" aria-labelledby="home-how">
	<div class="wrap">
		<p class="kicker">${esc(t.k_how)}</p>
		<h2 id="home-how">${esc(v.steps_title)}</h2>
		<ol class="mini-steps">${steps}
		</ol>
		<p><a class="more" href="${link(lang, '/how-it-works')}">${esc(t.read_how)}</a></p>
	</div>
</section>

<section class="section" aria-labelledby="home-apps">
	<div class="wrap">
		<p class="kicker">${esc(t.k_apps)}</p>
		<h2 id="home-apps">${esc(v.apps_title)}</h2>
		<ul class="chips">${apps}</ul>
		<p><a class="more" href="${link(lang, '/applications')}">${esc(t.read_apps)}</a></p>
	</div>
</section>

<section class="status-band" aria-label="${esc(t.k_status)}">
	<div class="wrap status-inner">
		<div class="status-track" aria-label="${esc(t.phase)}">${roadmap(t)}</div>
		${v.status_short ? `<p>${esc(v.status_short)}</p>` : ''}
	</div>
</section>
${ctaBand(lang, v)}
</main>`;
	const home = siteUrl + url(lang);
	const graph = { '@context': 'https://schema.org', '@graph': [
		{ '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: v.site_name, url: home, description: v.meta_description, logo: `${siteUrl}/img/logo-mark.svg`, ...(v.linkedin_url ? { sameAs: [v.linkedin_url] } : {}) },
		{ '@type': 'WebSite', '@id': `${siteUrl}/#website`, name: v.site_name, url: home, inLanguage: lang, publisher: { '@id': `${siteUrl}/#organization` } },
	] };
	return layout({ lang, page: '/', title: v.seo_home, description: v.meta_description, body, v, siteUrl, images, graph });
}

function renderProblem({ lang, values: v, images }, { siteUrl }) {
	const t = UI[lang];
	const body = `
<main id="main">
${pageHead(t.k_problem, v.problem_title, v.problem_text)}
<section class="section">
	<div class="wrap">
		<div class="facts">${fact(t, v, 1)}${fact(t, v, 2)}</div>
		${photo(images, 'problem', 'photo section-photo')}
		<p class="next"><a class="more" href="${link(lang, '/how-it-works')}">${esc(t.next_problem)}</a></p>
	</div>
</section>
${ctaBand(lang, v)}
</main>`;
	return layout({ lang, page: '/problem', title: `${v.seo_problem} | ${v.site_name}`, description: v.problem_text, body, v, siteUrl, images, graph: { '@context': 'https://schema.org', ...crumbs(lang, siteUrl, v, '/problem', t.nav_problem) } });
}

function renderHow({ lang, values: v, images }, { siteUrl }) {
	const t = UI[lang];
	const steps = [1, 2, 3].map((n) => `
		<li class="step" data-reveal>${icon(STEP_ICONS[n - 1])}<span class="step-num" aria-hidden="true">0${n}</span><h2>${esc(v[`step${n}_title`])}</h2><p>${esc(v[`step${n}_text`])}</p></li>`).join('');
	const body = `
<main id="main">
${pageHead(t.k_how, v.steps_title, '')}
<section class="section">
	<div class="wrap">
		<ol class="steps">${steps}
		</ol>
	</div>
</section>
<section class="section section-dark" aria-labelledby="status-title">
	<div class="wrap status-grid">
		<div>
			<p class="kicker">${esc(t.k_status)}</p>
			<h2 id="status-title">${esc(v.status_title)}</h2>
			<p class="section-lead">${esc(v.status_text)}</p>
			${v.status_note ? `<p class="status-note">${esc(v.status_note)}</p>` : ''}
			${photo(images, 'status', 'photo section-photo')}
		</div>
		<div class="status-track" aria-label="${esc(t.phase)}">${roadmap(t)}</div>
	</div>
</section>
${ctaBand(lang, v)}
</main>`;
	return layout({ lang, page: '/how-it-works', title: `${v.seo_how} | ${v.site_name}`, description: `${v.step1_text} ${v.step2_text} ${v.step3_text}`, body, v, siteUrl, images, graph: { '@context': 'https://schema.org', ...crumbs(lang, siteUrl, v, '/how-it-works', t.nav_how) } });
}

function renderApplications({ lang, values: v, images }, { siteUrl }) {
	const t = UI[lang];
	const cards = [1, 2, 3, 4].map((n) => {
		const a = AUDIENCES[n - 1];
		return `
		<article class="card" data-reveal>${icon(APP_ICONS[n - 1])}<h2>${esc(v[`app${n}_title`])}</h2><p>${esc(v[`app${n}_text`])}</p><p class="card-links"><a class="more" href="${link(lang, '/for/' + a.slug)}">${esc(t.learn_more)}</a><a class="more" href="${link(lang, '/contact')}${carry ? '&amp;' : '?'}role=${encodeURIComponent(APP_ROLES[n - 1])}">${esc(t.card_cta)}</a></p></article>`;
	}).join('');
	const inv = AUDIENCES[4];
	const body = `
<main id="main">
${pageHead(t.k_apps, v.apps_title, '')}
<section class="section">
	<div class="wrap"><div class="cards">${cards}
	</div>
	<p class="next"><a class="more" href="${link(lang, '/for/' + inv.slug)}">${esc(t.aud_for)} ${esc(labelFor(inv, lang).toLowerCase())}</a></p></div>
</section>
${ctaBand(lang, v)}
</main>`;
	return layout({ lang, page: '/applications', title: `${v.seo_apps} | ${v.site_name}`, description: [1, 2, 3, 4].map((n) => v[`app${n}_title`]).join(', ') + '. ' + v.meta_description, body, v, siteUrl, images, graph: { '@context': 'https://schema.org', ...crumbs(lang, siteUrl, v, '/applications', t.nav_apps) } });
}

function renderContact({ lang, values: v, images }, { siteUrl, status = '', token = '', role = '', form = {}, errors = {}, utm = {} }) {
	const t = UI[lang];
	const selected = ROLES.includes(form.role || role) ? (form.role || role) : '';
	const errorKeys = Object.keys(errors);
	const consent = esc(t.f_consent).replace('{link}', `<a href="${link(lang, '/privacy')}">${esc(t.privacy_link)}</a>`);
	const msg = { sent: ['ok', t.n_sent], error: ['err', t.n_error], limit: ['err', t.n_limit], expired: ['err', t.n_expired] }[status];
	const errText = { name: t.e_name, email: t.e_email, message: t.e_msg, consent: t.e_consent };
	const field = (key, id, label, input, extra = '') => `<div class="field${errors[key] ? ' has-error' : ''}"${extra}><label for="${id}">${esc(label)}</label>${input}${errors[key] ? `<p class="field-error" id="e-${key}">${esc(errText[key])}</p>` : ''}</div>`;
	const bad = (key) => (errors[key] ? ` aria-invalid="true" aria-describedby="e-${key}"` : '');
	const summary = errorKeys.length ? `<div class="notice notice-err" id="error-summary" tabindex="-1" data-autofocus role="alert"><strong>${esc(t.n_invalid)}</strong><ul>${errorKeys.map((k) => `<li><a href="#f-${k === 'message' ? 'msg' : k}">${esc(errText[k])}</a></li>`).join('')}</ul></div>` : '';
	const success = `
		<div class="success" tabindex="-1" data-autofocus role="status">
			<h2>${esc(t.ok_title)}</h2>
			<p>${esc(t.n_sent)}</p>
			<h3>${esc(t.ok_next)}</h3>
			<ol><li>${esc(t.ok_1)}</li><li>${esc(t.ok_2)}</li></ol>
			${v.contact_reply ? `<p class="reply-note">${esc(v.contact_reply)}</p>` : ''}
			<p class="hero-actions"><a class="btn" href="${link(lang)}">${esc(t.ok_home)}</a><a class="btn btn-outline" href="${link(lang, '/how-it-works')}">${esc(t.ok_how)}</a></p>
		</div>`;
	const formHtml = `
		${msg ? `<p class="notice notice-${msg[0]}" tabindex="-1" data-autofocus role="${msg[0] === 'ok' ? 'status' : 'alert'}">${esc(msg[1])}</p>` : ''}
		${summary}
		${v.contact_reply ? `<p class="reply-note">${esc(v.contact_reply)}</p>` : ''}
		<form class="form" method="post" action="${url(lang, '/contact')}" novalidate>
			<p class="required-note">${esc(t.f_required)}</p>
			<input type="hidden" name="token" value="${esc(token)}">
			${utm.source ? `<input type="hidden" name="utm_source" value="${esc(utm.source)}">` : ''}${utm.campaign ? `<input type="hidden" name="utm_campaign" value="${esc(utm.campaign)}">` : ''}
			<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
			${field('role', 'f-role', t.f_role, `<select id="f-role" name="role">${ROLES.map((r) => `<option value="${esc(r)}"${r === selected ? ' selected' : ''}>${esc(t.roles[r])}</option>`).join('')}</select>`)}
			${field('name', 'f-name', `${t.f_name} *`, `<input id="f-name" name="name" type="text" autocomplete="name" autocapitalize="words" enterkeyhint="next" maxlength="120" required value="${esc(form.name)}"${bad('name')}>`)}
			${field('email', 'f-email', `${t.f_email} *`, `<input id="f-email" name="email" type="email" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" enterkeyhint="next" maxlength="200" required value="${esc(form.email)}"${bad('email')}>`)}
			${field('org', 'f-org', t.f_org, `<input id="f-org" name="organisation" type="text" autocomplete="organization" autocapitalize="words" enterkeyhint="next" maxlength="160" value="${esc(form.org)}">`)}
			${field('message', 'f-msg', `${t.f_msg} *`, `<textarea id="f-msg" name="message" rows="5" maxlength="5000" required${bad('message')}>${esc(form.message)}</textarea>`)}
			<div class="field check${errors.consent ? ' has-error' : ''}"><input id="f-consent" name="consent" type="checkbox" value="1" required${bad('consent')}><label for="f-consent">${consent}</label>${errors.consent ? `<p class="field-error" id="e-consent">${esc(errText.consent)}</p>` : ''}</div>
			<button class="btn" type="submit" data-sending="${esc(t.f_sending)}">${esc(t.f_send)}</button>
			<p class="trust">${esc(t.f_trust)}</p>
		</form>`;
	const body = `
<main id="main">
${pageHead(t.k_contact, v.contact_title, status === 'sent' ? '' : v.contact_text)}
<section class="section">
	<div class="wrap narrow-form">${status === 'sent' ? success : formHtml}
	</div>
</section>
</main>`;
	return layout({ lang, page: '/contact', title: `${v.seo_contact} | ${v.site_name}`, description: v.contact_text, body, v, siteUrl, images, stickyCta: false });
}

function renderAudience({ lang, values: v, images }, { siteUrl }, slug) {
	const t = UI[lang];
	const a = AUDIENCES.find((x) => x.slug === slug);
	const k = (n) => v[`aud_${slug}_${n}`];
	const pageKey = `/for/${slug}`;
	const faq = [1, 2].map((n) => ({ q: k(`q${n}`), a: k(`a${n}`) })).filter((f) => f.q && f.a);
	const others = AUDIENCES.filter((x) => x.slug !== slug);
	const body = `
<main id="main">
${pageHead(`${t.aud_for} ${labelFor(a, lang).toLowerCase()}`, k('title'), k('lead'))}
<section class="section" aria-labelledby="points-title">
	<div class="wrap">
		<h2 id="points-title" class="sr">${esc(k('title'))}</h2>
		<ul class="points">${[1, 2, 3].map((n) => `<li data-reveal>${icon('check')}<p>${esc(k(`p${n}`))}</p></li>`).join('')}</ul>
		<p class="hero-actions"><a class="btn" href="${link(lang, '/contact')}${carry ? '&amp;' : '?'}role=${encodeURIComponent(a.role)}">${esc(v.hero_cta)}</a><a class="btn btn-outline" href="${link(lang, '/how-it-works')}">${esc(t.how_cta)}</a></p>
	</div>
</section>
<section class="section section-tint" aria-labelledby="faq-title">
	<div class="wrap narrow-form">
		<h2 id="faq-title">${esc(t.faq_title)}</h2>
		<div class="faq">${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
	</div>
</section>
<section class="section" aria-labelledby="others-title">
	<div class="wrap">
		<h2 id="others-title" class="small-h">${esc(t.aud_other)}</h2>
		<ul class="chips">${others.map((x) => `<li><a href="${link(lang, '/for/' + x.slug)}">${icon(x.icon)}<span>${esc(labelFor(x, lang))}</span></a></li>`).join('')}</ul>
	</div>
</section>
${ctaBand(lang, v)}
</main>`;
	const graph = { '@context': 'https://schema.org', '@graph': [
		crumbs(lang, siteUrl, v, pageKey, labelFor(a, lang)),
		{ '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
	] };
	return layout({ lang, page: pageKey, title: `${k('seo')} | ${v.site_name}`, description: `${k('title')}. ${k('lead')}`, body, v, siteUrl, images, graph });
}

function renderPrivacy({ lang, values: v, privacy, images }, { siteUrl }) {
	const t = UI[lang];
	const blocks = privacy.split(/\n{2,}|\n(?=# )/).map((b) => b.trim()).filter(Boolean).map((b) => {
		if (b.startsWith('# ')) {
			const [head, ...rest] = b.split('\n');
			return `<h2>${esc(head.slice(2))}</h2>${rest.length ? `<p>${esc(rest.join(' '))}</p>` : ''}`;
		}
		return `<p>${esc(b.replace(/\n/g, ' '))}</p>`;
	}).join('\n');
	const body = `<main id="main" class="wrap prose page-main"><h1>${esc(t.privacy_title)}</h1>\n${blocks}</main>`;
	return layout({ lang, page: '/privacy', title: `${t.privacy_title} | ${v.site_name}`, description: t.privacy_desc, body, v, siteUrl, images, stickyCta: false });
}

function renderNotFound({ lang, values: v }, { siteUrl }) {
	const t = UI[lang];
	return layout({ lang, page: null, title: `${t.nf_title} | ${v.site_name}`, description: '', noindex: true, v, siteUrl, stickyCta: false, body: `<main id="main" class="wrap prose page-main"><h1>${esc(t.nf_title)}</h1><p><a href="${link(lang)}">${esc(t.nf_back)}</a></p></main>` });
}

const PAGES = ['/', '/problem', '/how-it-works', '/applications', ...AUDIENCES.map((a) => `/for/${a.slug}`), '/contact', '/privacy'];

function renderSitemap(siteUrl, lastmod) {
	const alt = (page) => [...LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(siteUrl + url(l, page))}"/>`), `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(siteUrl + '/')}"/>`].join('');
	const entries = PAGES.flatMap((page) => LANGS.map((l) => `<url><loc>${esc(siteUrl + url(l, page))}</loc><lastmod>${lastmod}</lastmod>${alt(page)}</url>`));
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

module.exports = { esc, url, setCarry, renderAudience, PAGES, renderHome, renderProblem, renderHow, renderApplications, renderContact, renderPrivacy, renderNotFound, renderSitemap };
