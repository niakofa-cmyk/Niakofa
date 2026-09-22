-- DNA matching is opt-in separately from DNA import. Results are derived,
-- scoped to Family Spaces, and expire with the source profile retention period.

CREATE TABLE IF NOT EXISTS dna_matching_consents (
  id              SERIAL PRIMARY KEY,
  family_id       INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opted_in        BOOLEAN NOT NULL DEFAULT false,
  consent_version TEXT NOT NULL DEFAULT 'dna-matching-v1',
  consented_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dna_matching_consents_family_user_unique UNIQUE (family_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dna_matching_consents_user
  ON dna_matching_consents(user_id);

CREATE TABLE IF NOT EXISTS dna_match_results (
  id                  SERIAL PRIMARY KEY,
  family_id           INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matched_family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  matched_user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  similarity_score    REAL NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
  shared_cm_est       INTEGER NOT NULL CHECK (shared_cm_est >= 0),
  relationship_band   TEXT NOT NULL,
  confidence          TEXT NOT NULL,
  source              TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL,
  CONSTRAINT dna_match_results_pair_unique
    UNIQUE (family_id, user_id, matched_family_id, matched_user_id)
);

CREATE INDEX IF NOT EXISTS idx_dna_match_results_user_family
  ON dna_match_results(user_id, family_id);
CREATE INDEX IF NOT EXISTS idx_dna_match_results_expiry
  ON dna_match_results(expires_at);