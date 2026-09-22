---
name: Niakofa SankofaBird CSS-in-JSX template literal rules
description: Three hard rules for writing CSS inside JSX template literals in SankofaBirdSvg.tsx — backticks, nested @media, and multi-animation conflicts.
---

# SankofaBird CSS Template Literal Rules

## Rule 1: Never use backtick characters inside CSS comments in the style block

SankofaBirdSvg.tsx injects all CSS via a JSX template literal (`\`...\``). Any backtick inside the string terminates the template early — the Babel/Vite parser throws `Unexpected token, expected "}"` at the backtick position.

**Fix:** Replace `` `filter` `` in comments with `filter` (no backticks), or use CSS comments without backtick-quoted terms.

**Why:** The CSS is inside a JS template literal. Backticks are JS syntax, not CSS syntax.

## Rule 2: Never nest @media inside a CSS selector block

```css
/* INVALID — breaks in older WebKit, silently dropped: */
html:not([data-bird-anim]) @media (prefers-reduced-motion: reduce) { ... }

/* CORRECT — @media at top level, selectors inside: */
@media (prefers-reduced-motion: reduce) {
  html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .element { ... }
}
```

**Why:** CSS `@media` is only valid at the top level of a stylesheet, not inside a selector block. Older WebKit and the CSS cartographer both reject it silently, meaning the reduced-motion guard never fires.

## Rule 3: Later `animation:` shorthand declarations clobber earlier ones on the same element

When a Phase 6 CSS rule targets the same element as an earlier Phase 1/2/3 rule, the later `animation:` shorthand replaces the entire earlier animation, not just adds to it.

**Example of the bug (Phase 6 broke Phase 1 wing flap):**
```css
/* Phase 1 — correct */
.sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-left {
  animation: sankofa-flap-banked-left var(--flap-period, 300ms) ease-in-out infinite;
}
/* Phase 6 — WRONG: this overwrites the flap entirely */
.sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-left {
  animation: sankofa-wing-downstroke-specular var(--flap-period) ease-in-out infinite;
}
```

**Fix:** The later rule must list ALL animations:
```css
.sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-left {
  animation:
    sankofa-flap-banked-left var(--flap-period, 300ms) ease-in-out infinite,
    sankofa-wing-downstroke-specular var(--flap-period, 300ms) ease-in-out infinite;
}
```

**Why:** CSS `animation` shorthand is a single property — later declarations win via cascade. Since `sankofa-flap-banked-left` animates `transform` and `sankofa-wing-downstroke-specular` animates `filter`, they compose without conflict when listed together.

## How to apply

When adding a new Phase N CSS rule that targets an element already targeted by an earlier Phase:
1. Search for any earlier `animation:` declarations on that exact element+selector combination.
2. If found, list ALL animations (old + new) in the later rule.
3. If the new animation uses a different CSS property than the old one (e.g. filter vs transform), they can be combined safely.
4. Never put backticks in CSS comments inside the `style` JSX tag.
5. Never put `@media` inside a selector block — always at top level.
