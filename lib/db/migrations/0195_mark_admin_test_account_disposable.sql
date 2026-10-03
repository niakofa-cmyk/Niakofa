-- On databases where the seed account does not exist yet, this intentionally
-- changes nothing. Production verification must confirm the marker after deploy.
UPDATE users
   SET is_disposable_test_account = TRUE
 WHERE lower(email) = 'admin@niakofa.app'
   AND name = 'Admin Test Account'
   AND is_admin IS TRUE
   AND approval_status = 'approved'
   AND is_suspended IS FALSE
   AND is_disposable_test_account IS DISTINCT FROM TRUE;