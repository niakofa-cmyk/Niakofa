# Niakofa Community Story Visual System

## Design direction

The supplied Meta references show a strong pattern:

- media is the hero
- identity is compact
- controls remain reachable with one hand
- creation starts from the gallery/camera
- editing tools live at the bottom
- secondary controls use dark translucent surfaces
- full-screen media receives maximum visual space

Niakofa should preserve that interaction grammar while making the product clearly its own.

## Niakofa visual hierarchy

### Story rail

Order:

1. Your Story
2. Community Story authors
3. optional Hub Story authors
4. overflow only when needed

Each author gets:

- 64 px visual target
- 2–3 px story ring
- author avatar
- compact name
- unseen/seen state
- optional `Community` / `Hub` context chip in expanded layouts

Avoid large explanatory paragraphs above the rail. Stories are a media-first surface.

### Story viewer

The viewer should use:

- 4–5 px progress bars at top
- author identity at upper left
- close / overflow controls at upper right
- left/right tap zones
- media centered with `object-contain`
- gradient scrims only where text needs contrast
- bottom reaction / reply / share controls
- safe-area padding for Android and iOS

### Composer

Use a three-zone structure:

1. Header: close, draft/settings
2. Media canvas: 9:16, maximum visual area
3. Bottom tool dock: Music, Stickers, Text, Effects, Mention

When the gallery is open:

- use a compact header
- provide explicit `Select multiple`
- show selection count
- keep camera capture available
- preserve the selected-media preview

### Music

The supplied dark music surface is useful as a reference for density.

Niakofa's music surface should show:

- search
- `For you`
- `Trending`
- track artwork
- title
- artist
- play affordance
- overflow
- selected state

Current repo limitation remains intentional:
music is Story metadata until a licensed catalog/audio-mixing pipeline exists.

### Accessibility

Minimum:

- 44 px interactive targets
- visible keyboard focus
- labels on icon-only controls
- reduced-motion support
- safe-area insets
- no text-only color meaning
- `aria-live` for upload/publish state

### Responsive behavior

Desktop:
- Story rail remains compact
- composer/viewer centered
- max-width 520 px for phone-shaped media

Mobile:
- full-bleed viewer
- bottom dock stays inside safe-area
- gallery uses 3-column grid
- composer reaches full viewport height

## Suggested visual tokens

Primary action:
`hsl(var(--primary))`

Viewer surface:
`#050505`

Translucent control:
`rgba(0,0,0,.58)`

Viewer scrim:
`linear-gradient(180deg, rgba(0,0,0,.62), transparent 30%, transparent 68%, rgba(0,0,0,.72))`

Story ring:
`conic-gradient(from 180deg, var(--primary), #f472b6, #f59e0b, var(--primary))`

These tokens are examples; the app's existing theme variables remain authoritative.
