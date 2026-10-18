-- Requests without an explicit funding choice must not implicitly create
-- Pay It Forward pledges. Existing request rows are unchanged.
ALTER TABLE help_requests
  ALTER COLUMN payment_type SET DEFAULT 'goodwill';
