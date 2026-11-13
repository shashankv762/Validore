-- Additive owner controls. Apply to staging before the application rollout.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_cycle_allowance integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_account_status_valid' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE users ADD CONSTRAINT users_account_status_valid CHECK (account_status IN ('active', 'blocked', 'deactivated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_owner_active' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE users ADD CONSTRAINT users_owner_active CHECK (NOT is_admin OR account_status = 'active');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_credit_cycle_allowance_nonnegative' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE users ADD CONSTRAINT users_credit_cycle_allowance_nonnegative CHECK (credit_cycle_allowance IS NULL OR credit_cycle_allowance >= 0);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_single_owner_idx ON users (is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS users_status_created_idx ON users (account_status, created_at);

ALTER TABLE tier_config ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE tier_config ADD COLUMN IF NOT EXISTS monthly_price_cents integer;
ALTER TABLE tier_config ADD COLUMN IF NOT EXISTS monthly_credits integer;
ALTER TABLE tier_config ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE tier_config ADD COLUMN IF NOT EXISTS stripe_price_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tier_config ADD COLUMN IF NOT EXISTS benefits jsonb;
ALTER TABLE tier_config ADD COLUMN IF NOT EXISTS advertised boolean;
-- PDF was already available to Free workspaces before this switch was enforced.
-- A saved admin plan has a non-null price; reapplying this delta preserves it.
UPDATE tier_config SET can_export_pdf = true WHERE tier = 'free' AND monthly_price_cents IS NULL;

CREATE TABLE IF NOT EXISTS platform_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  announcement text,
  announcement_enabled boolean NOT NULL DEFAULT false,
  maintenance_enabled boolean NOT NULL DEFAULT false,
  maintenance_message text,
  signup_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_email text,
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_audit_request_target_idx ON admin_audit_log (request_id, coalesce(target_user_id::text, ''));
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_log (created_at);
CREATE INDEX IF NOT EXISTS admin_audit_target_created_idx ON admin_audit_log (target_user_id, created_at);
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_settings, admin_audit_log FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON platform_settings, admin_audit_log FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON platform_settings, admin_audit_log FROM authenticated;
  END IF;
END $$;
