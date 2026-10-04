# 001 - Animate the FAQ answer opening

- **Status**: DONE
- **Commit**: 9c38a30
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (aethra-site/public/css/site.css), about 12 lines

## Problem
The FAQ on audience pages uses native `<details>`. The chevron rotates (150-180 ms) but the answer snaps open, so the two do not move together.

```css
/* aethra-site/public/css/site.css, FAQ block near the end of the file: current */
.faq summary::after { ... transition: transform var(--dur-ui) var(--ease-out); }
.faq details[open] summary::after { transform: translateY(2px) rotate(225deg); }
```

## Target
Answer height and opacity transition together with the chevron. Progressive enhancement: browsers without `::details-content` keep the instant behaviour.

```css
:root { interpolate-size: allow-keywords; }
.faq details::details-content {
  block-size: 0;
  opacity: 0;
  overflow: clip;
  transition: block-size 200ms var(--ease-out), opacity 200ms var(--ease-out), content-visibility 200ms allow-discrete;
}
.faq details[open]::details-content { block-size: auto; opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .faq details::details-content { transition: opacity 120ms ease; }
}
```

## Repo conventions to follow
Motion tokens live in aethra-site/public/css/design-tokens.css (`--ease-out`, `--dur-ui`). Use them; add no new curves. Reduced-motion rules sit next to the rule they change.

## Steps
1. Append the target CSS after the existing FAQ rules in site.css.
2. Do not touch the markup or JavaScript.

## Out of scope
No JS accordion, no changes to the chevron, no animation of `<details>` on other pages.

## Verification
- `cd aethra-site && npm test` passes; `node scripts/stress-test.cjs` reports no overflow (needs DEV_TOGGLE=1 server).
- Feel-check in Chrome with the Animations panel at 10% speed: height, opacity and chevron start and end together; open and close mid-way retargets without a jump.
- Safari and Firefox: answer still opens (instantly is fine).
