---
name: Legacy Weather Overlay
description: LegacyWeatherOverlay component + deriveChapterWeather() utility; 8 weather types driven by chapter era/scene progress or demo season/phase.
---

## Component
`artifacts/pay-it-forward/src/components/legacy-weather-overlay.tsx`

### Weather types (LegacyWeatherType)
```ts
"clear" | "overcast" | "rain" | "storm" | "fog" | "dust" | "golden" | "night"
```

### deriveChapterWeather(sceneProgress: number, era?: string): LegacyWeatherType
- `sceneProgress` 0–1 (currentSceneIdx / (total - 1))
- era "1920s"/"1930s"/"collapse" → rain/overcast
- era "migration"/"diaspora" → storm/fog
- era "1890s"/"1900s" → dust/clear
- sceneProgress >= 0.75 → night
- sceneProgress >= 0.5 → golden

### Demo season → weather mapping (legacy-demo.tsx)
- "rain" → "rain"
- "dry" → "dust"  
- "harvest" → "golden"
- "celebration" → "clear"
- phase "chapter4"/"world-regen" → "rain"
- phase "chapter5" → "fog"
- phase "finale" → "golden"

## Usage in chapter
```tsx
<LegacyWeatherOverlay
  weather={deriveChapterWeather(
    currentSceneIdx / Math.max(sceneData.scenes.length - 1, 1),
    sceneData.ancestorAppearance?.era,
  )}
/>
```

## Usage in demo
```tsx
const worldWeather: LegacyWeatherType = (() => { /* season/phase logic */ })();
{state.baobabEntered && worldWeather !== "clear" && (
  <LegacyWeatherOverlay weather={worldWeather} intensity={0.7} />
)}
```

**Why:** Weather is a runtime tint/overlay (not separate paintings). Same base world, different atmosphere. Per WORLD_MAP_ARCHITECTURE.md: "Lighting/weather state → runtime color-grade/particle overlay."
