-- Records government budget authority and request-level public funding
-- commitments. These records are not payment or disbursement evidence.

CREATE TABLE IF NOT EXISTS government_budgets (
  id SERIAL PRIMARY KEY,
  government_sponsor_id INTEGER NOT NULL
    REFERENCES government_sponsors(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,
  appropriation_reference TEXT NOT NULL,
  authorized_amount NUMERIC(12, 2) NOT NULL CHECK (authorized_amount > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT government_budgets_appropriation_uidx
    UNIQUE (government_sponsor_id, fiscal_year, appropriation_reference)
);

CREATE INDEX IF NOT EXISTS government_budgets_sponsor_status_idx
  ON government_budgets (government_sponsor_id, status);

CREATE TABLE IF NOT EXISTS government_request_funding (
  id SERIAL PRIMARY KEY,
  government_sponsor_id INTEGER NOT NULL
    REFERENCES government_sponsors(id) ON DELETE RESTRICT,
  budget_id INTEGER NOT NULL REFERENCES government_budgets(id) ON DELETE RESTRICT,
  request_id INTEGER NOT NULL REFERENCES help_requests(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status = 'approved'),
  notes TEXT,
  approved_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT government_request_funding_sponsor_request_uidx
    UNIQUE (government_sponsor_id, request_id)
);

CREATE INDEX IF NOT EXISTS government_request_funding_sponsor_created_idx
  ON government_request_funding (government_sponsor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS government_request_funding_budget_status_idx
  ON government_request_funding (budget_id, status);
