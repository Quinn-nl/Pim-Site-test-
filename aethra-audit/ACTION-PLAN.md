# SEO action plan: Aethra

Each item: why, how we would know it failed, and a leading indicator to watch.

## Phase 1: before launch (week 1)
1. **AI crawler policy (BUILT with a default the client can change).** Search/answer bots stay allowed; training-only bots (GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended) are blocked. `AI_TRAINING=allow` turns the block off. Options per purpose: search/answer engines (OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot) and training (GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended). Blocking training does not remove the site from search answers. *Failed if:* a search bot is blocked by accident. *Indicator:* robots.txt checked with `npm run seo` after the change.
2. **Domain, HTTPS, `SITE_URL`, `NODE_ENV=production`** (Secure cookies, HSTS). *Failed if:* canonicals still point to `aethra.example`. *Indicator:* `SITE_URL=https://real-domain npm run seo` shows 0 errors.
3. **Search Console and Bing Webmaster**: verify, submit `/sitemap.xml`. *Indicator:* indexed pages vs 44 submitted.
4. **Fill the LinkedIn company link** in Admin > Content > Contact (feeds `sameAs`). *Indicator:* Organization JSON-LD contains `sameAs`.

## Phase 2: trust and content (weeks 2-6)
5. **About/Team block** (BUILT: Admin > Content > "Who is behind Aethra"; shows only when filled in) with named founder, role, background and company details (no personal data beyond what Pim approves). *Failed if:* Trust persona scores do not move in a re-run of `/seo sxo`. *Indicator:* contact-form views to sends in Admin > Statistics.
6. **Real photos** with alt text and dimensions (hero not lazy-loaded). *Indicator:* Lighthouse LCP stays under 2.5 s.
7. **Strengthen the three short pages** only with true, sourced, allowed content. *Indicator:* content_quality stays above 90 and information density near 1.0.
8. **Native-speaker review of NL/DE/FR** (also protects against unreviewed machine translation, a spam-policy risk).

## Phase 3: after launch (months 2-6)
9. Review Search Console queries, then adjust titles/descriptions per language. Core updates: compare with `seo_updates.py` before blaming a change.
10. Optional: IndexNow, ContactPage JSON-LD, longer contact titles.
11. When pilot results exist (and only then): a data page with original figures, the strongest citation asset for AI search.

## Guardrails (never trade away for SEO)
No emission-reduction claims without test data; no technical "how"; no offer of shares or returns; no external scripts, fonts or trackers.

## Implemented from this plan and the audits (5 October 2026)
- Home meta description extended (all 4 languages); privacy meta description; contact titles; `og:image:alt`.
- Third Q&A per audience page ("how to take part", "what does it cost", ...): authored per audience, no claims, no technique. Pages grew by about 25 words and the FAQ structured data by one question each.
- Organization logo + optional `sameAs` and `founder`; ContactPage structured data.
- Trailing-slash URLs 301 to one URL; `/favicon.ico` redirects to the SVG icon.
- Versioned asset URLs (`?v=...`) cached for one year as `immutable`; unversioned requests keep the 1-hour cache.
- robots.txt: training-only AI bots blocked (`AI_TRAINING=allow` to change) and a `Content-Signal` line that matches that choice.
- IndexNow support: `INDEXNOW_KEY` serves the key file, `npm run indexnow` submits all sitemap URLs (needs the live domain).
- "Who is behind Aethra" block (hidden until filled in) and the sourced context page (hidden until published).
- `npm run seo`, `seo:baseline`, `seo:compare` for repeatable checks.

## Still needs input or a live site (not done on purpose)
Names and company details; real photos; domain, HTTPS and `SITE_URL`; Search Console and Bing Webmaster; checking the context page's sources and switching it on; native-speaker review of NL/DE/FR; real pilot data for an evidence page; question-style headings (copy decision for the client).
