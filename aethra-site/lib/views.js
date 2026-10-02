'use strict';
const { ROLES } = require('./fields');
const { LANGS, LANG_NAMES, OG_LOCALE, UI } = require('./i18n');

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
const APP_ROLES = ['Municipality', 'Fleet operator', 'Vehicle manufacturer', 'Mobility platform'];

/** Localised URL for a page key ('/' for home). */
const url = (lang, page = '/') => `/${lang}${page === '/' ? '/' : page}`;
const clip = (text, max = 155) => {
	const t = String(text || '').replace(/\s+/g, ' ').trim();
	if (t.length <= max) return t;
	return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
};
const jsonLd = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

function layout({ lang, page, title, description, body, v, siteUrl, noindex = false, graph = null, stickyCta = true }) {
	const t = UI[lang];
	const name = v.site_name;
	const link = (p, label) => `<a href="${url(lang, p)}"${page === p ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
	const nav = [['/problem', t.nav_problem], ['/how-it-works', t.nav_how], ['/applications', t.nav_apps]];
	const canonical = `${siteUrl}${url(lang, page)}`;
	const desc = clip(description);
	const alternates = page === null || noindex ? '' : [
		...LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${esc(siteUrl + url(l, page))}">`),
		`<link rel="alternate" hreflang="x-default" href="${esc(siteUrl + '/')}">`,
	].join('\n');
	const switcher = `<span class="lang" role="group" aria-label="${esc(t.language)}">${LANGS.map((l) => `<a href="${url(l, page || '/')}" hreflang="${l}" lang="${l}" data-lang="${l}" title="${esc(LANG_NAMES[l])}"${l === lang ? ' aria-current="true"' : ''}>${l.toUpperCase()}</a>`).join('')}</span>`;
	return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0b1b33">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
${graph ? `<script type="application/ld+json">${jsonLd(graph)}</script>` : ''}
<script src="/js/init.js"></script>
<link rel="stylesheet" href="/css/site.css">
<script src="/js/site.js" defer></script>
</head>
<body>
<a class="skip-link" href="#main">${esc(t.skip)}</a>
<header class="site-header">
	<div class="wrap header-inner">
		<a class="brand" href="${url(lang)}" aria-label="${esc(name)}">${LOGO}<span class="brand-name">${esc(name.toUpperCase())}</span></a>
		<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">${esc(t.menu)}</button>
		<nav id="site-nav" class="site-nav" aria-label="${esc(t.primary_nav)}">
			${nav.map(([p, l]) => link(p, l)).join('\n\t\t\t')}
			${switcher}
			<a class="btn btn-small" href="${url(lang, '/contact')}"${page === '/contact' ? ' aria-current="page"' : ''}>${esc(t.nav_contact)}</a>
		</nav>
	</div>
</header>
${body}
${stickyCta && page !== '/contact' ? `<a class="sticky-cta" href="${url(lang, '/contact')}">${esc(v.hero_cta)}</a>` : ''}
<footer class="site-footer">
	<div class="wrap footer-inner">
		<div><p class="footer-brand">${esc(name.toUpperCase())}</p><p class="footer-note">${esc(v.company_line)}</p></div>
		<nav aria-label="${esc(t.footer_nav)}">${nav.map(([p, l]) => link(p, l)).join('')}${link('/contact', t.nav_contact)}${link('/privacy', t.privacy)}</nav>
	</div>
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

const ctaBand = (lang, v) => `
<section class="cta-band" aria-labelledby="cta-title">
	<div class="wrap cta-inner">
		<div><h2 id="cta-title">${esc(v.cta_title)}</h2><p>${esc(v.cta_text)}</p></div>
		<a class="btn btn-light" href="${url(lang, '/contact')}">${esc(v.hero_cta)}</a>
	</div>
</section>`;

const fact = (t, v, n) => `
<figure class="fact">
	<p class="fact-value">${esc(v[`fact${n}_value`])}</p>
	<figcaption>${esc(v[`fact${n}_label`])}
		<span class="source">${esc(t.source)}: ${v[`fact${n}_url`] ? `<a href="${esc(v[`fact${n}_url`])}" rel="noopener noreferrer" target="_blank">${esc(v[`fact${n}_source`])}</a>` : esc(v[`fact${n}_source`])}</span>
	</figcaption>
</figure>`;

const roadmap = (t) => `<ul><li class="done">${esc(t.rm[0])}</li><li class="current" aria-current="step">${esc(t.rm[1])}</li><li>${esc(t.rm[2])}</li><li>${esc(t.rm[3])}</li></ul>`;

