# SXO analysis: Aethra (local build, 4 October 2026)

SXO score is separate from the SEO health score. There is no live URL, so the target is the local home page (`/en/`). Keywords were derived from the page (title/H1/meta): geofenced eco mode for vehicles, air-quality-triggered, CubeSats for air quality. SERP data: three live web searches (10 results each, US results, standard mode); no volume or difficulty data (no DataForSEO), so this is directional.

## 1. SERP landscape
| Query | What ranks |
|---|---|
| vehicles switch to eco mode in polluted areas / geofencing / fleet | Fleet trade press (Fleet News, EV Fleet World, International Fleet World), a UK government geospatial blog, a European Commission urban-mobility case study, Ricardo (consultancy PDF), a smart-charging explainer. Dominant: **news and trade articles about a product or trial** |
| CubeSat air quality monitoring cities traffic pollution | Academic preprints and conference papers (engrXiv, ISPRS, IAC), NASA and ESA project pages, a university project news item. Dominant: **research and agency pages** |
| geofenced zero-emission zone PHEV automatic electric mode city fleet | Ford press release and trade coverage, BMW eDrive Zones coverage (several outlets), Jeep/Turin pilot. Dominant: **OEM news and press coverage** |

Consensus: strong (about 70% news, press release or research), **no company solution landing page** in any top 10. Schema, media and word count: articles, long-form, with product or vehicle photos.

SERP features seen in the results: none were visible in this tool (no PAA, snippets or AI Overview available here), so the User Stories below come from the result themes only.

## 2. Page-type alignment
| Aethra page | SERP expects | Verdict |
|---|---|---|
| Home, audience pages (solution landing pages, 145-169 words) | news / case study / research | **MISMATCH (Medium)** for informational queries; **ALIGNED** for brand and "who does this" queries, which is what a pre-launch B2B startup is mostly found by |

Impact: Aethra will not win generic informational queries with landing pages alone. It can win when a buyer is already searching for the company, and it can earn visibility with one factual explainer.

## 3. Important finding: this idea already exists, in a static form
The sources show geofenced automatic EV/eco mode is already sold or piloted, with **fixed zones**: Ford Transit Custom PHEV (clean-air and low-emission zones, custom "green zones"), BMW eDrive Zones, Brighton & Hove Buses (54 zero-emission-capable geofenced buses), Jeep/Turin geofencing lab, and the Leeds "Project Accra" trial (2017), which used **live air quality data** as the trigger.

Consequences:
1. **Never claim "first" or "only"** on the site.
2. Aethra's honest position is the difference between **fixed zones and where pollution actually peaks, when it peaks**; that is already the site's message ("pollution peaks in specific places, vehicles drive on as if every street were the same"). The CubeSat and AI angle must stay described at the level the site already uses.
3. **Tell Pim**: prior art (including Leeds 2017 with live air quality) matters for the possible patent and for the trademark/legal review. This is not legal advice; a patent attorney should see it.

## 4. User stories (from result themes)
1. *As a fleet manager* with PHEV vans, *I want* vehicles to go electric where air is worst, *because* clean-air-zone rules and driver behaviour are not enough, *but I'm blocked by* fixed-zone systems that ignore real pollution.
2. *As a city official*, *I want* a measurable way to cut exposure in hotspots, *because* monitoring stations are sparse, *but I'm blocked by* cost and proof (needs real test data, which Aethra does not have yet and must not imply).
3. *As an OEM product planner*, *I want* an add-on to existing geofencing, *because* BMW and Ford already ship fixed zones, *but I'm blocked by* integration questions.
4. *As a space/earth-observation reader*, *I want* to know if small satellites can serve cities, *because* research shows CubeSats are cost-effective with high revisit rates, *but I'm blocked by* the gap between research and operations.
5. *As an investor*, *I want* proof of stage and team, *but I'm blocked by* anonymity and no data (the site correctly makes no offer).

