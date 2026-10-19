BEGIN;
-- New task commitment semantics require explicit activation and reader/writer floor33.
ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN changes_enabled boolean NOT NULL DEFAULT false;
INSERT INTO enterprise_workflow.schema_version VALUES(33);
COMMIT;
