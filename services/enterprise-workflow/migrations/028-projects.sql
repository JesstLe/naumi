BEGIN;
CREATE TABLE enterprise_workflow.projects(enterprise_id uuid NOT NULL,id uuid NOT NULL,team_id uuid NOT NULL,code text NOT NULL,version integer NOT NULL CHECK(version>0),document jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,code),FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id),CHECK((document->>'version')::integer=version));
CREATE INDEX projects_team ON enterprise_workflow.projects(enterprise_id,team_id,updated_at DESC,id);
CREATE INDEX projects_grants ON enterprise_workflow.projects USING gin ((document->'grants') jsonb_path_ops);
CREATE TABLE enterprise_workflow.project_commands(enterprise_id uuid NOT NULL,id uuid NOT NULL,project_id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,fingerprint text NOT NULL,applied_version integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id));
CREATE TABLE enterprise_workflow.project_revisions(enterprise_id uuid NOT NULL,project_id uuid NOT NULL,revision integer NOT NULL,command_id uuid NOT NULL,actor text NOT NULL,action text NOT NULL,reason text NOT NULL,document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,project_id,revision),FOREIGN KEY(enterprise_id,project_id) REFERENCES enterprise_workflow.projects(enterprise_id,id),FOREIGN KEY(enterprise_id,command_id) REFERENCES enterprise_workflow.project_commands(enterprise_id,id));
INSERT INTO enterprise_workflow.schema_version VALUES(28);
COMMIT;
