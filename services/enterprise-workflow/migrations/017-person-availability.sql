BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.person_availability_versions (
 enterprise_id uuid NOT NULL, team_id uuid NOT NULL, target_subject text NOT NULL,
 revision integer NOT NULL CHECK(revision>0), document jsonb NOT NULL,
 command_id uuid NOT NULL, fingerprint text NOT NULL, subject text NOT NULL,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,team_id,target_subject,revision), UNIQUE(enterprise_id,command_id),
 FOREIGN KEY(enterprise_id,team_id,target_subject) REFERENCES enterprise_workflow.team_members(enterprise_id,team_id,subject)
);
INSERT INTO enterprise_workflow.schema_version VALUES(17) ON CONFLICT DO NOTHING;
COMMIT;
