-- Review and apply after 0002. This is additive; existing customer data is kept.
-- The application uses a private server DB connection, not browser Data API access.
BEGIN;
CREATE TABLE IF NOT EXISTS public.founder_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  idea_id uuid NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  idea_fingerprint text NOT NULL,
  notice_version text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT founder_interviews_state_size CHECK (octet_length(state::text) <= 256000)
);
CREATE UNIQUE INDEX IF NOT EXISTS founder_interviews_idea_uidx ON public.founder_interviews(idea_id);
CREATE INDEX IF NOT EXISTS founder_interviews_user_idx ON public.founder_interviews(user_id, updated_at);

CREATE TABLE IF NOT EXISTS public.research_sources (
  id text PRIMARY KEY,
  url_hash text NOT NULL,
  source jsonb NOT NULL,
  search_text text NOT NULL,
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_sources_time_order CHECK (expires_at > fetched_at),
  CONSTRAINT research_sources_excerpt_size CHECK (octet_length(source::text) <= 24000 AND octet_length(search_text) <= 16000)
);
CREATE INDEX IF NOT EXISTS research_sources_expiry_idx ON public.research_sources(expires_at);
CREATE INDEX IF NOT EXISTS research_sources_url_idx ON public.research_sources(url_hash, fetched_at);
CREATE INDEX IF NOT EXISTS research_sources_search_idx ON public.research_sources USING gin(to_tsvector('english', search_text));

ALTER TABLE public.founder_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.founder_interviews, public.research_sources FROM PUBLIC, anon, authenticated;
-- Deliberately no anon/authenticated policies: owner checks happen in the API.
COMMIT;
