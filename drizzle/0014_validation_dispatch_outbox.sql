BEGIN;
ALTER TABLE public.validation_jobs ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE public.validation_jobs ADD COLUMN IF NOT EXISTS dispatch_lease_expires_at timestamptz;
COMMIT;
