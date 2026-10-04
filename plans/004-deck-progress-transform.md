# 004 - Animate the deck progress bar with transform

- **Status**: DONE
- **Commit**: 9c38a30
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 1 generator file (aethra-site/scripts/make-deck.cjs), regenerate output

## Problem
The progress bar transitions `width`, which triggers layout on every slide change.

```css
/* make-deck.cjs, css string: current */
.progress i{display:block;height:100%;width:0;background:var(--glow);transition:width 200ms var(--ease-out)}
```
and in the JS string: `bar.style.width = ((i + 1) / slides.length * 100) + '%';`

## Target
```css
.progress i{display:block;height:100%;width:100%;background:var(--glow);transform-origin:left;transform:scaleX(0);transition:transform 200ms var(--ease-out)}
```
```js
bar.style.transform = 'scaleX(' + ((i + 1) / slides.length) + ')';
```
Reduced motion keeps `transition:none` (already present).

## Steps
1. Edit the two strings in scripts/make-deck.cjs.
2. Run `cd aethra-site && node scripts/make-deck.cjs` to regenerate public/deck/.

## Out of scope
Never edit public/deck/*.css or *.js by hand: they are generated.

## Verification
- npm test passes (deck test). Open /deck/aethra-en.html, press the right arrow: the bar grows smoothly; the first slide shows 20%.
