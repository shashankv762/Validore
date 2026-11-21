BEGIN;
ALTER TABLE public.planning_module_requests ADD COLUMN IF NOT EXISTS context_snapshot jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_module_requests_context_size' AND conrelid = 'public.planning_module_requests'::regclass) THEN
    ALTER TABLE public.planning_module_requests ADD CONSTRAINT planning_module_requests_context_size
      CHECK (context_snapshot IS NULL OR octet_length(context_snapshot::text) <= 256000);
  END IF;
END $$;
COMMIT;
