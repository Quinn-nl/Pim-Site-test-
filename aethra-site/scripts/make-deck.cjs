'use strict';
/**
 * Builds the 5-slide introduction deck per language from the site copy (lib/i18n.js defaults), so the
 * brand guardrails apply to it automatically: public/deck/aethra-<lang>.html (+ deck.css, deck.js).
 * Strategy: Problem - Solution - Benefit (slides skill). Run: node scripts/make-deck.cjs
 */
const fs = require('fs');
const path = require('path');
const { LANGS, UI, defaultsFor } = require('../lib/i18n');
const { esc } = require('../lib/views');
const { AUDIENCES, labelFor } = require('../lib/audiences');

const OUT = path.join(__dirname, '../public/deck');
const T = {
	en: { slide: 'Slide', of: 'of', prev: 'Previous slide', next: 'Next slide', deck: 'Introduction', hint: 'Use the arrow keys or swipe' },
	nl: { slide: 'Dia', of: 'van', prev: 'Vorige dia', next: 'Volgende dia', deck: 'Introductie', hint: 'Gebruik de pijltjestoetsen of veeg' },
	de: { slide: 'Folie', of: 'von', prev: 'Vorherige Folie', next: 'Nächste Folie', deck: 'Einführung', hint: 'Pfeiltasten benutzen oder wischen' },
	fr: { slide: 'Diapositive', of: 'sur', prev: 'Diapositive précédente', next: 'Diapositive suivante', deck: 'Présentation', hint: 'Utilisez les flèches ou balayez' },
};

