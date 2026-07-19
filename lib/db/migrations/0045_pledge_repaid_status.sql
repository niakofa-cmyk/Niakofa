-- Migration 0045: rename pledge_status 'forgiven' → 'repaid' for system-paid pledges
--
-- Bug: pledge_status = 'forgiven' was used for two semantically different things:
--   1. Admin explicitly waiving a debt as charity (the only true "forgiven")
--   2. System marking a pledge closed because the requester paid it in full
--
-- This collision means any admin report or dashboard query counting "forgiven
-- pledges" as write-offs silently includes pledges that were actually paid
-- back in full — inflating the hardship/write-off metric and deflating the
-- actual repayment metric.
--
-- Fix: introduce 'repaid' as the terminal status for full self-service repayment.
-- 'forgiven' is reserved exclusively for admin-granted charity/forgiveness.
--
-- Backfill: rows where pledge_status = 'forgiven' AND pledge_paid >= pledge_amount
-- are rows the system auto-closed on full repayment — rename them to 'repaid'.
-- Rows where pledge_status = 'forgiven' AND (pledge_paid < pledge_amount OR
-- pledge_amount IS NULL) are genuine admin forgiveness — leave them as 'forgiven'.

UPDATE help_requests
   SET pledge_status = 'repaid'
 WHERE pledge_status = 'forgiven'
   AND pledge_paid IS NOT NULL
   AND pledge_amount IS NOT NULL
   AND pledge_paid >= pledge_amount;
