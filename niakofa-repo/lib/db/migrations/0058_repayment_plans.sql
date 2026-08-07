-- Migration 0058: Repayment Plans — flexible installment tracking for Pay It Forward
--
-- Adds a repayment_plans table so users can commit to a structured repayment
-- schedule (2 installments, 4 installments, etc.) rather than a single
-- one-time payment. Each plan groups one or more scheduled_payments rows.
--
-- The scheduled_payments table already handles individual reminders and
-- "pay now" fulfillment — this table is purely for grouping/labeling them.
--
-- plan_type values:
--   one_time        — single scheduled payment (existing behavior, no plan row needed)
--   installments_2  — 2 equal installments
--   installments_4  — 4 equal installments
--
-- period values:
--   days_2          — spread over 2 days
--   weeks_2         — spread over 2 weeks
--   months_2        — spread over 2 months
--   years_2         — spread over 2 years
--
-- status: active → completed (when all installments paid) | cancelled

CREATE TABLE IF NOT EXISTS repayment_plans (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL,
  request_id        INTEGER NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  plan_type         TEXT NOT NULL DEFAULT 'installments_2',
  period            TEXT NOT NULL DEFAULT 'weeks_2',
  total_amount      REAL NOT NULL,
  installment_count INTEGER NOT NULL DEFAULT 2,
  amount_per_installment REAL NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at      TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_repayment_plans_user_id
  ON repayment_plans(user_id);

CREATE INDEX IF NOT EXISTS idx_repayment_plans_request_id
  ON repayment_plans(request_id);

CREATE INDEX IF NOT EXISTS idx_repayment_plans_status
  ON repayment_plans(status)
  WHERE status = 'active';

-- Add plan_id FK to scheduled_payments so we can group installments
ALTER TABLE scheduled_payments
  ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES repayment_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_payments_plan_id
  ON scheduled_payments(plan_id)
  WHERE plan_id IS NOT NULL;
