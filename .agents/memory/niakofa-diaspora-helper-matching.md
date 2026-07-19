---
name: Niakofa diaspora helper matching
description: Language/heritage filter on GET /helpers/online and the corresponding map UI in map.tsx.
---

# Niakofa Diaspora Helper Matching

## API: GET /helpers/online
- New query param: `?language=sw,yo` — comma-separated lowercase language names
- Backend: `helpers.ts` parses into `languageFilter: string[] | null`
- Filter applied in `.filter()` after the DB query: checks `h.helper_languages.map(toLowerCase).includes(f)` for any value in the list
- `languages: h.helper_languages ?? []` now included in each result item for client-side filtering too
- DB column: `users.helper_languages` (text array)

## Frontend: map.tsx
- `helperLanguageFilter: string | null` state — null = all helpers
- `showLangPicker: boolean` state — controls dropdown visibility
- `displayHelpers` computed with extra `.filter()` using `(h as {languages?:string[]}).languages`
- UI: button at `bottom-32 left-44` shows active language or "Lang"; dropdown lists 16 languages from the same HELPER_LANGUAGES array used in onboarding
- Picking "All helpers" clears the filter

**Why:** Diaspora community members specifically need helpers who speak their heritage language (Swahili, Somali, Amharic, Tagalog, etc.). The filter is purely client-side for display; the API filter prevents fetching irrelevant helpers from the start.
