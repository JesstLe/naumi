\set ON_ERROR_STOP on
BEGIN;
DO $guard$
DECLARE source app_image_jobs%ROWTYPE;
BEGIN
  BEGIN
    UPDATE app_image_jobs SET updated_at=updated_at WHERE id=(SELECT id FROM app_image_jobs ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'Guard did not reject historic image task';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    RAISE NOTICE 'MODIFIED_HISTORY_MUTATION=BLOCKED';
  END;
  BEGIN
    UPDATE app_ledger SET reason=reason WHERE id=(SELECT id FROM app_ledger ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'Guard did not reject historic ledger';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    RAISE NOTICE 'MODIFIED_LEDGER_MUTATION=BLOCKED';
  END;
  SELECT * INTO source FROM app_image_jobs ORDER BY id LIMIT 1;
  INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered)
    VALUES('staging-guard-verification-fixture',source.email,'generate','{"status":"pending"}','{}',0,false);
  UPDATE app_image_jobs SET snapshot='{"status":"done"}' WHERE id='staging-guard-verification-fixture';
  DELETE FROM app_image_jobs WHERE id='staging-guard-verification-fixture';
  RAISE NOTICE 'NEW_TEST_TASK_WRITES=ALLOWED';
END $guard$;
ROLLBACK;
SELECT 'HISTORY_GUARD_VERIFICATION=PASS FIXTURE_DATA=ROLLED_BACK';
