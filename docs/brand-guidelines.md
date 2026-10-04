# Aethra Brand Guidelines v0.1

> Last updated: 2026-10-04
> Status: **Draft for client approval.** "Aethra" is a working title: no trademark check has been done (a company called AETHRA exists in the same sector) and there is no final logo. Items marked *Open* need a client decision.

## Quick Reference

| Element | Value |
|---------|-------|
| Primary Color | #1F5FD1 |
| Secondary Color | #0B1B33 |
| Primary Font | Exo 2 |
| Voice | Factual, Calm, Precise, Open |

What Aethra is: CubeSats and AI that help vehicles switch to an eco mode in areas with high air pollution. Stage: prototype phase. Audiences: municipalities, fleet operators, vehicle manufacturers, mobility platforms, investors. Languages: English (source), Dutch, German, French. Headline (client-approved): "Cleaner air, right where traffic is heaviest". Source of truth for values: `aethra-site/public/css/tokens.css`.

---

## 1. Color Palette

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Blue 600 | #1F5FD1 | rgb(31,95,209) | Buttons, links, key figures |
| Blue 700 | #164AA8 | rgb(22,74,168) | Hover and pressed states |

### Secondary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Navy 900 (space) | #0B1B33 | rgb(11,27,51) | Hero, status band, text on light |
| Navy 950 | #060F20 | rgb(6,15,32) | Footer, darkest surfaces |
| Glow | #6EA8FF | rgb(110,168,255) | Labels and highlights on dark |

### Neutral Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Background (paper) | #F7F9FC | rgb(247,249,252) | Page background |
| Surface | #FFFFFF | rgb(255,255,255) | Cards, form fields |
| Text Primary | #0B1B33 | rgb(11,27,51) | Headings, body text |
| Text Secondary | #3B4B66 | rgb(59,75,102) | Supporting text |
| Text Muted | #5A6A85 | rgb(90,106,133) | Captions, sources |
| Border | #DBE3EF | rgb(219,227,239) | Dividers, card borders |

### Semantic Colors

| State | Hex | Usage |
|-------|-----|-------|
| Success | #11512B on #E6F6EC | Confirmations |
| Error | #7A1616 on #FDEAEA | Errors and failed submits |
| Focus | #1F5FD1 | 3px focus outline |

### Accessibility

Measured contrast: body text on page 16.3:1; soft text 8.4:1; muted text 5.2:1 (5.5:1 on white); accent on page 5.5:1; white on accent button 5.8:1; soft text on navy 10.0:1; glow on navy 7.1:1; error text 9.3:1; success text 8.4:1. All meet WCAG AA. Never use colour alone to carry meaning. Proportions: light surfaces about 75%, navy about 20%, accent blue about 5%. The site stays light even when the visitor's device is in dark mode.

---

## 2. Typography

### Font Stack

```css
--font-heading: 'Exo 2', 'IBM Plex Sans', system-ui, sans-serif;
--font-body: 'IBM Plex Sans', system-ui, sans-serif;
--font-mono: 'IBM Plex Mono', ui-monospace, monospace;
```

| Use | Font | Weight | Notes |
|-----|------|--------|-------|
| Headings | Exo 2 | 700 (h3: 600) | Balanced wrapping, hyphenation for long words |
| Body | IBM Plex Sans | 400 / 600 | 17px base, line height 1.6 |
| Labels, roadmap | IBM Plex Mono | 400 / 500 | Uppercase with letter spacing |

### Font Loading

All fonts are self-hosted (SIL Open Font License, see `aethra-site/public/fonts/LICENSE.txt`). No third-party font requests.

---

## 3. Logo Usage

### Variants

*Open.* A provisional wordmark is in use: the orbit mark (a disc with an ellipse) plus AETHRA in letter-spaced Exo 2. It is a placeholder, not a designed identity. Before a final logo: finish the trademark check, then brief a designer with this document.

### Clear Space

Once a logo exists: one logo-height on all sides.

### Minimum Size

Mark: 24 px wide. Colour versions: navy on light, white on navy only.

---

## 4. Voice & Tone

### Brand Personality

