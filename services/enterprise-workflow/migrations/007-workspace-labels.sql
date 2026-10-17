BEGIN;
ALTER TABLE enterprise_workflow.teams ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '' CHECK(length(name)<=120);
INSERT INTO enterprise_workflow.schema_version VALUES(7) ON CONFLICT DO NOTHING;
COMMIT;
