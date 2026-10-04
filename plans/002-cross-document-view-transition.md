# 002 - Soften page changes with a cross-document view transition

- **Status**: DONE
- **Commit**: 9c38a30
- **Severity**: LOW
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (aethra-site/public/css/site.css), about 8 lines

## Problem
The site is multi-page. Each navigation repaints from blank, which reads as a flash on the dark hero pages. Nothing declares a transition.

## Target
```css
@view-transition { navigation: auto; }
::view-transition-old(root), ::view-transition-new(root) {
  animation-duration: 150ms;
  animation-timing-function: var(--ease-out);
}
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root), ::view-transition-new(root) { animation: none; }
}
```
Browsers without support ignore the at-rule.

## Repo conventions to follow
Use the tokens in design-tokens.css. The sticky header must not flicker: do not give it a view-transition-name.

## Steps
1. Append the CSS to site.css (public pages only; admin.css is untouched).
2. Do not add JavaScript.

## Out of scope
No named transitions for individual elements, no transition on the admin panel or the deck.

## Verification
- npm test passes.
- On a real phone (iOS Safari 18.2+, Android Chrome): navigate between pages; a short crossfade, no header flicker, no delayed navigation. If navigation feels delayed on a slow connection, remove the rule.
- Reduced motion on: navigation is instant.
