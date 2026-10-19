BEGIN;
ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN pauses_enabled boolean NOT NULL DEFAULT false;
INSERT INTO enterprise_workflow.schema_version VALUES(36);
COMMIT;
