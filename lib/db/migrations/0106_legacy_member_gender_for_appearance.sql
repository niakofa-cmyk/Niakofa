-- 0106_legacy_member_gender_for_appearance.sql
--
-- Adds an explicit, optional gender field to family_members, so a chapter's
-- ancestor can get a real walking-character appearance instead of Legacy
-- Mode's chapter runtime defaulting everyone to a generic placeholder.
--
-- WHY THIS EXISTS:
-- legacy-character-asset-engine.ts (buildAppearance) has always required an
-- explicit age AND explicit gender before it will resolve a TV sprite
-- appearance — by design, it refuses to guess gender from a name or
-- relationship ("Missing metadata remains visible as 'pending' rather than
-- being guessed"). That engine already works correctly for AI-extracted
-- interview NPCs, which carry gender from the extraction. It was never
-- reachable for a chapter's own ancestor_member_id, because family_members
-- had nowhere to durably store gender at all — birth_year/death_year were
-- added in migration 0105 for timeline/lineage, but gender was missing
-- entirely. This migration closes that specific gap.
--
-- Nullable and optional by design, matching this codebase's consent-driven,
-- never-inferred approach to personal data: existing members default to
-- NULL (appearance stays "pending" — a neutral placeholder sprite, not a
-- guess) until a family member explicitly sets it. The check constraint
-- mirrors GeneratedCharacterGender in legacy-character-asset-engine.ts,
-- which is the current limit of the TV sprite layer catalog (see that
-- file's header comment on Face/TV catalog licensing status) — not a
-- statement that only two options exist. Widening this later just means
-- widening the constraint and the asset engine's variant table together.
--
-- Idempotent — safe to re-run on an already-migrated database.

ALTER TABLE family_members ADD COLUMN IF NOT EXISTS gender TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'family_members_gender_check'
  ) THEN
    ALTER TABLE family_members
      ADD CONSTRAINT family_members_gender_check
      CHECK (gender IS NULL OR gender IN ('male', 'female'));
  END IF;
END $$;
