BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_execution_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lease_kind text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_execution_leases_kind_check CHECK (lease_kind IN ('customer-feedback-analysis'))
);
CREATE INDEX IF NOT EXISTS ai_execution_leases_expiry_idx ON public.ai_execution_leases(expires_at);
ALTER TABLE public.ai_execution_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_execution_leases FROM anon, authenticated;

COMMIT;
