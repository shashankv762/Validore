-- Additive migration. Apply after 0003 and before deploying this release.
-- No customer balances or plan allocations are rewritten.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reward_credits integer NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_reward_credits_nonnegative' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_reward_credits_nonnegative CHECK (reward_credits >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.rewarded_ad_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'applixir',
  status text NOT NULL DEFAULT 'pending',
  provider_transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  rewarded_at timestamptz,
  CONSTRAINT rewarded_ads_status_check CHECK (status IN ('pending', 'cancelled', 'rewarded')),
  CONSTRAINT rewarded_ads_time_check CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS rewarded_ads_transaction_uidx ON public.rewarded_ad_sessions(provider, provider_transaction_id);
CREATE INDEX IF NOT EXISTS rewarded_ads_user_created_idx ON public.rewarded_ad_sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS rewarded_ads_rewarded_idx ON public.rewarded_ad_sessions(rewarded_at);
CREATE INDEX IF NOT EXISTS rewarded_ads_pending_idx ON public.rewarded_ad_sessions(status, expires_at);
ALTER TABLE public.rewarded_ad_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rewarded_ad_sessions FROM PUBLIC, anon, authenticated;
COMMIT;
