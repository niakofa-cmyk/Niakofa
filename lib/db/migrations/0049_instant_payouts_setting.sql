-- Migration 0049: Seed instant_payouts_enabled system setting
--
-- Stripe Instant Payouts push funds to a linked debit card within 30 minutes.
-- The feature requires the helper's Stripe Connect Express account to have a
-- debit card linked and instant payout capability enabled by Stripe.
--
-- This setting is OFF by default — platform admin must explicitly enable it.
-- When enabled, helpers see an "Instant Payout (1.5% fee)" option on the
-- wallet cashout screen. The 1.5% fee offsets Stripe's instant payout charge.
--
-- Platform admin can toggle via POST /admin/settings (system_settings table).

INSERT INTO "system_settings" ("key", "value")
VALUES ('instant_payouts_enabled', 'false')
ON CONFLICT ("key") DO NOTHING;
