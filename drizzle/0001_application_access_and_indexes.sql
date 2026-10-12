-- Apply AFTER the base schema and 0000_credit_payment_idempotency.sql.
-- Data access goes through authenticated Next.js APIs using a server DB role.
-- Browser Supabase clients use Auth only; direct Data API table access is denied.
-- The server DB role must own these tables or have a reviewed server-role RLS policy.
BEGIN;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founding_member_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lean_canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crowdfunding_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pitch_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users, public.tier_config, public.founding_member_counter,
  public.ideas, public.validation_jobs, public.validation_reports, public.lean_canvases,
  public.crowdfunding_analyses, public.pricing_simulations, public.pitch_decks,
  public.credit_purchases, public.synthetic_campaigns, public.credit_ledger, public.user_devices
  FROM PUBLIC, anon, authenticated;
-- These unique indexes fail if historical duplicates need reconciliation.
CREATE UNIQUE INDEX IF NOT EXISTS validation_reports_job_uidx ON public.validation_reports (job_id);
CREATE UNIQUE INDEX IF NOT EXISTS validation_reports_share_uidx ON public.validation_reports (share_token);
CREATE INDEX IF NOT EXISTS ideas_user_created_idx ON public.ideas (user_id, created_at);
CREATE INDEX IF NOT EXISTS validation_jobs_user_status_idx ON public.validation_jobs (user_id, status, created_at);
CREATE INDEX IF NOT EXISTS validation_jobs_idea_status_idx ON public.validation_jobs (idea_id, status);
CREATE INDEX IF NOT EXISTS validation_reports_user_created_idx ON public.validation_reports (user_id, created_at);
CREATE INDEX IF NOT EXISTS validation_reports_idea_idx ON public.validation_reports (idea_id);
CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx ON public.credit_ledger (user_id, created_at);
COMMIT;