function renderHome({ lang, values: v, images }, { siteUrl }) {
	const t = UI[lang];
	const steps = [1, 2, 3].map((n) => `
		<li class="mini-step">${icon(STEP_ICONS[n - 1])}<div><h3>${esc(v[`step${n}_title`])}</h3><p>${esc(v[`step${n}_text`])}</p></div></li>`).join('');
	const apps = [1, 2, 3, 4].map((n) => `<li><a href="${url(lang, '/contact')}?role=${encodeURIComponent(APP_ROLES[n - 1])}">${icon(APP_ICONS[n - 1])}<span>${esc(v[`app${n}_title`])}</span></a></li>`).join('');
	const body = `
<main id="main">
<section class="hero" aria-labelledby="hero-title">
	<div class="hero-sky" aria-hidden="true"></div>
	<div class="wrap hero-inner">
		<p class="eyebrow">${esc(v.hero_eyebrow)}</p>
		<h1 id="hero-title">${esc(v.hero_title)}</h1>
		<p class="lead">${esc(v.hero_text)}</p>
		<p class="hero-actions"><a class="btn btn-light" href="${url(lang, '/contact')}">${esc(v.hero_cta)}</a><a class="btn btn-ghost" href="${url(lang, '/how-it-works')}">${esc(t.how_cta)}</a></p>
		${photo(images, 'hero', 'photo hero-photo')}
	</div>
</section>

<section class="section" aria-labelledby="home-problem">
	<div class="wrap split">
		${fact(t, v, 1)}
		<div>
			<p class="kicker">${esc(t.k_problem)}</p>
			<h2 id="home-problem">${esc(v.home_problem_line)}</h2>
			<p><a class="more" href="${url(lang, '/problem')}">${esc(t.read_problem)}</a></p>
		</div>
	</div>
</section>

<section class="section section-tint" aria-labelledby="home-how">
	<div class="wrap">
		<p class="kicker">${esc(t.k_how)}</p>
		<h2 id="home-how">${esc(v.steps_title)}</h2>
		<ol class="mini-steps">${steps}
		</ol>
		<p><a class="more" href="${url(lang, '/how-it-works')}">${esc(t.read_how)}</a></p>
	</div>
</section>

<section class="section" aria-labelledby="home-apps">
	<div class="wrap">
		<p class="kicker">${esc(t.k_apps)}</p>
		<h2 id="home-apps">${esc(v.apps_title)}</h2>
		<ul class="chips">${apps}</ul>
		<p><a class="more" href="${url(lang, '/applications')}">${esc(t.read_apps)}</a></p>
	</div>
</section>

<section class="status-band" aria-label="${esc(t.k_status)}">
	<div class="wrap status-inner">
		<div class="status-track" aria-label="${esc(t.phase)}">${roadmap(t)}</div>
		<p>${esc(v.status_short)}</p>
	</div>
</section>
${ctaBand(lang, v)}
</main>`;
	const home = siteUrl + url(lang);
	const graph = { '@context': 'https://schema.org', '@graph': [
		{ '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: v.site_name, url: home, description: v.meta_description },
		{ '@type': 'WebSite', '@id': `${siteUrl}/#website`, name: v.site_name, url: home, inLanguage: lang, publisher: { '@id': `${siteUrl}/#organization` } },
	] };
	return layout({ lang, page: '/', title: `${v.site_name}: ${v.hero_title}`, description: v.meta_description, body, v, siteUrl, graph });
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
		<p class="next"><a class="more" href="${url(lang, '/how-it-works')}">${esc(t.next_problem)}</a></p>
	</div>
</section>
${ctaBand(lang, v)}
</main>`;
	return layout({ lang, page: '/problem', title: `${v.problem_title} | ${v.site_name}`, description: v.problem_text, body, v, siteUrl, graph: { '@context': 'https://schema.org', ...crumbs(lang, siteUrl, v, '/problem', t.nav_problem) } });
}

function renderHow({ lang, values: v, images }, { siteUrl }) {
	const t = UI[lang];
	const steps = [1, 2, 3].map((n) => `
		<li class="step">${icon(STEP_ICONS[n - 1])}<span class="step-num" aria-hidden="true">0${n}</span><h2>${esc(v[`step${n}_title`])}</h2><p>${esc(v[`step${n}_text`])}</p></li>`).join('');
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
			<p class="status-note">${esc(v.status_note)}</p>
			${photo(images, 'status', 'photo section-photo')}
		</div>
		<div class="status-track" aria-label="${esc(t.phase)}">${roadmap(t)}</div>
	</div>
</section>
${ctaBand(lang, v)}
</main>`;
	return layout({ lang, page: '/how-it-works', title: `${v.steps_title} | ${v.site_name}`, description: `${v.step1_text} ${v.step2_text} ${v.step3_text}`, body, v, siteUrl, graph: { '@context': 'https://schema.org', ...crumbs(lang, siteUrl, v, '/how-it-works', t.nav_how) } });
}

function renderApplications({ lang, values: v }, { siteUrl }) {
	const t = UI[lang];
	const cards = [1, 2, 3, 4].map((n) => `
		<article class="card">${icon(APP_ICONS[n - 1])}<h2>${esc(v[`app${n}_title`])}</h2><p>${esc(v[`app${n}_text`])}</p><p><a class="more" href="${url(lang, '/contact')}?role=${encodeURIComponent(APP_ROLES[n - 1])}">${esc(t.card_cta)}</a></p></article>`).join('');
	const body = `
<main id="main">
${pageHead(t.k_apps, v.apps_title, '')}
<section class="section">
	<div class="wrap"><div class="cards">${cards}
	</div></div>
</section>
${ctaBand(lang, v)}
</main>`;
	return layout({ lang, page: '/applications', title: `${v.apps_title} | ${v.site_name}`, description: [1, 2, 3, 4].map((n) => v[`app${n}_title`]).join(', ') + '. ' + v.meta_description, body, v, siteUrl, graph: { '@context': 'https://schema.org', ...crumbs(lang, siteUrl, v, '/applications', t.nav_apps) } });
}

function renderContact({ lang, values: v }, { siteUrl, status = '', token = '', role = '' }) {
	const t = UI[lang];
	const notice = { sent: ['ok', t.n_sent], invalid: ['err', t.n_invalid], error: ['err', t.n_error], limit: ['err', t.n_limit] }[status];
	const consent = esc(t.f_consent).replace('{link}', `<a href="${url(lang, '/privacy')}">${esc(t.privacy_link)}</a>`);
	const selected = ROLES.includes(role) ? role : '';
	const body = `
<main id="main">
${pageHead(t.k_contact, v.contact_title, v.contact_text)}
<section class="section">
	<div class="wrap narrow-form">
		${notice ? `<p class="notice notice-${notice[0]}" role="${notice[0] === 'ok' ? 'status' : 'alert'}">${esc(notice[1])}</p>` : ''}
		${status === 'sent' ? '' : `<p class="reply-note">${esc(v.contact_reply)}</p>`}
		<form class="form" method="post" action="${url(lang, '/contact')}">
			<input type="hidden" name="token" value="${esc(token)}">
			<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
			<div class="field"><label for="f-role">${esc(t.f_role)}</label><select id="f-role" name="role">${ROLES.map((r) => `<option value="${esc(r)}"${r === selected ? ' selected' : ''}>${esc(t.roles[r])}</option>`).join('')}</select></div>
			<div class="field"><label for="f-name">${esc(t.f_name)} *</label><input id="f-name" name="name" type="text" autocomplete="name" maxlength="120" required></div>
			<div class="field"><label for="f-email">${esc(t.f_email)} *</label><input id="f-email" name="email" type="email" autocomplete="email" maxlength="200" required></div>
			<div class="field"><label for="f-org">${esc(t.f_org)}</label><input id="f-org" name="organisation" type="text" autocomplete="organization" maxlength="160"></div>
			<div class="field"><label for="f-msg">${esc(t.f_msg)} *</label><textarea id="f-msg" name="message" rows="5" maxlength="5000" required></textarea></div>
			<div class="field check"><input id="f-consent" name="consent" type="checkbox" value="1" required><label for="f-consent">${consent}</label></div>
			<button class="btn" type="submit">${esc(t.f_send)}</button>
			<p class="trust">${esc(t.f_trust)}</p>
		</form>
	</div>
</section>
</main>`;
	return layout({ lang, page: '/contact', title: `${v.contact_title} | ${v.site_name}`, description: v.contact_text, body, v, siteUrl, stickyCta: false, noindex: false });
}

function renderPrivacy({ lang, values: v, privacy }, { siteUrl }) {
	const t = UI[lang];
	const blocks = privacy.split(/\n{2,}|\n(?=# )/).map((b) => b.trim()).filter(Boolean).map((b) => {
		if (b.startsWith('# ')) {
			const [head, ...rest] = b.split('\n');
			return `<h2>${esc(head.slice(2))}</h2>${rest.length ? `<p>${esc(rest.join(' '))}</p>` : ''}`;
		}
		return `<p>${esc(b.replace(/\n/g, ' '))}</p>`;
	}).join('\n');
	const body = `<main id="main" class="wrap prose page-main"><h1>${esc(t.privacy_title)}</h1>\n${blocks}</main>`;
	return layout({ lang, page: '/privacy', title: `${t.privacy_title} | ${v.site_name}`, description: '', body, v, siteUrl, stickyCta: false });
}

function renderNotFound({ lang, values: v }, { siteUrl }) {
	const t = UI[lang];
	return layout({ lang, page: null, title: `${t.nf_title} | ${v.site_name}`, description: '', noindex: true, v, siteUrl, stickyCta: false, body: `<main id="main" class="wrap prose page-main"><h1>${esc(t.nf_title)}</h1><p><a href="${url(lang)}">${esc(t.nf_back)}</a></p></main>` });
}

const PAGES = ['/', '/problem', '/how-it-works', '/applications', '/contact', '/privacy'];

function renderSitemap(siteUrl, lastmod) {
	const alt = (page) => [...LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(siteUrl + url(l, page))}"/>`), `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(siteUrl + '/')}"/>`].join('');
	const entries = PAGES.flatMap((page) => LANGS.map((l) => `<url><loc>${esc(siteUrl + url(l, page))}</loc><lastmod>${lastmod}</lastmod>${alt(page)}</url>`));
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

module.exports = { esc, url, PAGES, renderHome, renderProblem, renderHow, renderApplications, renderContact, renderPrivacy, renderNotFound, renderSitemap };
