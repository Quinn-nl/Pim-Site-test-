# Technical SEO audit: Aethra (local build, 4 October 2026)

Scores = share of checks that passed, adjusted for severity. Categories that need a live site are "not measured". Tools: scripts/seo-audit.cjs, curl against a production-mode server, Lighthouse 13, claude-seo agentic_check/sitemap_discovery.

## Technical score: 96/100 (measured part)
| Category | Status | Score | Checks behind the score |
|---|---|---|---|
| Crawlability | pass | 97 | robots.txt valid, absolute Sitemap line, sitemap valid (44 URLs + hreflang + lastmod), every page within 2 clicks of the home page, HTML 11 KB (limit 2 MB), search bots allowed, training bots blocked by choice |
| Indexability | pass | 97 | self-referencing canonicals on 44/44, no accidental noindex, no duplicate titles/descriptions, hreflang mesh + x-default on 44/44. Fixed: trailing-slash duplicates (`/en/problem/`) now 301 to one URL |
| Security | pass (production mode) | 98 | CSP, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy, COOP, CORP; HSTS (1 year) and Secure cookies only with `NODE_ENV=production`; no `pushState`/`replaceState` anywhere (no back-button hijacking) |
| URL structure | pass | 98 | short lowercase hyphenated URLs (longest 29 characters), language prefix, no query parameters for content; `/` redirects to the visitor's language with 302 (correct: it varies); `/en` to `/en/` 301 |
| Mobile | pass | 98 | viewport meta, 44 px touch targets, no horizontal scroll (stress-tested on 264 states), same content on every screen size |
| Core Web Vitals | pass (lab only) | 99 | Lighthouse mobile: performance 99-100, LCP 1.5-1.8 s, CLS 0.001, TBT 0 ms. Field data (CrUX) not measured |
| Structured data | pass | 92 | Organization (logo), WebSite, BreadcrumbList, FAQPage valid; no relative URLs; sameAs/Person appear once filled in |
| JS rendering | pass | 100 | content is in the first HTML response (server-rendered); canonical/robots/JSON-LD/title in the initial HTML; error pages return real 404 |
| IndexNow | not implemented | n/a | optional (Bing, Yandex, Naver; not Google) |

## Critical / High
None.

## Medium
None.

## Low (backlog)
1. **`/favicon.ico` returns 404.** Browsers and some tools request it by habit; the page links an SVG icon, which is what Google uses. Optional: redirect `/favicon.ico` to `/img/favicon.svg`.
2. **Static files are cached for 1 hour (CSS/JS) and 7 days (fonts) with ETag revalidation.** Fine; fingerprinted filenames with a one-year `immutable` cache would save repeat requests.
3. **IndexNow** after launch (optional).
4. **HTTP to HTTPS redirect** is the reverse proxy's job, not the app's: configure it at the host (the app already sends HSTS in production).

## Info
- FAQ answers sit in collapsible `<details>`. They are secondary content and are in the HTML; key content is visible on load.
- `/.well-known/security.txt` exists only when `SECURITY_CONTACT` is set.
- AI crawlers: see GEO-ANALYSIS.md; training-only bots are blocked unless `AI_TRAINING=allow`.

## Not measured (needs a live domain)
Real HTTPS certificate and redirect, field Core Web Vitals, indexation status, crawl stats, rendered-browser comparison (the tools' own browser cannot be downloaded in this environment).

---
Built by agricidaniel. Join the AI Marketing Hub community
Free: https://www.skool.com/ai-marketing-hub | Pro: https://www.skool.com/ai-marketing-hub-pro
