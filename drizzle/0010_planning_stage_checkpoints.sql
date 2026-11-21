BEGIN;

ALTER TABLE public.planning_module_requests ADD COLUMN IF NOT EXISTS stage_data jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_module_requests_stage_size' AND conrelid = 'public.planning_module_requests'::regclass) THEN
    ALTER TABLE public.planning_module_requests ADD CONSTRAINT planning_module_requests_stage_size
      CHECK (stage_data IS NULL OR octet_length(stage_data::text) <= 512000);
  END IF;
END $$;

COMMIT;
