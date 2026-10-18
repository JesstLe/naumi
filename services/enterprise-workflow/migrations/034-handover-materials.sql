BEGIN;
ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN handover_packages_enabled boolean NOT NULL DEFAULT false;
INSERT INTO enterprise_workflow.schema_version VALUES(34);
COMMIT;
