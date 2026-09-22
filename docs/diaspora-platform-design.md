# Diaspora Platform Design Doc
**Family Vault, Oral Histories, Family Tree, and Legacy — Phase A/B schema + API design**

Status: Phase A implemented (migrations 0079–0082, routes, frontend)
Owner: Niakofa team
Repo: `Niakofa` monorepo (`artifacts/api-server`, `lib/db`, `artifacts/nia-service`)

---

## 1. Positioning

Niakofa currently has one strong pillar — **Community** (mutual aid, map, civic, circles,
Nia-for-local-help) — plus early diaspora surfaces already in the codebase:
`diaspora_hubs`, `griot_stories` (oral history / storytelling), `griot_transcription_jobs`,
and `nia_memories` (Nia's own conversational memory of a user — unrelated to this doc's
"family memory" concept, see §3.1 naming note).

This doc scopes a second pillar, **Diaspora** (identity, kinship, cultural continuity), with
a **Legacy** framing (permanence, generational access) layered on top rather than built as a
third parallel system. Per the source brief, everything under Diaspora shares one domain
model — a single `Memory`-like object, not five media systems.

```
Community  → act in the present   (existing)
Diaspora   → identity & kinship   (this doc — Phase A/B)
Legacy     → time horizon         (principles now, dedicated surfaces later)
```

**Nav rule of thumb:** Diaspora is a clear second home in the nav, not 15 new bottom-tab
items. `griot_stories` (public oral-history feed) and the new Family Vault (private) are
related but distinct — a story can be *published from* a vault memory, but the vault itself
never appears in the public feed by default.

---

## 2. Scope

| Phase | Contents | Status |
|---|---|---|
| **A** | Family Spaces, Family Vault (manual upload), Memory/Asset model, tags/search | **Implemented** |
| **B** | Comments/co-authoring, Collections, Preserve-the-Culture QR→Memory | Schema sketched |
| **C** | GEDCOM/Family Tree UI, cloud import connectors (OAuth) | Table stubs only |
| **D** | Raw DNA upload + matching | Out of scope — separate legal/privacy review |

---

## 3. Domain model

### 3.1 Naming decisions

- **`nia_memories`** already exists and means "Nia's structured memory of a user's chat
  history." This doc's "Memory" concept is a different thing. Table name: **`family_memories`**,
  TS type: **`FamilyMemory`**. Product copy can still say "Memory."
- **`griot_stories`** stays as-is. It becomes one publish target a `family_memory` can feed.
- Table prefix: everything new is prefixed `family_` for grep-ability.

### 3.2 Entity overview

```
families (Family Space)
  └─ family_members            (roles, invite status)
  └─ family_memories           (the unified "Memory" object)
       └─ family_memory_assets (photo | video | audio | document)
       └─ family_memory_people (tags: which family_members appear)
       └─ family_memory_comments
  └─ family_interviews         (Oral History sessions → produce a family_memory)
  └─ family_transcription_jobs (independent of griot_transcription_jobs)
```

---

## 4. Migration plan

| # | Migration | Status |
|---|---|---|
| 0079 | `family_spaces_core` — `families`, `family_members` | ✅ Applied |
| 0080 | `family_memories_core` — memories + tags + people + comments | ✅ Applied |
| 0081 | `family_memory_assets` | ✅ Applied |
| 0082 | `family_interviews` + `family_transcription_jobs` + circular FKs | ✅ Applied |

---

## 5. Storage architecture

Phase A introduces object storage (S3/R2) for binary assets:
- Client requests presigned upload URL → `POST /api/family/memories/:id/assets/upload-url`
- Client uploads directly to storage
- Client confirms via `POST /api/family/memories/:id/assets` → writes `family_memory_assets` row
- API never proxies raw file bytes

---

## 6. Privacy model

1. **Default private.** `family_memories` visible only to active `family_members`.
2. **No leakage into Community.** Only an explicit "publish as Griot story" copies to `griot_stories`.
3. **Role gating:** viewer=read-only, contributor=add+comment, curator=edit+manage, owner=full.
4. **Invited-but-unclaimed** members can't access anything until they sign up.
5. **Deleted accounts:** `family_members.user_id` → `set null`, preserving attribution.

---

## 7. API Routes (Phase A)

Mounted at `/api/family/...` in `artifacts/api-server/src/routes/family.ts`.

See §8 of original design brief for full route list.

---

## 9. Open questions

1. ~~griot_transcription_jobs reuse~~ **RESOLVED — separate family_transcription_jobs table.**
2. Object storage provider (S3 vs R2) — presigned URL endpoint stubbed, needs env vars.
3. `family_memory_assets.transcript` vs separate transcripts table — inline for Phase A.
4. Visibility of `private` memories when author leaves — recommend curator/owner retains access.
