# Niakofa app improvement guidance

This reference captures the product boundary and next-phase direction supplied
with the August 23, 2026 handoff. The uploaded source notes remain in
`attached_assets/` for the duration of this work session.

## Product boundary

Niakofa owns:

- family knowledge, memories, stories, photos, video, audio, documents, recipes,
  places, and preservation;
- family tree, relationships, profiles, circles, community, messaging, and
  groups;
- mutual aid requests, offers, matching, care circles, resources, and follow-up;
- Nia AI for searching, organizing, capturing, summarizing, discovering, and
  taking user-approved actions across Niakofa data.

The separate Niakofa Legacy RPG repository owns the game runtime, Pixi/canvas,
maps, movement, collision, combat, NPCs, quests, simulation, game assets, and
RPG-specific AI. The main app must not reintroduce that runtime without an
explicit API contract.

“Legacy” remains valid product language for family history and preserved
knowledge. It is not a reason to remove family-history features from Niakofa.

## Product direction

The primary navigation and experience should make these pillars obvious:

1. **Preserve** — capture family knowledge and memories.
2. **Connect** — understand and reach family and community.
3. **Help** — request, offer, match, connect, complete, and follow up.
4. **Understand** — use Nia as a permission-aware action system, not only a
   generic chat box.

The highest-leverage future capability is a family knowledge graph connecting
people, memories, stories, places, events, documents, skills, and relationships.
Capture should make Photo, Voice, Video, Document, Story, and Place first-class
preservation actions, with AI-assisted organization after the user grants
permission.

## Delivery guardrails

- Keep the existing pnpm monorepo and artifact workflows.
- Run `verify:platform`, `boundary-check`, `audit:routes`, `typecheck`, and
  `build` before release.
- Keep deployment verification focused on the Niakofa platform SPA and API
  contracts, not the separate RPG.
- Do not merge RPG-specific engine or AI work into the platform merely because
  it is available in an old branch or open pull request.