# Niakofa Community social redesign

This archive contains the focused frontend source changes for the Facebook-inspired Niakofa Community experience.

## Included behavior

- Slim Niakofa identity header with compact Create, Search, and Messages actions.
- Existing app-wide icon navigation restored on Community routes.
- Community-specific navigation reduced to Feed, Requests, and one More menu.
- Dedicated collapsed "What's on your mind?" composer using the signed-in user's avatar.
- Direct media attachment plus expanded Request, Story, and Post actions.
- Compact Stories rail placed between the composer and social feed.
- Flatter, mobile-first feed cards with Hub context retained.
- Existing Hub authorization, Stories, Requests, media privacy, Messages, Spirals, Diaspora, and routing contracts preserved.

## Validation completed

- Frontend TypeScript compile
- ESLint with zero warnings on all changed files
- Git diff whitespace validation
- Focused Community architecture tests
- Managed Vite workflow restart
- Browser console inspection

Extract the archive over the repository root to preserve the included file paths.