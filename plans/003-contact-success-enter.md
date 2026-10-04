# 003 - Let the contact confirmation arrive

- **Status**: DONE
- **Commit**: 9c38a30
- **Severity**: LOW
- **Category**: Missed opportunities (delight budget: rare, high-value moment)
- **Estimated scope**: 1 file (aethra-site/public/css/site.css), about 8 lines

## Problem
After a message is sent, the `.success` panel (aethra-site/lib/views.js, contact page) appears fully formed. It is the single most valuable moment on the site and the only rare one.

## Target
```css
@keyframes pop-in { from { opacity: 0; transform: translateY(8px) scale(.98); } }
.success { animation: pop-in 260ms var(--ease-out); }
@media (prefers-reduced-motion: reduce) {
  @keyframes pop-in-soft { from { opacity: 0; } }
  .success { animation: pop-in-soft 160ms ease; }
}
```
Only transform and opacity; never start from scale(0).

## Repo conventions to follow
Tokens from design-tokens.css; the panel already receives focus via `data-autofocus` (site.js). Keep that behaviour.

## Steps
1. Append the CSS to site.css. 2. No markup or JS changes.

## Out of scope
No confetti, no checkmark drawing, no sound.

## Verification
- npm test passes (contact tests check markup, not motion).
- Send a test message in a browser: the panel eases in once, focus lands on it, screen reader announces it.
- Reduced motion: opacity only.
