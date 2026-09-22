---
name: Niakofa flexible repay impact chain
description: Wallet.tsx panel showing "Your $X helped N more neighbors" after pledge repayments.
---

# Niakofa Flexible Repay Impact Chain

## Location
`artifacts/pay-it-forward/src/pages/wallet.tsx` — below the `<PayItForwardBadge>` component.

## Logic
- Shown when `transactions` includes any item with `type === "pledge_sent"` or `type === "pledge_repayment"`
- `repayTotal` = sum of `Math.abs(t.amount)` for those transactions
- `neighborsHelped` = `Math.max(1, Math.floor(repayTotal / 5))` — rough community multiplier ($5 = ~1 neighbor helped via the pool)
- Renders: "You've paid back $X across N contributions, helping ~M more neighbors"
- Emoji row: 🤝 × min(neighborsHelped, 10), opacity fades with index; "+N more" label if overflow

## Display condition
- Rendered via IIFE `(() => { ... })()` inside JSX — avoids polluting component scope with extra variables
- Hidden when user has no repayment history (no extra render cost)

**Why:** Closing the feedback loop — contributors need to see that their repayments actually funded more help. Without this display, the PIF system feels like a black hole.
