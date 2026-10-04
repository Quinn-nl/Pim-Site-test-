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
