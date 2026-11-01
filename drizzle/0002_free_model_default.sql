-- Apply after the existing application schema is present.
-- Changes only the default for future accounts; preserves existing preferences.
ALTER TABLE public.users ALTER COLUMN preferred_ai_provider SET DEFAULT 'free_models';
