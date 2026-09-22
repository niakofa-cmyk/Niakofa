---
name: Niakofa iOS input zoom prevention
description: How to prevent iOS Safari auto-zoom on focus for raw input and textarea elements.
---

## Rule
Raw `<input>` and `<textarea>` elements with `text-sm` (font-size < 16px) trigger iOS Safari's auto-zoom-on-focus, which breaks mobile UX.

## Fix
Add `style={{ fontSize: "16px" }}` inline to any raw `<input>` or `<textarea>`.

## Exception
The shared shadcn `<Input>` component already has `text-base md:text-sm` — it handles this correctly and does NOT need the inline style.

**Why:** iOS Safari zooms in any field whose computed font-size is < 16px. The `md:text-sm` breakpoint makes the size 14px only on desktop, keeping 16px on mobile.

**How to apply:** When adding a raw `<input>` or `<textarea>` in any page, always include `style={{ fontSize: "16px" }}`. Files already fixed: login.tsx (7 inputs), settings.tsx (2 inputs), request-new.tsx (checklist inputs), wallet.tsx (hardship textarea).
