-- Additive and rerunnable. Never rewrite existing users' balances or ledger.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_signup_once_idx
  ON credit_ledger(user_id) WHERE transaction_type = 'SIGNUP_GRANT';
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_daily_claim_once_idx
  ON credit_ledger(user_id, description) WHERE transaction_type = 'DAILY_LOGIN_CLAIM';

-- Only legacy, unedited Free catalog rows use the former automatic allocation.
-- An owner-saved plan (monthly_price_cents populated) retains its chosen policy.
UPDATE tier_config SET monthly_credits = 0
  WHERE tier = 'free' AND monthly_price_cents IS NULL
    AND (monthly_credits IS NULL OR monthly_credits = 100);
COMMIT;
