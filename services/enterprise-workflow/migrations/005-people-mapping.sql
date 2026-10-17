BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.person_directory_admins (
 enterprise_id uuid NOT NULL, subject text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY(enterprise_id,subject), FOREIGN KEY(enterprise_id,subject) REFERENCES enterprise_workflow.accounts(enterprise_id,subject)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.person_profiles (
 enterprise_id uuid NOT NULL, person_id uuid NOT NULL, real_name text NOT NULL, nickname text NOT NULL DEFAULT '',
 source_instance text, source_enterprise uuid, source_subject text, enabled boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, PRIMARY KEY(enterprise_id,person_id),
 CHECK((source_instance IS NULL AND source_enterprise IS NULL AND source_subject IS NULL) OR (source_instance IS NOT NULL AND source_enterprise IS NOT NULL AND source_subject IS NOT NULL)),
 UNIQUE(enterprise_id,source_instance,source_enterprise,source_subject)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.import_person_links (
 enterprise_id uuid NOT NULL, source_hash text NOT NULL, row_number integer NOT NULL, field text NOT NULL CHECK(field IN ('设计师','需求方')),
 source_name text NOT NULL, person_id uuid, version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(enterprise_id,source_hash,row_number,field),
 FOREIGN KEY(enterprise_id,source_hash,row_number) REFERENCES enterprise_workflow.import_rows(enterprise_id,source_hash,row_number),
 FOREIGN KEY(enterprise_id,person_id) REFERENCES enterprise_workflow.person_profiles(enterprise_id,person_id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.people_commands (
 enterprise_id uuid NOT NULL, command_id uuid NOT NULL, fingerprint text NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(enterprise_id,command_id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.people_audit (
 enterprise_id uuid NOT NULL, command_id uuid NOT NULL, subject text NOT NULL, operation text NOT NULL,
 detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(enterprise_id,command_id)
);
INSERT INTO enterprise_workflow.schema_version VALUES(5) ON CONFLICT DO NOTHING;
COMMIT;
