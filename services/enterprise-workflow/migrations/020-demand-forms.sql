BEGIN;
CREATE TABLE enterprise_workflow.form_templates(enterprise_id uuid NOT NULL,team_id uuid NOT NULL,id uuid NOT NULL,version integer NOT NULL CHECK(version>0),document jsonb NOT NULL,PRIMARY KEY(enterprise_id,team_id,id),FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id));
CREATE TABLE enterprise_workflow.form_commands(enterprise_id uuid NOT NULL,id uuid NOT NULL,team_id uuid NOT NULL,template_id uuid NOT NULL,actor text NOT NULL,reason text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id));
CREATE TABLE enterprise_workflow.form_revisions(enterprise_id uuid NOT NULL,team_id uuid NOT NULL,id uuid NOT NULL,revision integer NOT NULL,document jsonb NOT NULL,command_id uuid NOT NULL,PRIMARY KEY(enterprise_id,team_id,id,revision),FOREIGN KEY(enterprise_id,team_id,id) REFERENCES enterprise_workflow.form_templates(enterprise_id,team_id,id),FOREIGN KEY(enterprise_id,command_id) REFERENCES enterprise_workflow.form_commands(enterprise_id,id));
ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN catalog_enabled boolean NOT NULL DEFAULT false;
UPDATE enterprise_workflow.runtime_installation SET catalog_enabled=(minimum_reader>=19);
INSERT INTO enterprise_workflow.schema_version VALUES(20);
COMMIT;
