-- 0075_chat_messages_sender_set_null.sql
--
-- Security/DB-constraint audit follow-up: chat_messages.sender_id was
-- ON DELETE CASCADE (migration 0020), so deleting a user's account silently
-- destroyed the OTHER participant's chat history for every request they'd
-- messaged about. Conversation history should outlive an account deletion —
-- switch to SET NULL (matching help_requests.helper_id's existing pattern,
-- migration 0020) and make the column nullable so a deleted sender just
-- shows as an unattributed message instead of erasing the thread.
--
-- chat_messages.request_id is left untouched: a message thread genuinely has
-- no meaning once its request is deleted, so CASCADE there is correct.

ALTER TABLE chat_messages ALTER COLUMN sender_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_messages_sender_id_fk' AND conrelid = 'chat_messages'::regclass
  ) THEN
    ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_sender_id_fk;
  END IF;
END $$;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_sender_id_fk
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