| Trait | Description |
|-------|-------------|
| **Factual** | Says what exists today. Do: "Aethra is in the prototype phase." Don't: "Our proven technology cleans the air." |
| **Calm** | No hype, no superlatives. Do: "We are open to conversations." Don't: "Revolutionary breakthrough." |
| **Precise** | Concrete words, short sentences. Do: "Vehicles move to eco mode inside those areas." Don't: "Leveraging synergies for sustainable mobility." |
| **Open** | Invites, never pressures. Do: "Send us a message and we will reply." Don't: "Don't miss out." |

### Tone by Context

| Audience | Tone |
|----------|------|
| Investors | Restrained, no promises, always a pointer that this is not an offer |
| Municipalities | Public-interest framing |
| Fleets and platforms | Operational: no extra work |
| Manufacturers | Technical respect, details in conversation |

Use *aims to / is designed to / is intended to* for what the product should do. Use plain statements only for what is true today. Address visitors formally in NL, DE and FR (*u*, *Sie*, *vous*).

### Prohibited Terms

| Avoid | Why |
|-------|-----|
| Emission-reduction figures, percentages, "cleaner than" | Needs test data first (consumer-protection rules, ACM) |
| Guarantee, proven, revolutionary, best, leading, unique | Unprovable superlatives |
| Return, profit, yield, offer of shares | Financial-markets rules (AFM): investor pages invite contact only |
| Algorithm, neural, sensor fusion, telemetry, uplink, firmware, CAN bus | The "how" stays in conversation (possible patent) |
| AETHRA in running text | Write "Aethra"; only the wordmark is uppercase |
| Cubesat, cubesat | Write "CubeSats" |

Other rules: no partner, pilot or person names unless approved; no third-party fonts, trackers or embeds.

### Terminology (use exactly)

| Concept | EN | NL | DE | FR |
|---------|----|----|----|----|
| Product mode | eco mode | ecomodus | Eco-Modus | mode éco |
| Stage | prototype phase | prototypefase | Prototypphase | phase de prototype |
| Three steps | Detect, Decide, Switch | Detecteren, Bepalen, Schakelen | Erkennen, Entscheiden, Schalten | Détecter, Décider, Basculer |
| Fleet audience | Fleet operators | Wagenparkbeheerders | Flottenbetreiber | Gestionnaires de flottes |

---

## 5. Imagery Guidelines

### Photography Style

- Photographs, not illustrations (client). No stock sites or external generators; the client supplies or approves images.
- Subjects: air, urban traffic, the Earth seen from orbit. Show context and the problem; never show the prototype unless it is the real prototype.
- Treatment: natural colour, a cool bias that suits navy and blue, no heavy filters.
- Every image needs a description for screen readers or an explicit "decorative" decision.
- Technical: about 2000 px wide for page photos, 1200 x 630 for the sharing image; metadata is stripped on upload.

### Illustrations

None. Icons are simple line icons (1.6 px stroke, rounded) in the accent colour.

### Icons

Inline SVG, one style, never emoji.

---

## 6. Positioning (draft)

- **Mission:** We help vehicles adapt to local air quality, so that the places where pollution peaks are protected without asking every driver to act.
- **Value proposition:** For cities, fleets, manufacturers and platforms that need cleaner air where traffic is heaviest, Aethra is developing a CubeSat- and AI-based system that helps vehicles switch to an eco mode in polluted areas.
- **Proof today:** the problem (cited WHO and EEA figures) and the stage (prototype). No performance proof exists yet.

## 7. Consistency checklist (last run: 2026-10-04)

Run on the site copy in EN, NL, DE and FR; the first four items are enforced by `aethra-site/test/brand.test.js`.

- [x] No banned claim patterns (percentages, reduction claims, guarantees, superlatives, returns)
- [x] Terminology matches section 4 in every language (one deviation fixed: "eco-mode AI" became "AI for eco mode")
- [x] Brand name and "CubeSats" spelled consistently
- [x] No technical "how" terms; investor page always states it is not an offer
- [x] Only palette colours in components (0 raw hex; verified by computed-colour comparison)
- [x] Contrast at least 4.5:1 for all text pairs
- [x] Same call to action on every page, per language
- [ ] Logo: not applicable until a final logo exists
- [ ] Native-speaker review of NL, DE, FR copy
- [ ] Legal review of copy (ACM claims, AFM investor communication)

## Changelog

- v0.1 (2026-10-04): first draft from the decisions made during the website build.
