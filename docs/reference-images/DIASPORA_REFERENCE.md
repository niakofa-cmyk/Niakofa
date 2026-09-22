# Niakofa Diaspora UI Reference

## Reference Image
`diaspora-dashboard-reference.webp` — Full Diaspora Dashboard design mockup

## What This Image Shows

This reference screenshot is the **target UX vision** for the Niakofa Diaspora & Family ecosystem. It shows all major modules arranged in a multi-panel view:

### Top Row
1. **Diaspora Dashboard** (`/diaspora`) — Personalized welcome header with locale subtitle, stat cards (Family Spaces, Family Vault, Oral Histories, Family Tree, DNA Connections, Heritage Collections), recent activity feed.
2. **Family Spaces** (`/diaspora/family`) — My Spaces / Invitations tabs, space cards showing member count and role, + Create button.
3. **Family Vault** (`/family/:id`) — Media tabs (All/Photos/Documents/Audio/Video), memory grid with thumbnails, Upload button, Search, Timeline view.

### Middle Row
1. **Memory View** (`/family/:id/memory/:memoryId`) — Date, location, people tags, description, like/comment/share actions.
2. **Oral History Recording** (`/family/:id`) — Live waveform meter, 28:47 timer, Stop/Pause/Chapter controls, prompt card with "Can you tell me about your childhood growing up in Fort Worth?"
3. **Family Tree** (`/diaspora/tree`) — Multi-generation visual tree with generation rows, person nodes (name + birth/death years), SVG connectors, Search/Filter, zoom controls.

### Bottom Row
4. **DNA Connections** (`/diaspora/dna`) — 28 matches found, match cards with shared cM.
5. **Heritage Collections** (`/diaspora/heritage`) — 2-column image grid (Black Cowboys, Great Migration, Civil Rights, Family Recipes, Church History, Fort Worth Stories).
6. **Research Center** (`/diaspora/research`) — Guide cards with external links.
7. **Preserve the Culture** (`/diaspora/preserve`) — Card game fanned display, QR code scan button.
8. **Legacy Timeline** (`/diaspora/timeline`) — Chronological events from 1872–2023.
9. **Nia AI Assistant** — Chat panel with "I found 14 records" response.

## Design Tokens
- Dark theme: `#1a0e00` (deep brown), `#2a1500` (amber brown)
- Amber: primary color for Diaspora ecosystem
- Card style: `rounded-2xl`, `border-border`, subtle backgrounds
- Gold accent: `text-amber-400`, `bg-amber-400/10`
- Font sizes: `text-xs` (12px), `text-sm` (14px), `text-base` (16px), `text-lg` (18px)

## Navigation Architecture
The Diaspora tab on the bottom nav leads to `/diaspora`, which has:
- A sticky horizontal secondary nav bar: Dashboard | Family | Vault | Tree | Oral History | DNA | Heritage | Research | Legacy | More
- Each section is accessible at `/diaspora/<section>`
- Globe lives at `/diaspora/heritage/globe` (centerpiece of Heritage)
- Family Spaces live at `/diaspora/family` (Family tab removed from bottom nav — owned by Diaspora)

## Key Information Architecture Decisions
1. **Globe** moved from Community to Heritage → `/diaspora/heritage/globe`
2. **Family** removed from bottom nav → lives under Diaspora as `/diaspora/family`
3. **Bottom nav** simplified to 5 pillars: Community | Map | Diaspora | Circles | Wallet
4. **Diaspora** has its own contextual secondary nav for all sub-sections
5. **Legacy** becomes part of Diaspora, not a separate top-level entity
