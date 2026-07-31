# Niakofa — Legacy Mode Design Reference

## Overview
Legacy Mode is the 5th bottom-nav tab — a Living Family RPG built from real family history.
The gameplay is generated from the family's actual memories, tree members, oral stories, and vault.

## UI Reference
`ui-reference.png` — Full design mockup showing all game panels.

## Source Documents
- `legacy-design-spec.txt` — Full concept specification (The Living Family Legacy Experience)
- `legacy-product-brief.txt` — Updated product brief and game intent

## Key Sections (from reference image)
1. **Game Modes**: Legacy Mode, Exploration Mode, Family Quests, Reunion Mode
2. **Live Gameplay**: Character with Health/Knowledge/Reputation/Faith stats, current chapter
3. **World Map / Stages**: Ancestral Village → Mission School → Colonial Town → New Opportunities
4. **Story Chapters**: Life chapters derived from timeline decades (Origins, New World, Great Migration, Faith & Family, Modern Era)
5. **Today's Journey**: Dynamic start screen — awakens as a random ancestor with today's goal
6. **AI Dialogue Panel**: Nia-generated conversation from family vault content
7. **In-Game Characters**: Family members as playable ancestors with portraits
8. **Dialogue / Story Events**: AI-generated narrative from family vault content
9. **Quest System**: Active quests with XP rewards and tracking
10. **Inventory / Collections**: Items | Memories | Artifacts tabs
11. **Achievements**: Story Keeper (75/100), Roots Explorer (6/10), Family Connector (3/5), Legacy Builder (42/50)
12. **Skill Tree**: Historian, Explorer, Story Keeper, Photographer, Interviewer, Archivist, Genealogist, Community Builder
13. **Family Vault**: Photos | Stories | Videos | Docs tabs
14. **Oral Story Recording**: 00:00:45 voice recording interface
15. **Progress Dashboard**: 23 Stories, 56 Relatives, 12 Landmarks, 8 Quests
16. **Multiplayer / Family Reunion**: Cooperative challenge with family leaderboard

## Bottom Nav Change
Before: Community | Map | Diaspora | Circles | Wallet
After:  Community | Map | Diaspora | Circles | LEGACY

## Stats System
- **Health**: Derived from interviews + family members
- **Knowledge**: Derived from memories/stories count
- **Reputation**: Derived from family members count
- **Faith**: Derived from uploaded photos/documents (new in enhanced version)

## Flywheel
Family Cards → Story Recording → Family Vault → Genealogy → AI organizes → Historical Timeline → Family World → Personal RPG → New Memories → More Stories → Game Evolves → Repeat

## Routes
- `/legacy` — Legacy Mode home (game hub)
- `/legacy/achievements` — Achievement & Skill Tree system
- `/diaspora/timeline` — Legacy Timeline (chronological family history)
- `/diaspora/tree` — Family Tree (characters source)
- `/family/:id` — Family Vault (inventory/memories source)
- `/diaspora/preserve` — Preserve the Culture card game

## Color Palette
- Background: warm dark brown `#1A0F08`
- Card: `#2A1A0F`
- Gold accent: amber-400 `#FBBF24` / amber-300 `#FCD34D`
- Text: warm ivory `text-amber-50` / `text-stone-200`
- Borders: `border-amber-900/40`
- Stats: Health=red, Knowledge=blue, Reputation=gold, Faith=purple

## Enhanced Features (Latest Update)
- Story Chapters section with decade-based life chapters
- Today's Journey dynamic start screen
- AI Dialogue panel with Nia-generated conversations
- Faith stat added to ancestor character system
- Enhanced achievements with skill tree integration
- Improved oral story recording with waveform visualization
