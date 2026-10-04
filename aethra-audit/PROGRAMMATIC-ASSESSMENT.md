# Programmatic SEO assessment: Aethra audience pages (4 October 2026)

Scope: the only template-rendered set on the site: 5 audience pages (`/for/<slug>`) x 4 languages = 20 pages. Everything else is a one-off page. 20 pages is far below the warning gate (100) and the hard stop (500).

## Programmatic SEO score: 82/100 (heuristic)
| Category | Status | Score | Basis |
|---|---|---|---|
| Data quality | pass | 85 | no external data source: each audience has its own authored fields (title, lead, 3 points, 2 Q&A) in 4 languages, editable in the admin; no duplicate records |
| Template uniqueness | warn | 70 | see below |
| URL structure | pass | 100 | `/for/municipalities`, `/for/fleets`, ... lowercase, hyphenated, short, unique slugs, one URL per page (trailing slash redirects) |
| Internal linking | pass | 90 | hub = Applications and home chips; each audience page links to the 4 others, to contact (with the role preselected) and to how-it-works; breadcrumbs as JSON-LD |
| Thin content risk | warn | 55 | 88-149 words per page, under the 300-word review flag on all 20 |
| Index management | pass | 95 | self-referencing canonicals, hreflang mesh, in sitemap, no parameter URLs indexed, no noindex needed |

## Template uniqueness (measured, body only, shared CTA band and "other audiences" chips excluded)
| Language | Unique words (vs the 4 sibling pages) | Unique two-word phrases |
|---|---|---|
| EN | 25-37% | 72-75% |
| NL | 26-43% | 76-81% |
| DE | 28-39% | 74-80% |
| FR | 21-34% | 64-77% |

By the skill's literal word metric 17 of 20 pages are under 40%. That number is inflated here: the pages are only 100-150 words, so common words (the, and, for, vehicles, air) are shared by construction. Phrase-level uniqueness of 64-81% and the metadata check (36 + 20 title/description pairs: 0 templated, site risk low) show that the sentences really differ per audience. Verdict: **not a scaled-content risk, but the pages are short.**

## Issues
- **High:** none.
- **Medium:** thin pages. Each audience page has only 2 Q&A and 3 bullet points. They answer the question briefly but give little for a search engine or an AI answer to quote.
- **Low:** the investor page legitimately shares the "not an offer" statement; keep it (legal), it is not a quality problem.

## Recommendations
1. **Do not add more template pages** (no audience x city, x industry, x language variants without new content). Each new page must pass the standalone-value test: would it be worth publishing if no sibling existed?
2. **Deepen the five existing pages with real, per-audience content** instead of more pages: the buyer's actual questions (procurement, integration, data protection, what stage the project is in), each answered honestly and within the rules (no emission-reduction claims, no technical "how", no offer). Target 250-400 words each when there is true content for it. Never pad.
3. **Human review of all 20** (5-10% sample is the minimum; at this size review all) with a native speaker for NL/DE/FR before launch.
4. **If a sixth audience is ever added:** the audience generator makes the page, the sitemap entry and the hreflang set automatically; it needs its own authored fields in 4 languages first (the build fails the content test otherwise).
5. **Monitor after launch:** indexed pages vs the 20 intended in Search Console; no batch publishing needed at this scale.

---
Built by agricidaniel. Join the AI Marketing Hub community
Free: https://www.skool.com/ai-marketing-hub | Pro: https://www.skool.com/ai-marketing-hub-pro
