BEGIN;
CREATE TABLE enterprise_workflow.import_person_link_members (
 enterprise_id uuid NOT NULL, source_hash text NOT NULL, row_number integer NOT NULL,
 field text NOT NULL, person_id uuid NOT NULL, position smallint NOT NULL CHECK(position BETWEEN 1 AND 20),
 PRIMARY KEY(enterprise_id,source_hash,row_number,field,person_id),
 UNIQUE(enterprise_id,source_hash,row_number,field,position),
 FOREIGN KEY(enterprise_id,source_hash,row_number,field)
  REFERENCES enterprise_workflow.import_person_links(enterprise_id,source_hash,row_number,field) ON DELETE CASCADE,
 FOREIGN KEY(enterprise_id,person_id) REFERENCES enterprise_workflow.person_profiles(enterprise_id,person_id)
);
CREATE INDEX import_person_link_members_person ON enterprise_workflow.import_person_link_members(enterprise_id,person_id);
INSERT INTO enterprise_workflow.import_person_link_members(enterprise_id,source_hash,row_number,field,person_id,position)
 SELECT enterprise_id,source_hash,row_number,field,person_id,1 FROM enterprise_workflow.import_person_links WHERE person_id IS NOT NULL;
CREATE FUNCTION enterprise_workflow.guard_multi_person_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('enterprise_workflow.multi_person_write',true) IS DISTINCT FROM 'on'
 AND (SELECT count(*) FROM enterprise_workflow.import_person_link_members m
  WHERE m.enterprise_id=OLD.enterprise_id AND m.source_hash=OLD.source_hash AND m.row_number=OLD.row_number AND m.field=OLD.field)>1
 THEN RAISE EXCEPTION 'MULTI_PERSON_REQUIRES_EXPLICIT_MEMBERS'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_multi_person_head BEFORE UPDATE OR DELETE ON enterprise_workflow.import_person_links
 FOR EACH ROW EXECUTE FUNCTION enterprise_workflow.guard_multi_person_head();
CREATE FUNCTION enterprise_workflow.sync_legacy_person_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('enterprise_workflow.multi_person_write',true) IS DISTINCT FROM 'on' THEN
  DELETE FROM enterprise_workflow.import_person_link_members WHERE enterprise_id=NEW.enterprise_id
   AND source_hash=NEW.source_hash AND row_number=NEW.row_number AND field=NEW.field;
  IF NEW.person_id IS NOT NULL THEN
   INSERT INTO enterprise_workflow.import_person_link_members(enterprise_id,source_hash,row_number,field,person_id,position)
    VALUES(NEW.enterprise_id,NEW.source_hash,NEW.row_number,NEW.field,NEW.person_id,1);
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_legacy_person_member AFTER INSERT OR UPDATE ON enterprise_workflow.import_person_links
 FOR EACH ROW EXECUTE FUNCTION enterprise_workflow.sync_legacy_person_member();
UPDATE enterprise_workflow.runtime_installation SET minimum_reader=greatest(minimum_reader,39),minimum_writer=greatest(minimum_writer,39);
INSERT INTO enterprise_workflow.schema_version VALUES(39);
COMMIT;
