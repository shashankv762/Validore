-- Optional founder-authored public research topic. Existing private idea fields
-- never populate this field; NULL keeps the generic public research behavior.
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS public_research_focus text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_public_research_focus_length' AND conrelid = 'ideas'::regclass) THEN
    ALTER TABLE ideas ADD CONSTRAINT ideas_public_research_focus_length
      CHECK (public_research_focus IS NULL OR char_length(public_research_focus) <= 280) NOT VALID;
  END IF;
END $$;
ALTER TABLE ideas VALIDATE CONSTRAINT ideas_public_research_focus_length;
