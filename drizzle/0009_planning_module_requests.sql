BEGIN;

CREATE TABLE IF NOT EXISTS public.planning_module_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  idea_id uuid NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  request_key uuid NOT NULL, module text NOT NULL,
  payload_hash text NOT NULL, idea_fingerprint text NOT NULL,
  status text NOT NULL, lease_token uuid NOT NULL, lease_expires_at timestamptz NOT NULL,
  result_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_module_requests_module_check CHECK (module IN ('lean-canvas','pitch-deck','crowdfunding','pricing')),
  CONSTRAINT planning_module_requests_status_check CHECK (status IN ('pending','completed','failed')),
  CONSTRAINT planning_module_requests_result_check CHECK ((status = 'completed' AND result_id IS NOT NULL) OR (status <> 'completed' AND result_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS planning_module_requests_key_uidx ON public.planning_module_requests(user_id, request_key);
CREATE INDEX IF NOT EXISTS planning_module_requests_pending_idx ON public.planning_module_requests(status, lease_expires_at);
ALTER TABLE public.planning_module_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planning_module_requests FROM anon, authenticated;

COMMIT;
