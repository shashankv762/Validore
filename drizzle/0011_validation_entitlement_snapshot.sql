-- Additive and rerunnable. Legacy jobs retain their existing runner behavior.
ALTER TABLE validation_jobs ADD COLUMN IF NOT EXISTS entitlement_snapshot jsonb;