function deck(lang) {
	const v = defaultsFor(lang);
	const t = UI[lang];
	const d = T[lang];
	const fact = (n) => `<figure class="fact"><p class="fact-v">${esc(v[`fact${n}_value`])}</p><figcaption>${esc(v[`fact${n}_label`])}<span class="src">${esc(t.source)}: ${esc(v[`fact${n}_source`])}</span></figcaption></figure>`;
	const steps = [1, 2, 3].map((n) => `<li><span class="n">0${n}</span><h3>${esc(v[`step${n}_title`])}</h3><p>${esc(v[`step${n}_text`])}</p></li>`).join('');
	const aud = AUDIENCES.map((a) => `<li>${esc(labelFor(a, lang))}</li>`).join('');
	const road = `<ul class="road"><li class="done">${esc(t.rm[0])}</li><li class="now">${esc(t.rm[1])}</li><li>${esc(t.rm[2])}</li><li>${esc(t.rm[3])}</li></ul>`;
	const slides = [
		`<p class="eyebrow">${esc(v.hero_eyebrow)}</p><h1>${esc(v.hero_title)}</h1><p class="lead">${esc(v.hero_text)}</p>`,
		`<p class="eyebrow">${esc(t.k_problem)}</p><h2>${esc(v.home_problem_line)}</h2><div class="facts">${fact(1)}${fact(2)}</div>`,
		`<p class="eyebrow">${esc(t.k_how)}</p><h2>${esc(v.steps_title)}</h2><ol class="steps">${steps}</ol>`,
		`<p class="eyebrow">${esc(t.k_apps)}</p><h2>${esc(v.apps_title)}</h2><ul class="aud">${aud}</ul>${road}<p class="lead small">${esc(v.status_short)}</p>`,
		`<p class="eyebrow">${esc(t.k_contact)}</p><h2>${esc(v.cta_title)}</h2><p class="lead">${esc(v.cta_text)}</p><p class="note">${esc(v.status_note)}</p>`,
	];
	return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<title>${esc(v.site_name)}: ${esc(d.deck)}</title>
<link rel="stylesheet" href="/css/design-tokens.css">
<link rel="stylesheet" href="/deck/deck.css">
<script src="/deck/deck.js" defer></script>
</head>
<body>
<main class="deck" aria-roledescription="presentation" aria-label="${esc(v.site_name)}: ${esc(d.deck)}">
${slides.map((s, i) => `<section class="slide" id="s${i + 1}" aria-roledescription="slide" aria-label="${esc(d.slide)} ${i + 1} ${esc(d.of)} ${slides.length}"${i ? ' hidden' : ''}><div class="inner">${s}</div></section>`).join('\n')}
<footer class="bar">
<span class="brand">${esc(v.site_name.toUpperCase())}</span>
<button class="nav" id="prev" type="button" aria-label="${esc(d.prev)}">&larr;</button>
<span class="count" id="count" aria-live="polite">1 / ${slides.length}</span>
<button class="nav" id="next" type="button" aria-label="${esc(d.next)}">&rarr;</button>
<span class="disc">${esc(t.disclaimer)}</span>
<div class="progress" aria-hidden="true"><i id="bar"></i></div>
</footer>
<p class="sr" id="hint">${esc(d.hint)}</p>
</main>
</body>
</html>
`;
}

const css = `@font-face{font-family:"Exo 2";font-weight:700;font-display:swap;src:url("/fonts/exo-2-latin-700-normal.woff2") format("woff2")}
@font-face{font-family:"IBM Plex Sans";font-weight:400;font-display:swap;src:url("/fonts/ibm-plex-sans-latin-400-normal.woff2") format("woff2")}
@font-face{font-family:"IBM Plex Sans";font-weight:600;font-display:swap;src:url("/fonts/ibm-plex-sans-latin-600-normal.woff2") format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-weight:500;font-display:swap;src:url("/fonts/ibm-plex-mono-latin-500-normal.woff2") format("woff2")}
*{box-sizing:border-box;margin:0}
html,body{height:100%}
body{background:var(--space-0);color:var(--on-space);font-family:var(--font);overflow:hidden;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}
.deck{position:relative;height:100dvh;width:100%;max-width:calc(100dvh * 16 / 9);margin:0 auto;background:radial-gradient(120% 60% at 50% 140%,rgba(110,168,255,.4) 0%,rgba(31,95,209,.18) 40%,transparent 64%),linear-gradient(180deg,var(--space-0),var(--space) 60%,var(--space-2))}
.slide{position:absolute;inset:0 0 64px;display:flex;align-items:center;padding:clamp(1.25rem,6vw,5rem);padding-bottom:1rem;overflow:auto}
.slide[hidden]{display:none}
.inner{width:100%;max-width:62rem;margin:0 auto;animation:in 200ms var(--ease-out)}
@keyframes in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.eyebrow{font-family:var(--mono);font-weight:500;letter-spacing:.16em;text-transform:uppercase;font-size:clamp(.75rem,1.6vw,1rem);color:var(--glow);margin-bottom:1.1rem}
h1,h2,h3{font-family:var(--display);font-weight:700;color:var(--white);line-height:1.1;letter-spacing:-.01em;text-wrap:balance;overflow-wrap:break-word;hyphens:auto}
h1{font-size:clamp(2rem,6.4vw,4.6rem)}
h2{font-size:clamp(1.6rem,4.4vw,3.2rem);margin-bottom:clamp(1rem,3vw,2rem)}
h3{font-size:clamp(1.2rem,2.4vw,1.7rem);margin-bottom:.4rem}
.lead{font-size:clamp(1.05rem,2.4vw,1.6rem);color:var(--on-space-soft);max-width:44rem;margin-top:1.2rem;line-height:1.5}
.lead.small{font-size:clamp(1rem,1.9vw,1.25rem);margin-top:1.4rem}
.note{margin-top:1.6rem;padding-left:1rem;border-left:3px solid var(--glow);color:var(--on-space-soft);max-width:40rem}
.facts{display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.fact{padding:clamp(1rem,2.4vw,1.75rem);border:1px solid var(--space-line);border-radius:var(--radius);background:rgba(255,255,255,.04)}
.fact-v{font-family:var(--display);font-weight:700;font-size:clamp(2rem,5.4vw,3.6rem);color:var(--glow);line-height:1.1;overflow-wrap:anywhere}
.fact figcaption{margin-top:.5rem;color:var(--on-space);line-height:1.5}
.src{display:block;margin-top:.6rem;font-size:.85rem;color:var(--on-space-soft)}
.steps{list-style:none;padding:0;display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.steps li{border-top:3px solid var(--glow);padding-top:1rem}
.steps p{color:var(--on-space-soft);line-height:1.5}
.n{display:block;font-family:var(--mono);color:var(--on-space-soft);margin-bottom:.4rem}
.aud{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:.7rem;margin-bottom:1.8rem}
.aud li{padding:.55rem 1.1rem;border:1px solid var(--track);border-radius:999px;font-weight:600}
.road{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:1.2rem 2rem;font-family:var(--mono);font-weight:500;letter-spacing:.06em;color:var(--on-space-soft)}
.road li::before{content:"";display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid var(--track-active);margin-right:.6rem;vertical-align:-1px}
.road .done::before{background:var(--track-active)}
.road .now{color:var(--white)}
.road .now::before{background:var(--glow);border-color:var(--glow);box-shadow:0 0 0 5px rgba(110,168,255,.25)}
.bar{position:absolute;left:0;right:0;bottom:0;height:64px;display:flex;align-items:center;gap:.8rem;padding:0 clamp(1rem,4vw,3rem);padding-bottom:env(safe-area-inset-bottom,0px);font-size:.85rem;color:var(--on-space-soft)}
.brand{font-weight:700;letter-spacing:.16em;color:var(--white);margin-right:auto}
.disc{display:none;margin-left:1rem}
@media (min-width:900px){.disc{display:inline;max-width:34ch;line-height:1.25}}
.nav{width:44px;height:44px;border-radius:50%;border:1px solid var(--track);background:transparent;color:var(--white);font-size:1.2rem;cursor:pointer;touch-action:manipulation}
.nav:active{transform:scale(.94)}
.nav:disabled{opacity:.35;cursor:default}
@media (hover:hover) and (pointer:fine){.nav:hover:not(:disabled){background:rgba(255,255,255,.1)}}
.nav:focus-visible{outline:3px solid var(--glow);outline-offset:3px}
.count{font-family:var(--mono);min-width:4.5ch;text-align:center}
.progress{position:absolute;left:0;right:0;top:0;height:3px;background:var(--space-line)}
.progress i{display:block;height:100%;width:100%;background:var(--glow);transform-origin:left;transform:scaleX(0);transition:transform 200ms var(--ease-out)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.inner{animation:none}.progress i{transition:none}}
`;
const js = `(function () {
	'use strict';
	var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
	var prev = document.getElementById('prev'), next = document.getElementById('next');
	var count = document.getElementById('count'), bar = document.getElementById('bar');
	var i = 0;
	function show(n, push) {
		i = Math.max(0, Math.min(slides.length - 1, n));
		slides.forEach(function (s, k) { s.hidden = k !== i; });
		prev.disabled = i === 0; next.disabled = i === slides.length - 1;
		count.textContent = (i + 1) + ' / ' + slides.length;
		bar.style.transform = 'scaleX(' + ((i + 1) / slides.length) + ')';
		if (push) { try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) { /* ignore */ } }
	}
	prev.addEventListener('click', function () { show(i - 1, true); });
	next.addEventListener('click', function () { show(i + 1, true); });
	document.addEventListener('keydown', function (e) {
		if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); show(i + 1, true); }
		else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(i - 1, true); }
		else if (e.key === 'Home') show(0, true);
		else if (e.key === 'End') show(slides.length - 1, true);
	});
	var x0 = null;
	document.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
	document.addEventListener('touchend', function (e) {
		if (x0 === null) return;
		var dx = e.changedTouches[0].clientX - x0; x0 = null;
		if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1), true);
	}, { passive: true });
	var start = parseInt((location.hash || '').slice(1), 10);
	show(isNaN(start) ? 0 : start - 1, false);
})();
`;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'deck.css'), css);
fs.writeFileSync(path.join(OUT, 'deck.js'), js);
for (const lang of LANGS) fs.writeFileSync(path.join(OUT, `aethra-${lang}.html`), deck(lang));
console.log('deck written to', OUT);
