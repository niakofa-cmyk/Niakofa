-- A repeated QR scan should resume the same pending preservation flow rather than
-- creating a second durable scan row. Keep the oldest pending row when legacy
-- duplicates exist, then enforce the invariant for future writes.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, qr_digest
           ORDER BY id
         ) AS row_number
  FROM diaspora_preserve_links
  WHERE memory_id IS NULL
)
DELETE FROM diaspora_preserve_links
WHERE id IN (
  SELECT id FROM ranked WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS diaspora_preserve_pending_user_qr_unique
  ON diaspora_preserve_links (user_id, qr_digest)
  WHERE memory_id IS NULL;
