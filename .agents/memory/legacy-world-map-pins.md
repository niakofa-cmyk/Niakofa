---
name: Legacy World Map Pins
description: LegacyWorldMapPins macro overworld map; LegacyWorldMapPin interface; MENSAH_DEFAULT_PINS 6-pin arc; procedural SVG bezier route lines.
---

## Component
`artifacts/pay-it-forward/src/components/legacy-world-map-pins.tsx`

## LegacyWorldMapPin interface
```ts
interface LegacyWorldMapPin {
  id: string;
  xPct: number; yPct: number;  // 0-1, % of canvas (resolution-independent)
  label: string;
  country: string;
  year: string;
  era: string;
  unlockState: "locked" | "visited" | "current";
  chapterId?: number;
  description?: string;
}
```

## MENSAH_DEFAULT_PINS (6 pins)
1. Cape Coast (1890, Gold Coast) — visited
2. Kumasi (1912, Gold Coast) — visited
3. Accra (1920, Gold Coast) — current
4. Liverpool (1930, England) — locked
5. New York (1932, USA) — locked
6. Chicago (1945, USA) — locked

## Route lines
Drawn as SVG quadratic bezier (`Q cx cy`) between consecutive visited/current pins, sorted by year. Arc upward for ocean crossings (cy = midpoint - |dx|*0.2). Dashed stroke for visited routes, lighter dashed for locked. No baked art — new pins auto-connect.

## Usage in demo
```tsx
const [worldMapPinsOpen, setWorldMapPinsOpen] = useState(false);
// ...
{worldMapPinsOpen && state.baobabEntered && (
  <LegacyWorldMapPins
    pins={MENSAH_DEFAULT_PINS}
    onClose={() => setWorldMapPinsOpen(false)}
    onSelectPin={(pin) => { setWorldMapPinsOpen(false); setWorldMapOpen(true); }}
  />
)}
```

**Why:** Per WORLD_MAP_ARCHITECTURE.md, the macro map is navigation/overworld (not playable space). Pins use % coordinates so they scale across device sizes without hardcoded px positions.
