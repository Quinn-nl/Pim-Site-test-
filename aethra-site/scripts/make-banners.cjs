'use strict';
/**
 * Builds the sharing images (Open Graph 1200x630 per language) and the LinkedIn banner (1584x396)
 * from CSS only: no photos, no external assets. Needs Playwright:
 *   npx playwright install chromium && node scripts/make-banners.cjs
 * Edit the headline in lib/i18n.js (hero_title) and run again.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { LANGS, defaultsFor } = require('../lib/i18n');

const ROOT = path.resolve(__dirname, '..');
const FONTS = path.join(ROOT, 'public/fonts');
const mark = fs.readFileSync(path.join(ROOT, 'public/img/logo-mark.svg'), 'utf8').replace('color="#0b1b33"', 'color="#ffffff"').replace(/width="256" height="256"/, 'width="100%" height="100%"');
const eyebrow = { en: 'Prototype phase', nl: 'Prototypefase', de: 'Prototypphase', fr: 'Phase de prototype' };

const face = (family, weight, file) => `@font-face{font-family:"${family}";font-weight:${weight};src:url("file://${FONTS}/${file}.woff2") format("woff2")}`;
const css = `${face('Exo 2', 700, 'exo-2-latin-700-normal')}${face('IBM Plex Mono', 500, 'ibm-plex-mono-latin-500-normal')}
*{box-sizing:border-box;margin:0}
body{width:var(--w);height:var(--h);overflow:hidden;background:linear-gradient(180deg,#060f20 0%,#0b1b33 58%,#12294d 100%);color:#f4f7fc;font-family:"Exo 2",system-ui,sans-serif;position:relative}
.sky{position:absolute;inset:0;background:
 radial-gradient(2px 2px at 9% 18%,#fff 99%,transparent),radial-gradient(1.5px 1.5px at 24% 9%,#cfe0ff 99%,transparent),radial-gradient(2px 2px at 41% 26%,#fff 99%,transparent),
 radial-gradient(1.5px 1.5px at 63% 12%,#cfe0ff 99%,transparent),radial-gradient(2px 2px at 78% 22%,#fff 99%,transparent),radial-gradient(1.5px 1.5px at 92% 9%,#cfe0ff 99%,transparent),
 radial-gradient(1.5px 1.5px at 5% 48%,#cfe0ff 99%,transparent),radial-gradient(1.5px 1.5px at 96% 40%,#fff 99%,transparent),
 radial-gradient(120% 60% at 50% 138%,rgba(110,168,255,.55) 0%,rgba(31,95,209,.25) 40%,transparent 64%)}
.arc{position:absolute;left:-12%;right:-12%;bottom:-84%;height:100%;border-radius:50%;border-top:3px solid rgba(110,168,255,.6);box-shadow:0 -18px 80px rgba(110,168,255,.3)}
.brand{display:flex;align-items:center;gap:18px;font-weight:700;letter-spacing:.16em;color:#fff}
.brand i{display:block;width:var(--m);height:var(--m);color:#fff}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#6ea8ff}
h1{font-weight:700;line-height:1.08;letter-spacing:-.01em;color:#fff;text-wrap:balance}`;

const og = (lang) => `<!doctype html><meta charset="utf-8"><style>:root{--w:1200px;--h:630px;--m:56px}${css}
.wrap{position:absolute;left:120px;right:120px;top:84px;bottom:96px;display:flex;flex-direction:column;justify-content:space-between}
.brand{font-size:30px}.eyebrow{font-size:22px;margin-bottom:22px}h1{font-size:76px;max-width:880px}</style>
<div class="sky"></div><div class="arc"></div>
<div class="wrap"><div class="brand"><i>${mark}</i>AETHRA</div><div><p class="eyebrow">${eyebrow[lang]}</p><h1>${defaultsFor(lang).hero_title}</h1></div></div>`;

const linkedin = `<!doctype html><meta charset="utf-8"><style>:root{--w:1584px;--h:396px;--m:72px}${css}
.wrap{position:absolute;left:560px;right:140px;top:70px;bottom:70px;display:flex;flex-direction:column;justify-content:center;gap:18px}
.eyebrow{font-size:20px}h1{font-size:52px}.brand{position:absolute;right:150px;top:50%;margin-top:calc(var(--m) / -2)}</style>
<div class="sky"></div><div class="arc"></div>
<div class="brand"><i>${mark}</i></div><div class="wrap"><p class="eyebrow">${eyebrow.en}</p><h1>${defaultsFor('en').hero_title}</h1></div>`;

(async () => {
	const out = path.join(ROOT, '..', 'assets/banners/aethra');
	const tmp = path.join(out, 'src');
	fs.mkdirSync(tmp, { recursive: true });
	const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
	const shot = async (name, html, w, h, dest) => {
		const file = path.join(tmp, `${name}.html`);
		fs.writeFileSync(file, html);
		const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
		await page.goto(`file://${file}`);
		await page.evaluate(() => document.fonts.ready);
		await page.screenshot({ path: dest, clip: { x: 0, y: 0, width: w, height: h } });
		await page.close();
		return dest;
	};
	for (const lang of LANGS) {
		const f = await shot(`og-${lang}`, og(lang), 1200, 630, path.join(out, `og-${lang}-1200x630.png`));
		fs.copyFileSync(f, path.join(ROOT, `public/img/og-default-${lang}.png`));
	}
	await shot('linkedin', linkedin, 1584, 396, path.join(out, 'linkedin-1584x396.png'));
	await browser.close();
	console.log('banners written to', out);
})();
