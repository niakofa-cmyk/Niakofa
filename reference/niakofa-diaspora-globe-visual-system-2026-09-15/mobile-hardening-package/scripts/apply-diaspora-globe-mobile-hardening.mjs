#!/usr/bin/env node
/**
 * Niakofa Diaspora Globe + Mobile hardening
 *
 * Run from repository root:
 *   node scripts/apply-diaspora-globe-mobile-hardening.mjs
 *
 * The script is intentionally deterministic: every replacement must match
 * exactly once. If the source has diverged, it stops instead of silently
 * modifying the wrong version.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(
  root,
  "artifacts/pay-it-forward/src/components/diaspora/DiasporaGlobeFirst.tsx",
);

let source = fs.readFileSync(target, "utf8");

const replacements = [
  [
    'className={`${diasporaTheme.radiusHero} relative h-[calc(100vh-5.5rem)] min-h-[620px]',
    'className={`${diasporaTheme.radiusHero} relative h-[calc(100vh-5.5rem)] min-h-[520px] sm:min-h-[620px]',
  ],
  [
    'className="relative h-10 w-10 rounded-full border-2 shadow-lg transition-transform hover:scale-110',
    'className="relative h-11 w-11 rounded-full border-2 shadow-lg transition-transform hover:scale-110',
  ],
  [
    'className="pointer-events-none absolute inset-1 rounded-full border border-white/30 animate-pulse"',
    'className="pointer-events-none absolute inset-1 rounded-full border border-white/30 motion-safe:animate-pulse motion-reduce:animate-none"',
  ],
  [
    'className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white"',
    'className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-white/35 hover:bg-white/5 hover:text-white"',
  ],
  [
    'className="absolute bottom-3 left-3 right-3 z-20 max-h-[55%] overflow-auto rounded-2xl',
    'className="absolute bottom-20 left-3 right-3 z-20 max-h-[calc(100%-7.5rem)] overflow-auto rounded-2xl sm:bottom-5',
  ],
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"Refusing to patch {target}: expected exactly one occurrence of {old!r}, found {count}."
        )
    source = source.replace(old, new, 1)

fs.writeFileSync(target, source);
console.log(`Patched ${path.relative(root, target)} with mobile/globe hardening.`);