## 5. Gap analysis: SXO score 53/100
| Dimension | Score | Why |
|---|---|---|
| Page type | 9/15 | solution pages vs news/research; fine for brand queries |
| Content depth | 6/15 | 93-169 words vs long-form articles |
| UX signals | 14/15 | one clear CTA, fast, mobile-first, accessible (Lighthouse 100) |
| Schema | 11/15 | Organization, WebSite, Breadcrumb, FAQ present |
| Media richness | 4/15 | no photos or diagrams yet |
| Authority signals | 6/15 | no people, no company details, no external mentions yet |
| Freshness | 3/10 | no dates (correct for static copy) |

## 6. Persona scores (page: home)
| Persona | Relevance | Clarity | Trust | Action | Total | Biggest gap |
|---|---|---|---|---|---|---|
| Fleet manager | 22 | 21 | 13 | 22 | 78 | no proof or pilot (do not imply one); no people |
| City official | 21 | 21 | 13 | 22 | 77 | same; a sourced WHO/EEA context is present |
| OEM planner | 17 | 19 | 12 | 21 | 69 | no integration information (deliberately technical-light) |
| Earth-observation reader | 14 | 15 | 12 | 10 | 51 | no link to what the satellite part is, by design |
| Investor | 20 | 21 | 11 | 22 | 74 | no team/company details; no offer by design |

## 7. Priority actions
1. **Fill in "Who is behind Aethra"** (people, company details): lifts Trust for every persona; highest impact.
2. **One factual explainer page**, e.g. "Geofenced eco mode today: what exists and what is still missing", citing Ford, BMW, Brighton & Hove and Leeds and naming the gap in plain words (fixed zones vs where pollution peaks). Matches the SERP page type, builds authority with sources, makes no claim about Aethra's performance and reveals no technique. **Needs Pim's approval** (positioning) before building.
3. **Remove any "first/only" wording** (none found in the current copy; keep it that way).
4. **Photos/diagram** (real, not generated) to lift media richness.
5. After launch: check Search Console queries; if the explainer ranks, add the next-journey question pages (what a clean-air zone is, why hotspots differ) from real queries.

## 8. Limitations
US-only live results, three queries, no PAA/featured-snippet/AI Overview data, no volume, no authority metrics; Dutch, German and French SERPs not checked; the local page was scored, not a live URL. Persona scores are judgement-based, not measured behaviour.

Sources: [Fleet News: poor air quality could make cars switch to EV mode](https://www.fleetnews.co.uk/news/environment/2017/08/21/poor-air-quality-could-make-cars-switch-to-ev-mode-automatically), [EV Fleet World: Ford Transit Custom PHEV vans switch to electric in CAZs](https://evfleetworld.co.uk/ford-transit-custom-phev-vans-to-automatically-switch-to-electric-in-cazs/), [Ford Media Center](https://media.ford.com/content/fordmedia/feu/en/news/2020/07/06/supporting-cleaner-air-for-cities--schools-and-play-areas--ford-.html), [Geospatial Commission blog](https://geospatialcommission.blog.gov.uk/2022/03/17/how-using-transport-location-data-can-improve-air-quality), [European Commission urban mobility observatory: geofencing](https://urban-mobility-observatory.transport.ec.europa.eu/resources/case-studies/geofencing-new-tool-make-urban-transport-safer-and-more-sustainable_et), [BMW eDrive Zones coverage](https://www.thestar.co.uk/lifestyle/cars/bmw-hybrids-will-now-automatically-switch-to-ev-mode-in-low-emissions-zones-2938446), [ISPRS: CubeSats for urban monitoring](https://isprs-archives.copernicus.org/articles/XLVIII-G-2025/1595/2025/), [NASA science: new instruments for air pollution](https://science.nasa.gov/science-research/earth-science/new-instruments-to-study-air-pollution-cyclones/).

---
Built by agricidaniel. Join the AI Marketing Hub community
Free: https://www.skool.com/ai-marketing-hub | Pro: https://www.skool.com/ai-marketing-hub-pro
