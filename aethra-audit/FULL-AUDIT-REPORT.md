# SEO audit: Aethra website (local build, 4 October 2026)

Scope: the local build of `aethra-site` (44 pages: 11 pages x EN/NL/DE/FR). There is no live domain yet, so everything that needs a public site (HTTPS, field data, indexing, backlinks, rankings) was **not measured**. Scores below are heuristics from the claude-seo method, not Google signals.

Business type: B2B startup, informational site with a contact form (not local, not e-commerce).
Tools used: `scripts/seo-audit.cjs` (all 44 pages), claude-seo `parse_html`, `sitemap_discovery`, `agentic_check`, `metadata_template`, `content_quality`, `preload_check`, `drift_baseline` (10 EN pages), Lighthouse 13 (3 pages, mobile).

## SEO health score: 87/100 (heuristic)

| Category | Weight | Score | Basis |
|---|---|---|---|
| Technical SEO | 22% | 95 | 0 errors on 44 pages; canonical, hreflang mesh, 404, robots, sitemap, headers all correct |
| Content quality | 23% | 80 | quality 95-96/100, no filler or AI patterns; but 3 hub pages have ~100 words and there is no author/team page |
| On-page SEO | 20% | 92 | unique titles and descriptions on all 44 pages, one H1 each; 3 short contact titles |
| Schema | 10% | 85 | Organization, WebSite, BreadcrumbList, FAQPage valid; no logo/sameAs before this audit |
| Performance (CWV) | 10% | 99 | Lighthouse performance 99-100, LCP 1.5-1.8 s, CLS 0.001, TBT 0 (lab, not field data) |
| AI search readiness | 10% | 78 | server-rendered, llms.txt present, but no AI-crawler policy and little citable depth |
| Images | 5% | 70 | no photos yet (only OG images); nothing to optimise, so capped |

## What works (keep)
- Every page: unique title and meta description (36 EN-NL-DE-FR metadata pairs: 0 templated, site risk low), exactly one H1, self-referencing canonical, full hreflang mesh with x-default, absolute OG image with width/height.
- Sitemap lists all 44 URLs with hreflang alternates and lastmod; robots.txt has an absolute Sitemap line; unknown URLs return a real 404.
- Language: bare address redirects to the visitor's language; `html lang` matches on every page.
- Lighthouse: Accessibility 100, Best practices 100, SEO 100 on all three pages tested.
- Content is server-rendered, so crawlers and AI agents that do not run JavaScript see everything.
- Content quality tool: filler 0, AI-pattern 0, information density 0.99-1.0.
- FAQPage is present on the 5 audience pages. Google retired FAQ rich results in May 2026; harmless, kept (Info only).

## Findings

### Fixed during this audit
| # | Severity | Finding | Fix |
|---|---|---|---|
| F1 | High | Privacy page had no meta description (4 languages) | Added a localised description |
| F2 | Low | Organization JSON-LD had no `logo` and no way to give `sameAs` | `logo` added; new optional admin field "LinkedIn company page" feeds `sameAs` |
| F3 | Low | No `og:image:alt` / `twitter:image:alt` | Added on every page |

### Open
| # | Severity | Finding | Recommendation |
|---|---|---|---|
| O1 | High | **AI crawler policy undecided**: robots.txt has a single `*` group, so training and search crawlers are treated alike | Client decision (see ACTION-PLAN). Never merge training and search access in one decision |
| O2 | High | **Before launch**: no public domain, so HTTPS/HSTS, `SITE_URL`, Search Console and Bing Webmaster are not set up | Launch checklist in ACTION-PLAN |
| O3 | Medium | **Trust signals ("who made this")**: no named people, credentials or company details on the site | Add a short About/Team section (founder, role, background) and company details once available. Strongest E-E-A-T lever for a B2B startup |
| O4 | Medium | Problem, How it works and Applications have 92-110 words each | A deliberate result of "less text". Add substance only where it is true and allowed: sourced facts, a plain "what we do not claim" block, honest status. Do not pad |
| O5 | Medium | No photos yet | Real photos (not stock, not generated) with descriptive alt text and width/height; WebP; the hero image is the likely LCP so no lazy loading there |
| O6 | Low | Contact page titles are short (19-24 characters) | Optional: "Contact Aethra: talk to us" style titles in the admin |
| O7 | Low | Contact page has no structured data | Optional `ContactPage` JSON-LD |
| O8 | Low | No IndexNow (Bing, Yandex, Naver) | Optional after launch; Google ignores it |
| O9 | Info | No Content-Signal line in robots.txt | Add only together with the policy from O1 (Google says it does not act on it) |

### Rejected on purpose
- **Speculation rules (prefetch)**: a prefetched page makes no server request when opened, so the cookieless statistics would undercount visits. Speed is already 99-100.
- **Programmatic pages / comparison pages / local / maps / e-commerce / backlinks / Google APIs / DataForSEO**: not applicable (B2B info site, no shop, no premises, no accounts connected, no live domain).
- **New FAQPage markup for SERP benefit**: not recommended; existing markup stays.

## SXO and personas (qualitative: no live SERP data)
Page type fit: home and audience pages are landing/solution pages, which fits B2B research intent ("what is it, is it for me, how do I talk to you"). Persona check from the page content:

| Persona | Relevance | Clarity | Trust | Action | Main gap |
|---|---|---|---|---|---|
| Municipality | 22/25 | 22/25 | 14/25 | 22/25 | no named people, no references yet |
| Fleet operator | 22/25 | 22/25 | 14/25 | 22/25 | no pilot or data (correctly absent); no team |
| Manufacturer | 20/25 | 21/25 | 14/25 | 22/25 | no technical depth (deliberate) |
| Platform | 20/25 | 21/25 | 14/25 | 22/25 | same |
| Investor | 21/25 | 22/25 | 12/25 | 22/25 | no company details; correctly no offer |

The weakest column everywhere is Trust, which is why O3 is the highest-value content change.

## Not measured
Field Core Web Vitals (CrUX), indexation and queries (Search Console), backlinks and domain authority, live SERP positions, AI citation tracking, HTTPS/HSTS in production, rendered-browser checks (the download of the tools' own browser is blocked in this environment; Lighthouse was run with the system Chromium instead), real-device feel.

## Drift baseline
`aethra-site/seo/baseline.json` (44 pages) and the claude-seo baseline for 10 EN pages were captured. Re-check after changes with `npm run seo:compare`.
