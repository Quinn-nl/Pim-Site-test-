# GEO analysis (AI search readiness): Aethra, local build, 4 October 2026

Framing (Google's own position): optimising for AI answers is still SEO. Nothing here needs special markup. Scores are heuristics; no platform visibility was measured (no live domain, no DataForSEO/SE Ranking access).

## GEO readiness: 64/100 (heuristic)
| Criterion | Weight | Score | Basis |
|---|---|---|---|
| Citability | 25% | 55 | Short, specific sentences and two sourced WHO/EEA facts on the home page, but the pages are 93-169 words, so there is little to quote; paragraphs are 13-32 words |
| Structure | 20% | 85 | Clean H1 > H2 > H3, lists on 4 of 6 sampled pages; only 1 question-style heading per page |
| Multi-modal | 15% | 40 | No photos, charts or video yet |
| Authority and brand | 20% | 45 | No named people or company details yet (the block now exists and is empty), no dates, no external mentions yet (new brand) |
| Technical access | 20% | 90 | Server-rendered, `*` allowed, llms.txt present, sitemap and hreflang correct |

## AI crawler access (checked per user agent; each capability named separately)
robots.txt has one group: `User-agent: *` / `Allow: /` / `Disallow: /admin`. No crawler has its own rule, so every bot below falls under `*` and is **allowed**.

| Capability | User agent checked | Status |
|---|---|---|
| Citable in ChatGPT Search | OAI-SearchBot | allowed (via `*`) |
| Citable in Claude search | Claude-SearchBot | allowed (via `*`) |
| Citable in Perplexity | PerplexityBot | allowed (via `*`) |
| Eligible for Google Search, AI Overviews, AI Mode | Googlebot | allowed |
| Discoverable via Siri/Spotlight/Safari | Applebot | allowed |
| OpenAI model training | GPTBot | allowed (via `*`) |
| Anthropic model training | ClaudeBot | allowed (via `*`) |
| Gemini/Vertex training and grounding (not Search) | Google-Extended | allowed (via `*`) |
| Apple Intelligence training | Applebot-Extended | allowed (via `*`) |
| Open dataset | CCBot | allowed (via `*`) |
| User-triggered fetchers | ChatGPT-User, Perplexity-User, Google-Agent | robots.txt may not apply; cannot be blocked this way |

**Decision for the client (not made here):** keep search and answer bots allowed (that is what makes Aethra citable). Training bots are a licensing preference: blocking GPTBot, ClaudeBot, Google-Extended, CCBot and Applebot-Extended does **not** remove the site from search answers. Draft if training should be blocked:

```
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
User-agent: CCBot
User-agent: Applebot-Extended
Disallow: /
```
(Place above the `*` group. Disallow `/admin` stays in `*`.)

## llms.txt
Present at `/llms.txt` (title, one-line description, prototype-status disclaimer, 4 language home pages, English page list). Reported only: Google says it is not needed and neither helps nor hurts; carries no weight in the score.

## Server-side rendering
All content is in the first HTML response; no client-side rendering. Crawlers that do not run JavaScript see everything.

## Passage-level citability
| Page | Words | Question headings | Longest paragraph | Sourced facts |
|---|---|---|---|---|
| Home | 169 | 1 | 17 | 2 (WHO, EEA) |
| Problem | 110 | 1 | 32 | - |
| How it works | 93 | 1 | 15 | - |
| Applications | 102 | 1 | 13 | - |
| Fleets | 145 | 1 | 21 | - |
| Investors | 155 | 1 | 25 | - |

The home page already opens with a definition-style statement (what Aethra does in one sentence, also the meta description), which is the strongest quotable passage. Other pages are too short to hold a 130-170 word self-contained answer, and padding them is not the fix: an honest block only where it is true and allowed (what the system is, what it is not, current status) would be.

## Top 5 changes (highest impact first)
1. **Named people and company details** (block built; client fills it in): the largest authority gap, also the Who/How/Why test.
2. **Decide the training-bot policy** (above); keep search bots allowed.
3. **Real photos with alt text** (multi-modal and brand recognition).
4. **When pilot data exists: one page of original, honest results** (unique data is the most citable asset). Until then, no claims.
5. **Entity links**: LinkedIn company page in the admin field (feeds `sameAs`), later a Wikidata entry only if notability is met. Brand mentions come from real PR, not from the site.

## Schema for AI discoverability
Present: Organization (logo, optional sameAs, optional founder Person), WebSite, BreadcrumbList, FAQPage (no Google rich result since May 2026; kept, harmless). Nothing to add until the people block is filled.

## Content reformatting suggestions
- Add one question-style H2 per hub page that matches how buyers ask ("How does a vehicle know it is in a polluted area?" is **off limits** (technical how); prefer "Who is Aethra for?" / "What stage is Aethra in?").
- Show a visible "last updated" date only when a page really changes (freshness is a citation signal, but a date that never changes is noise).

## Not measured
Actual citations or mentions in ChatGPT, Perplexity, Google AI Overviews/AI Mode (no tool access); brand presence on Wikipedia/Reddit/YouTube/LinkedIn (new brand); Search Console generative-AI report (needs a live property).

---
Built by agricidaniel. Join the AI Marketing Hub community
Free: https://www.skool.com/ai-marketing-hub | Pro: https://www.skool.com/ai-marketing-hub-pro
