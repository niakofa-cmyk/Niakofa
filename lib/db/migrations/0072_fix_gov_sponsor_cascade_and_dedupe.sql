-- 0072_fix_gov_sponsor_cascade_and_dedupe.sql
--
-- Same class of bug as 0071, found by a systematic sweep for ANY (table,
-- column) with more than one FK constraint to the same referenced table:
--
-- civic_needs.government_sponsor_id had both a CASCADE and a RESTRICT
-- constraint (migration 0068 intended RESTRICT but, like 0069, only knew
-- about one of the two existing constraint names). Empirically verified
-- CASCADE wins over RESTRICT when both exist, so deleting a government
-- sponsor was still silently deleting every civic need it sponsored,
-- despite 0068's intent. Drops the stray CASCADE duplicate.
--
-- Also drops the harmless (same-behavior, both CASCADE) duplicate
-- constraints on transactions.user_id, chat_messages.sender_id, and
-- ratings.rater_id/ratee_id — no behavior change, just removes confusing
-- redundant constraints so a future audit doesn't have to re-derive that
-- they're not conflicts.

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- The one real conflict: keep RESTRICT, drop CASCADE.
  FOR rec IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'civic_needs'::regclass
      AND confdeltype = 'c'
      AND conkey = (SELECT conkey FROM pg_constraint WHERE conname = 'civic_needs_government_sponsor_id_government_sponsors_id_fk')
  LOOP
    EXECUTE format('ALTER TABLE civic_needs DROP CONSTRAINT %I', rec.conname);
    RAISE NOTICE 'Dropped stray CASCADE constraint % on civic_needs.government_sponsor_id', rec.conname;
  END LOOP;
END $$;

-- Harmless duplicates (both sides already CASCADE) — drop the redundant one, keep one per column.
ALTER TABLE transactions  DROP CONSTRAINT IF EXISTS transactions_user_id_fk;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fk;
ALTER TABLE ratings       DROP CONSTRAINT IF EXISTS ratings_rater_id_fk;
ALTER TABLE ratings       DROP CONSTRAINT IF EXISTS ratings_ratee_id_fk;
