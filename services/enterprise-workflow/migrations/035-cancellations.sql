BEGIN;
ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN cancellations_enabled boolean NOT NULL DEFAULT false;
INSERT INTO enterprise_workflow.schema_version VALUES(35);
COMMIT;
