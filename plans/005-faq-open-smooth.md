# 005 - Make the FAQ open/close feel smooth (cross-browser)

- **Status**: DONE
- **Commit**: 969f00f
- **Severity**: HIGH
- **Category**: Easing & duration / Interruptibility / Cross-browser
- **Estimated scope**: 2 files (aethra-site/public/css/site.css, aethra-site/public/js/site.js) + docs/motion.md

## Problem
Plan 001 animates `::details-content` with `interpolate-size`. Two defects:

1. **Front-loaded motion.** Measured in Chromium at 390 px (60 fps, no dropped frames): with `--ease-out` (cubic-bezier(.23,1,.32,1), 240 ms) the answer reaches 88% of its height in the first ~83 ms; the questions below jump ~23 px in the first frame. It reads as a snap, not a glide. Close mirrors it.
2. **Support.** `::details-content` and `interpolate-size` are not available in all browsers (Safari/Firefox untested; only Chromium was available). Where unsupported the answer opens instantly while only the chevron rotates.

```css
/* site.css ~line 332-336: current */
:root { interpolate-size: allow-keywords; }
.faq details::details-content { block-size: 0; opacity: 0; overflow: clip; transition: block-size var(--dur-panel) var(--ease-out), opacity var(--dur-panel) var(--ease-out), content-visibility var(--dur-panel) allow-discrete; }
.faq details[open]::details-content { block-size: auto; opacity: 1; }
@media (prefers-reduced-motion: reduce) { .faq details::details-content { transition: opacity var(--dur-exit) ease; } }
```

## Target
Animate the height of `<details>` with WAAPI (works everywhere, interruptible, same result in every browser).

- Property: `height` on the `details` element (accordion exemption) + `opacity` on the answer `<p>`.
- Curve: `cubic-bezier(.39,.575,.565,1)` (easeOutSine). Progress at 10/30/50/70/90% of time = 15/46/74/92/99%: strong enough to feel responsive, but spread over the whole duration. Add as token `--ease-glide` in design-tokens.css.
- Duration: open 280 ms, close 200 ms (asymmetric: the user asked for content, closing snaps). Add tokens `--dur-accordion-open: 280ms` and `--dur-accordion-close: 200ms`.
- Only for pointer/touch toggles. Keyboard (Enter/Space on summary) and reduced motion: native instant behaviour, no animation.
- Interruptible: on a second click mid-animation, read the current computed height, cancel the running animation, and animate from there to the new target.
- Chevron: rotate via `details[data-closing]` so it starts turning at click time on close; open uses the `[open]` selector as today. Keep `transition: transform var(--dur-ui) var(--ease-out)`.

## Repo conventions
- Zero dependencies, vanilla JS in public/js/site.js (strict CSP: no inline scripts or style attributes in markup; setting `element.style` from JS is fine).
- Tokens live in public/css/design-tokens.css; named effects and rules in docs/motion.md.
- Reduced-motion and hover gating ship with the change.

## Steps
1. design-tokens.css: add `--ease-glide`, `--dur-accordion-open`, `--dur-accordion-close` next to the other motion tokens.
2. site.css: delete the 4 `::details-content` / `interpolate-size` lines (332-336). Keep chevron rules. Add `.faq details[data-closing] summary::after { transform: translateY(-2px) rotate(45deg); }` and `.faq details { overflow: clip; }`. Reduced-motion block: chevron `transition: none` stays.
3. site.js: add an accordion handler (delegated click on `.faq summary`):
   - Skip when `e.detail === 0` (keyboard-initiated click) or `matchMedia('(prefers-reduced-motion: reduce)').matches` or `!el.animate`.
   - `e.preventDefault()`, then open: set `open`, measure `endHeight = el.offsetHeight`, animate `height` from the summary height (`summary.offsetHeight + borders`) to `endHeight`, and `opacity` of the `p` from 0 to 1 over the same time. Close: set `data-closing`, animate from the current height to the closed height, on finish remove `open` and `data-closing`.
   - Store the running animation on the element; on a new click, `anim.cancel()` and start from `getComputedStyle(el).height`.
   - On finish/cancel clear inline height/overflow.
4. docs/motion.md: update the FAQ line (named effect: Accordion / Collapse) and add a review-log entry.
5. test/app.test.js: no change needed unless it greps the removed CSS; update that assertion if it does.

## Out of scope
- Other components, the card reveal, menu, view transitions.
- Any change to the FAQ markup or copy.
- No JS library.

## Verification
- `cd aethra-site && npm test` passes.
- Playwright (chromium, `/opt/pw-browsers/chromium`): click a question at 390 px, sample the details height every frame via rAF. Expected: monotonic growth over ~280 ms, at most ~45% of the final height in the first 60 ms, no frame with a jump of more than ~25% of the total. Click again mid-animation: height continues from the current value without a jump (difference < 2 px between the last frame before and the first after the click).
- Keyboard: focus summary, press Enter: opens instantly (no animation), chevron rotates.
- Emulate `prefers-reduced-motion: reduce`: instant toggle.
- Feel-check (cannot be judged from code): record at 4x slow motion in DevTools Animations panel, and test on a real iPhone (Safari) and Firefox. Look again the next day.
