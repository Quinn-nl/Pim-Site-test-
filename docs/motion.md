# Aethra motion guide

Motion on the site is deliberately small. Vocabulary follows the animation-vocabulary skill; tokens live in `aethra-site/public/css/design-tokens.css`.

## Tokens
| Token | Value | Use |
|-------|-------|-----|
| `--ease-out` | `cubic-bezier(.23, 1, .32, 1)` | Everything that enters or responds |
| `--ease-in-out` | `cubic-bezier(.77, 0, .175, 1)` | On-screen movement (not used yet) |
| `--dur-press` | 120 ms | Press feedback |
| `--dur-ui` | 180 ms | Hover, small state changes |
| `--dur-enter` | 280 ms | Scroll reveal (40 ms stagger) |
| `--dur-panel` | 240 ms | Panels: FAQ answer, confirmation, sticky button entering |
| `--dur-exit` | 100 ms | Things leaving: menu closing, sticky button leaving |

## Effects in use
| Effect | Name | Where | Timing |
|--------|------|-------|--------|
| Cards, steps, facts and points fade and rise when they scroll into view | Scroll reveal + Stagger | `[data-reveal]` in `site.css`; observer in `site.js` | 350 ms, 60 ms between items, 10 px rise |
| Mobile menu drops down | Slide in (from top) + Fade in | `.js .site-nav` (transition with `@starting-style`) | in 180 ms, out 100 ms |
| Contact confirmation panel | Scale in (with fade) | `.success` | 240 ms from `translateY(8px) scale(.98)` |
| FAQ answer unfolds, chevron turns | Accordion / Collapse + Rotate | `.faq details::details-content` | 240 ms; browsers without support open instantly |
| Page changes | View transition (crossfade) | `@view-transition`; the header has its own name and stays still | 180 ms |
| Sticky contact button (phones) | Slide in (from bottom), asymmetric | `.sticky-cta` (`translate` for the slide, `scale` for the press, `visibility` so it is not focusable while hidden) | in 240 ms, out 100 ms, press 120 ms |
| Buttons | Press feedback | `.btn:active` | `scale(.97)`, 120 ms |
| Deck progress bar | Interpolation on `transform` | `scripts/make-deck.cjs` | 180 ms |
| Deck slide change | Fade in, only for mouse or touch | `.inner.fade` | 100 ms; never for keyboard |

## Rules
- Only `transform` and `opacity` (the FAQ uses block-size because an accordion has no transform equivalent).
- Hover effects only where there is a real pointer (`@media (hover: hover) and (pointer: fine)`).
- Every effect has a `prefers-reduced-motion` variant: gentler, not zero.
- No smooth scrolling: in-page jumps (skip link, error-summary links) are instant.
- Never animate keyboard-initiated actions (also in the deck), the hero (it is the LCP element), the WHO/EEA figures (no counting up) or the roadmap status.
- Content must be visible without JavaScript and in print.

## Rejected on purpose
Hero entrance, number counters, card hover lifts, pulsing roadmap dot, extra slide transitions in the deck.

Audit history: `plans/` (001 to 004, all done).

## Review log
`/review-animations` found two blocking issues (global smooth scroll on keyboard jumps; 300 ms press on the sticky button caused by overriding rules) and seven smaller ones. All fixed and re-measured: keyboard jumps are instant, press is 120 ms, hidden button is not focusable, menu has an exit, deck keyboard navigation does not animate.
