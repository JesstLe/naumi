BEGIN;
-- Full Office callbacks may preserve large source workbooks. Generic worksheet uploads remain capped at 4MiB in application code.
ALTER TABLE enterprise_workflow.source_worksheet_files DROP CONSTRAINT source_worksheet_files_bytes_check;
ALTER TABLE enterprise_workflow.source_worksheet_files ADD CONSTRAINT source_worksheet_files_bytes_check CHECK(bytes>0 AND bytes<=67108864);
INSERT INTO enterprise_workflow.schema_version VALUES(38);
COMMIT;
