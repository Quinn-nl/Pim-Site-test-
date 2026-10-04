# Aethra Brand Guidelines (draft for client approval)

> Status: **Draft v0.1**. "Aethra" is a working title: no trademark check has been done (a company called AETHRA exists in the same sector) and there is no final logo. Items marked *Open* need a decision from the client.

## Quick Reference

| Element | Value |
|---------|-------|
| Name | Aethra (working title, *Open*) |
| What it is | CubeSats and AI that help vehicles switch to an eco mode in areas with high air pollution |
| Stage | Prototype phase |
| Audiences | Municipalities, fleet operators, vehicle manufacturers, mobility platforms, investors |
| Primary colour | Blue 600 `#1F5FD1` |
| Deep colour | Navy 900 `#0B1B33` |
| Fonts | Exo 2 (headings), IBM Plex Sans (text), IBM Plex Mono (labels) |
| Languages | English (source), Dutch, German, French |
| Voice | Factual, calm, precise, open |

Source of truth for values: `aethra-site/public/css/tokens.css`.

## 1. Positioning (draft)

- **Mission:** We help vehicles adapt to local air quality, so that the places where pollution peaks are protected without asking every driver to act.
- **Value proposition:** For cities, fleets, manufacturers and platforms that need cleaner air where traffic is heaviest, Aethra is developing a CubeSat- and AI-based system that helps vehicles switch to an eco mode in polluted areas.
- **Proof today:** the problem (cited WHO and EEA figures) and the stage (prototype). No performance proof exists yet.
- **Headline (client-approved):** "Cleaner air, right where traffic is heaviest".

## 2. Voice

Personality: **Factual, calm, precise, open.** The brand sounds like an engineer talking to a decision-maker, not like an advertisement.

| Trait | Means | Do | Don't |
|-------|-------|----|-------|
| Factual | Says what exists today | "Aethra is in the prototype phase." | "Our proven technology cleans the air." |
| Calm | No hype, no superlatives | "We are open to conversations." | "Revolutionary breakthrough" |
| Precise | Concrete words, short sentences | "Vehicles move to eco mode inside those areas." | "Leveraging synergies for sustainable mobility" |
| Open | Invites, never pressures | "Send us a message and we will reply." | "Don't miss out" |

Tone by context: **investors** (restrained, no promises, always a pointer to "not an offer"), **municipalities** (public-interest framing), **fleets and platforms** (operational: no extra work), **manufacturers** (technical respect, details in conversation).

Use *aims to / is designed to / is intended to* for what the product should do. Use plain statements only for what is true today.

## 3. Guardrails (legal and strategic; apply to all copy)

| Rule | Why |
|------|-----|
| No emission-reduction figures or "cleaner than" claims until test data supports them | Consumer-protection and advertising rules (ACM) |
| Describe **what** the product does, never **how** it works | Possible patent; novelty must not be lost |
| No offer of shares, returns or financial products; investor pages invite contact only | Financial-markets rules (AFM) |
| "CubeSats and AI" may be named | Client decision |
| No names of partners, pilots or people unless approved | Client decision |
| AI-generated images only as atmosphere, never presented as the prototype; confirm usage rights | Honesty, copyright |
| No third-party fonts, trackers or embeds | Privacy by default |

The test `aethra-site/test/brand.test.js` scans all copy in all languages for banned claim patterns and inconsistent terms.

## 4. Terminology (use exactly)

| Concept | EN | NL | DE | FR |
|---------|----|----|----|----|
| Product mode | eco mode | ecomodus | Eco-Modus | mode éco |
| Stage | prototype phase | prototypefase | Prototypphase | phase de prototype |
| Three steps | Detect, Decide, Switch | Detecteren, Bepalen, Schakelen | Erkennen, Entscheiden, Schalten | Détecter, Décider, Basculer |
| Fleet audience | Fleet operators | Wagenparkbeheerders | Flottenbetreiber | Gestionnaires de flottes |
| Company name | Aethra (never "AETHRA" in running text; the wordmark is uppercase) | | | |

Write "CubeSats" (capital C and S). Address visitors formally in NL, DE and FR (*u*, *Sie*, *vous*).

## 5. Colour

Semantic roles (tokens) and measured contrast:

| Role | Token | Hex | Pair | Contrast |
|------|-------|-----|------|----------|
| Page | `--bg` | `#F7F9FC` | Body text `#0B1B33` | 16.3:1 |
| Text soft | `--ink-soft` | `#3B4B66` | on page | 8.4:1 |
| Text muted | `--muted` | `#5A6A85` | on page / on white | 5.2:1 / 5.5:1 |
| Accent / links | `--accent` | `#1F5FD1` | on page | 5.5:1 |
| Button | `--btn-bg` | `#1F5FD1` | white text | 5.8:1 |
| Space (dark bands) | `--space` | `#0B1B33` | soft text `#B8C6DE` | 10.0:1 |
| Glow (labels on dark) | `--glow` | `#6EA8FF` | on space | 7.1:1 |
| Error | `--danger-ink` | `#7A1616` | on `#FDEAEA` | 9.3:1 |
| Success | `--success-ink` | `#11512B` | on `#E6F6EC` | 8.4:1 |

Proportions: light surfaces about 75%, space navy about 20% (hero, status band, footer), accent blue about 5% (buttons, links, key figures). The site stays light even when the visitor's device is dark. Never use colour alone to carry meaning.

## 6. Typography

| Use | Font | Weight | Notes |
|-----|------|--------|-------|
| Headings | Exo 2 | 700 (h3: 600) | Balanced wrapping, hyphenation on for long words |
| Body | IBM Plex Sans | 400 / 600 | 17px base, line height 1.6 |
| Labels, roadmap | IBM Plex Mono | 400 / 500 | Uppercase with letter spacing |

All fonts are self-hosted (SIL Open Font License, `public/fonts/LICENSE.txt`).

## 7. Imagery

- Photographs, not illustrations (client). No stock sites or external generators; the client supplies or approves images.
- Subjects: air, urban traffic, the Earth seen from orbit. Show context and the problem, never the prototype unless it is the real prototype.
- Treatment: natural colour, a cool bias that suits the navy and blue palette, no heavy filters.
- Every image needs a description for screen readers or an explicit "decorative" decision.
- Technical: about 2000 px wide for page photos, 1200 x 630 for the sharing image; metadata is stripped on upload.

## 8. Logo (*Open*)

A provisional wordmark is in use: the orbit mark (a disc with an ellipse) plus AETHRA in letter-spaced Exo 2. It is a placeholder, not a designed identity. Before a final logo: finish the trademark check, then brief a designer with this document. Rules once a logo exists: clear space of one logo-height on all sides, minimum width 24 px for the mark, only the approved colour versions (navy on light, white on navy).

## 9. Consistency checklist (last run)

Run on the site copy in EN, NL, DE and FR:

- [x] No banned claim patterns (percentages, reduction claims, guarantees, superlatives, returns)
- [x] Terminology matches the table above in every language (one deviation fixed: "eco-mode AI" became "AI for eco mode")
- [x] Brand name spelled consistently
- [x] Only palette colours used in components (0 raw hex; verified by computed-colour comparison)
- [x] Contrast at least 4.5:1 for all text pairs (see section 5)
- [x] Same call to action on every page, per language
- [ ] Logo: not applicable until a final logo exists
- [ ] Native-speaker review of NL, DE, FR copy
- [ ] Legal review of copy (ACM claims, AFM investor communication)
