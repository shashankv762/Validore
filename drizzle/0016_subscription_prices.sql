BEGIN;

SELECT pg_advisory_xact_lock(hashtext('validore-plans'));

-- Set persisted subscriptions to the published fixed prices. Preserve plan settings,
-- Stripe IDs, and history so webhook identity for existing subscriptions is retained.
UPDATE public.tier_config
SET monthly_price_cents = CASE tier WHEN 'premium' THEN 800 WHEN 'max_premium' THEN 2000 END
WHERE tier IN ('premium', 'max_premium')
  AND monthly_price_cents IS DISTINCT FROM CASE tier WHEN 'premium' THEN 800 WHEN 'max_premium' THEN 2000 END;

COMMIT;
