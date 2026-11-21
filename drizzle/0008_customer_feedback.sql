BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  idea_id uuid NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  kind text NOT NULL, content text NOT NULL, source_label text NOT NULL, source_url text,
  occurred_at text, rating text, sentiment text, provenance text NOT NULL,
  fetched_at timestamptz, content_hash text NOT NULL, request_id text NOT NULL, notice_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  CONSTRAINT customer_feedback_kind_check CHECK (kind IN ('review','interview','support','survey','problem','idea')),
  CONSTRAINT customer_feedback_sentiment_check CHECK (sentiment IS NULL OR sentiment IN ('positive','negative','mixed','neutral','unknown')),
  CONSTRAINT customer_feedback_provenance_check CHECK (provenance IN ('owner_recorded','public_review_markup','public_review_feed')),
  CONSTRAINT customer_feedback_content_size CHECK (octet_length(content) <= 16000 AND char_length(content) BETWEEN 3 AND 3000)
);
ALTER TABLE public.customer_feedback ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='customer_feedback' AND column_name='occurred_at' AND data_type='timestamp with time zone') THEN
    ALTER TABLE public.customer_feedback ALTER COLUMN occurred_at TYPE text USING to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  END IF;
END $$;
DROP INDEX IF EXISTS public.customer_feedback_content_uidx;
CREATE UNIQUE INDEX customer_feedback_content_uidx ON public.customer_feedback(idea_id,user_id,content_hash) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_feedback_request_uidx ON public.customer_feedback(idea_id,user_id,request_id);
CREATE INDEX IF NOT EXISTS customer_feedback_owner_idx ON public.customer_feedback(user_id,idea_id,created_at);
-- Reruns widen only this source-kind check; existing records remain unchanged.
ALTER TABLE public.customer_feedback DROP CONSTRAINT IF EXISTS customer_feedback_provenance_check;
ALTER TABLE public.customer_feedback ADD CONSTRAINT customer_feedback_provenance_check
  CHECK (provenance IN ('owner_recorded','public_review_markup','public_review_feed'));

CREATE TABLE IF NOT EXISTS public.customer_feedback_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  idea_id uuid NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE, source_digest text NOT NULL,
  method_version text NOT NULL, idea_fingerprint text NOT NULL DEFAULT '', analysis jsonb NOT NULL, analyzed_records integer NOT NULL, total_records integer NOT NULL,
  provider text NOT NULL, tokens_used integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_feedback_analysis_count_check CHECK (analyzed_records > 0 AND analyzed_records <= 40 AND total_records >= analyzed_records),
  CONSTRAINT customer_feedback_analysis_size CHECK (octet_length(analysis::text) <= 96000)
);
ALTER TABLE public.customer_feedback_analyses ADD COLUMN IF NOT EXISTS idea_fingerprint text NOT NULL DEFAULT '';
DROP INDEX IF EXISTS public.customer_feedback_analysis_snapshot_uidx;
CREATE UNIQUE INDEX customer_feedback_analysis_snapshot_uidx ON public.customer_feedback_analyses(user_id,idea_id,source_digest,method_version,idea_fingerprint);
CREATE INDEX IF NOT EXISTS customer_feedback_analysis_owner_idx ON public.customer_feedback_analyses(user_id,idea_id,created_at);
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_feedback_analyses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_feedback, public.customer_feedback_analyses FROM anon, authenticated;

COMMIT;
