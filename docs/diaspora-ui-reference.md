# Niakofa Diaspora & Family — UI Reference

This document captures the target design for the Diaspora & Family module
based on the reference screenshot provided by the product team.

## Key UI Elements (from reference screenshot)

### Diaspora Dashboard (`/diaspora`)
- Personalized header: "Welcome back, [Name]" with locale subtitle
- 6 stat cards in a grid: Family Spaces, Vault Items, Oral Histories, Tree People, DNA Connections, Heritage Collections
- Feature cards with stat numbers and colored icon badges
- Recent Activity feed with thumbnails and timestamps
- DNA Connections promo card with provider logos (AncestryDNA, 23andMe, MyHeritage)
- Heritage Collections preview grid (2x2)
- "Our Legacy Lives On" promotional banner
- Nia AI assistant panel

### DNA Connections (`/diaspora/dna`)
- Ethnicity breakdown with colored bars (West Africa, Cameroon & Congo, Nigeria, etc.)
- DNA Match cards showing:
  - Avatar with initials
  - Name (e.g. "Shawn Davis")
  - Relationship label (e.g. "1st Cousin")
  - Shared cM amount (e.g. "327 cM")
  - Confidence indicator
- Import flow with provider selection

### Heritage Collections (`/diaspora/heritage`)
- 2-column grid of collection cards
- Each card has a 16:9 image thumbnail
- Title, item count, and theme tags
- Featured collections: Great Migration, Black Cowboys, Civil Rights, Family Recipes, Church History, Fort Worth Stories

### Preserve the Culture (`/diaspora/preserve`)
- Card fan display (multiple cards fanned behind current card)
- Current card with prompt and follow-up question
- Category badge and color theming
- Shuffle and navigation controls
- QR code scan button at bottom

### Family Tree (`/diaspora/tree`)
- Generation rows with connector lines
- Person nodes with avatars and birth years
- Selected person detail panel with parents/children/spouses
- Add Relation modal (parent-child or spouse)
- Relationship Explorer (BFS pathfinder between any two people)
- Tree statistics (people, generations, links, active)

### Family Vault (`/family/:id`)
- Media type tabs: Photos, Documents, Audio, Videos
- Memory cards with thumbnails
- Upload and recording controls
- Member management
- GEDCOM import

### Research Center (`/diaspora/research`)
- Research guide cards with difficulty badges
- Category filtering
- External resource links
- Locale-specific guides (Tarrant County, Fort Worth City Directories)

## Design Principles
- Warm, earthy color palette (amber, emerald, rose, teal)
- 8px spacing system
- Card-based layout with rounded corners (rounded-xl, rounded-2xl)
- Subtle borders and backgrounds (bg-card, border-border)
- Mobile-first responsive design
- Progressive disclosure via modals and tabs
