# Niakofa Circles — Visual Reference

This directory contains the reference design images for the Niakofa Circles live room experience. These images define the target visual structure for both desktop and mobile layouts.

## Files

- `ChatGPT_Image_Jul_27,_2026,_05_54_57_PM.png` — Desktop layout reference (3-column)
- `ChatGPT_Image_Jul_27,_2026,_05_57_18_PM.png` — Mobile layout reference (two screens)

---

## Desktop Layout (3-Column)

```
|---------------- TOP NAV BAR (full width) -----------------|
| ← Back to Circles        [signal] Excellent Connection  ⋯  Room | Chat |
|-----------|--------------------------|---------------------|
| LEFT PANEL|     CENTER STAGE         |    RIGHT PANEL      |
| (260px)   |     (flex)               |    (320px)          |
|           |                          |                     |
| Title     |  HOST      CO-HOST       | RAISED HANDS (5)    |
| LIVE      |  [video]   [video]       |   - Bring Up        |
| Recording |                          |   - Dismiss         |
| Topic     |  SPEAKERS (3)            |                     |
| Counts    |  [spkr] [spkr] [spkr]    | ROOM CONTROLS       |
|           |                          |   Mute All          |
| People |  |  AUDIENCE (125)          |   Lower All         |
| Reactions |  [avt]x7  +119 More      |   Speaker Limit     |
| tabs      |                          |   Share / Invite    |
|           |  [✋5] [🎤⌄] [📷⌄] [🚪] [📵]|   Settings         |
| On Stage  |                          |   Start Rec         |
| list      |  REACTIONS               |   End Circle        |
|           |  [👋][❤️][😂][😮][🤔][🔥][💯][+] |               |
| Audience  |                          | HOST CONTROLS       |
| list      |                          |   Make Co-Host      |
| See All   |                          |   Remove / Block    |
|           |                          |   Report / Mute     |
|           |                          |   Move to Audience   |
|-----------|--------------------------|---------------------|
|              BOTTOM NAVIGATION                              |
| Home | Events | Marketplace | Messages | Notif | Community | Profile |
```

### Left Panel Elements
- Back to Circles button
- Circle title
- LIVE indicator (green pulsing dot)
- Recording indicator (red dot + timer)
- Topic
- People in room count
- People on stage count
- People / Reactions tab switcher
- On Stage list (avatar, name, role, mic icon, camera icon)
- Audience list (avatar, name, raise hand icon, mute icon)
- Search audience input
- See All / Show less toggle

### Center Stage Elements
- HOST label + large video tile
- CO-HOST label + large video tile
- SPEAKERS (N) label + row of smaller video tiles
- AUDIENCE (N) label + avatar grid with +More button
- "Want to speak?" banner with Raise Hand CTA
- Reactions row (emoji buttons)
- Bottom control bar:
  - Raise Hand (purple circle, count badge)
  - Mic (green when on, dropdown arrow)
  - Camera (green when on, dropdown arrow)
  - Leave Stage (dark circle)
  - Leave Room (red circle)

### Right Panel Elements
- Connection status (signal bars + "Excellent Connection")
- More (...) menu button
- Room / Chat tab switcher
- Room tab:
  - RAISED HANDS (N) with View All link
  - Each entry: avatar, name, "Wants to speak", Bring Up (purple), Dismiss (X)
  - ROOM CONTROLS grid: Mute All, Lower All, Speaker Limit, Share, Invite, Settings
  - Start Recording / Stop Recording button
  - End Circle button (red)
  - HOST CONTROLS: Make Co-Host, Remove, Block, Report, Mute, Move to Audience
- Chat tab:
  - Message list (avatar, name, timestamp, text)
  - Message input with send button

---

## Mobile Layout

### Screen 1 — Room View
```
|--------------------------|
| ← Southside Community    |
| ● LIVE  ● REC 32:45      |
| Community Safety         |
| 128 in room · 18 on stage|
|--------------------------|
| HOST                     |
| [    video tile    ]     |
|--------------------------|
| CO-HOST                  |
| [    video tile    ]     |
|--------------------------|
| SPEAKERS (3)    View All |
| [spkr] [spkr] [spkr]     |
|--------------------------|
| AUDIENCE (125)           |
| [o][o][o][o] +119 More   |
|--------------------------|
| ✋ Want to speak? [Raise] |
|--------------------------|
| [👋][❤️][😂][😮][🤔][🔥][💯]|
|--------------------------|
| [🎤]  [📷]  [🚪]  [📵]    |
|--------------------------|
| Home Events Msg Notif Prof|
|--------------------------|
```

### Screen 2 — More / Controls Panel
Accessed via "..." button in header. Slides up as a bottom sheet.

```
|--------------------------|
| ← Southside Community  ⋯|
| ● LIVE  ● REC 32:45      |
|--------------------------|
| Room | Chat              |
|--------------------------|
| RAISED HANDS (5) View All|
| [avatar] Jasmine L.      |
|   Wants to speak          |
|   [Bring Up] [Dismiss]   |
| ...                      |
|--------------------------|
| ROOM CONTROLS            |
| [Mute All] [Lower All]   |
| [Spk Limit] [Share]      |
| [Invite]    [Settings]   |
| [Start Rec] [End Circle] |
|--------------------------|
| HOST CONTROLS            |
| [Make CoHost] [Remove]   |
| [Block] [Report]         |
| [Mute] [To Audience]     |
|--------------------------|
```

---

## Color System

| Token              | Hex       | Usage                              |
|--------------------|-----------|------------------------------------|
| room.bg            | #09090f   | Main background (near-black)       |
| room.panel         | #0d0d1b   | Sidebars, header bars              |
| room.card         | #141426   | Cards, video tile backgrounds      |
| room.hover         | #1a1a2e   | Hover states                       |
| room.border        | #22223a   | Borders, dividers                  |
| brand.purple       | #7c3aed   | Primary CTA, active tabs           |
| brand.purple-hover | #6d28d9   | Hover state for purple buttons     |
| brand.purple-light | #a78bfa   | Purple text accents                |
| brand.green         | #22c55e   | LIVE indicator, mic active         |
| brand.red           | #ef4444   | Recording, Leave Room, End Circle |
| brand.red-hover     | #dc2626   | Hover state for red buttons        |

## Typography

- Font: Inter (400, 500, 600, 700)
- Body line-height: 150%
- Heading line-height: 120%
- Max 3 font weights per view

## Spacing

- 8px base spacing system
- Consistent padding: 12px (p-3), 16px (p-4), 24px (p-6)

## Responsive Breakpoints

- Mobile: < 640px (single column, bottom sheet for panels)
- Tablet: 640px–1024px (center stage + left panel)
- Desktop: 1024px+ (all three panels visible)
- Wide: 1280px+ (full 3-column with right panel)
