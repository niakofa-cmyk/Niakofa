---
name: Niakofa multilingual safety patterns
description: Crisis and soft-distress patterns in safety.ts cover 11 languages; key rules for maintaining them correctly.
---

## Rule
safety.ts crisis/soft-distress patterns must cover ALL languages in culturalGreetings.ts:
en, es, sw, zu, tw, yo, ha, am, so, pcm, lg.

## Critical implementation note
**Never use `\b` word boundaries on non-ASCII/diacritic language patterns.**
`\b` is ASCII-only in JavaScript regex. Yoruba ("mo fẹ́ kú"), Twi ("mepε sε mewu"), etc.
will silently fail to match with `\b` — creating crisis false negatives.

**Fix:** Use bare `/(pattern)/i` without `\b` for all African/diaspora language patterns.
English and Spanish patterns may keep `\b` because they're ASCII-safe.

**Why:** False negatives (missing someone in crisis writing in Swahili/Yoruba/etc.) are
unacceptable. False positives (Nia shows crisis resources unnecessarily) cost nothing.

## How to apply
When adding new patterns for any non-ASCII language, use:
  `/(phrase1|phrase2)/i` — NOT `/\b(phrase1|phrase2)\b/i`

The distinction is in the file comments: look for "No \\b boundaries" in the African section.
