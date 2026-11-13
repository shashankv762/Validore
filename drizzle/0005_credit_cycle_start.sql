-- Additive delta for existing databases. Preserve balances and ledger history.
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_cycle_started_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_credits_used_this_cycle integer;

-- Free allowances have always used thirty-day cycles. Paid cycles are hydrated
-- from the payment provider at the next credit operation, never guessed here.
UPDATE users SET credit_cycle_started_at = credit_reset_at - interval '30 days'
WHERE tier = 'free' AND credit_cycle_started_at IS NULL AND credit_reset_at IS NOT NULL;

-- Current plan balance establishes a conservative consumption floor. Never
-- reinterpret total spending (which also includes purchased/earned sources).
-- Where a cycle start is known, reconcile monthly debit sources and their
-- recorded actual refunds. Older paid periods without a start are not guessed.
WITH debit_sources AS MATERIALIZED (
  SELECT d.*, CASE WHEN description IS JSON OBJECT THEN description::jsonb ELSE '{}'::jsonb END AS sources
  FROM credit_ledger d WHERE amount < 0
), monthly_spending AS (
  SELECT u.id, coalesce(sum(
    (d.sources ->> 'monthly')::integer - coalesce(
      greatest(0, r.amount - coalesce((d.sources ->> 'purchased')::integer, 0)
        - coalesce((d.sources ->> 'reward')::integer, 0)), 0)
  ), 0) AS consumed
  FROM users u JOIN debit_sources d ON d.user_id = u.id
  LEFT JOIN credit_ledger r ON r.user_id = u.id AND r.transaction_type = 'VALIDATION_REFUND'
    AND r.description = 'Job: ' || (d.sources ->> 'entityId')
  WHERE u.monthly_credits_used_this_cycle IS NULL AND u.credit_cycle_started_at IS NOT NULL
    AND d.amount < 0 AND d.created_at >= u.credit_cycle_started_at
    AND (d.sources ->> 'monthly') ~ '^[0-9]{1,9}$'
    AND coalesce(d.sources ->> 'purchased', '0') ~ '^[0-9]{1,9}$'
    AND coalesce(d.sources ->> 'reward', '0') ~ '^[0-9]{1,9}$'
  GROUP BY u.id
)
UPDATE users u SET monthly_credits_used_this_cycle = greatest(0,
  CASE u.tier WHEN 'free' THEN 100 WHEN 'premium' THEN 1500 ELSE 4500 END - u.credit_balance,
  coalesce((SELECT consumed FROM monthly_spending WHERE id = u.id), 0))
WHERE u.monthly_credits_used_this_cycle IS NULL;

ALTER TABLE users ALTER COLUMN monthly_credits_used_this_cycle SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN monthly_credits_used_this_cycle SET NOT NULL;
