# Aethra motion guide

Motion on the site is deliberately small. Vocabulary follows the animation-vocabulary skill; tokens live in `aethra-site/public/css/design-tokens.css`.

## Tokens
| Token | Value | Use |
|-------|-------|-----|
| `--ease-out` | `cubic-bezier(.23, 1, .32, 1)` | Everything that enters or responds |
| `--ease-in-out` | `cubic-bezier(.77, 0, .175, 1)` | On-screen movement (not used yet) |
| `--dur-press` | 120 ms | Press feedback |
| `--dur-ui` | 180 ms | Hover, small state changes |
| `--dur-enter` | 350 ms | Scroll reveal |

## Effects in use
| Effect | Name | Where | Timing |
|--------|------|-------|--------|
| Cards, steps, facts and points fade and rise when they scroll into view | Scroll reveal + Stagger | `[data-reveal]` in `site.css`; observer in `site.js` | 350 ms, 60 ms between items, 10 px rise |
| Mobile menu drops down | Slide in (from top) + Fade in | `.site-nav.open` | 160 ms; closing is instant |
| Contact confirmation panel | Scale in (with fade) | `.success` | 260 ms from `translateY(8px) scale(.98)` |
| FAQ answer unfolds, chevron turns | Accordion / Collapse + Rotate | `.faq details::details-content` | 200 ms; browsers without support open instantly |
| Page changes | View transition (crossfade) | `@view-transition` | 150 ms |
| Sticky contact button (phones) | Slide in (from bottom), asymmetric | `.sticky-cta` | in 300 ms, out 150 ms |
| Buttons | Press feedback | `.btn:active` | `scale(.97)`, 120 ms |
| Deck progress bar | Interpolation on `transform` | `scripts/make-deck.cjs` | 200 ms |

## Rules
- Only `transform` and `opacity` (the FAQ uses block-size because an accordion has no transform equivalent).
- Hover effects only where there is a real pointer (`@media (hover: hover) and (pointer: fine)`).
- Every effect has a `prefers-reduced-motion` variant: gentler, not zero.
- Never animate keyboard-initiated actions, the hero (it is the LCP element), the WHO/EEA figures (no counting up) or the roadmap status.
- Content must be visible without JavaScript and in print.

## Rejected on purpose
Hero entrance, number counters, card hover lifts, pulsing roadmap dot, extra slide transitions in the deck.

Audit history: `plans/` (001 to 004, all done).
