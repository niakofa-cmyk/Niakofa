-- Migration 0042: add dedup sentinel to scheduled_payments
-- Prevents the 6-hour reminder cron from re-sending the same push indefinitely
-- for payments that are overdue but not yet cancelled (users who intend to pay later).
-- The scheduler checks: last_reminder_sent_at IS NULL OR last_reminder_sent_at < NOW() - INTERVAL '24 hours'

ALTER TABLE scheduled_payments
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP WITH TIME ZONE;
