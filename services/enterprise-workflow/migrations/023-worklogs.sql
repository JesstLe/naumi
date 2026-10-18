BEGIN;
CREATE TABLE enterprise_workflow.worklogs(
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,id uuid NOT NULL,subject text NOT NULL,order_id uuid NOT NULL,task_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),document jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id),FOREIGN KEY(enterprise_id,order_id) REFERENCES enterprise_workflow.orders(enterprise_id,id)
);
CREATE INDEX worklogs_person ON enterprise_workflow.worklogs(enterprise_id,subject);
CREATE INDEX worklogs_person_day ON enterprise_workflow.worklogs(enterprise_id,subject,((document->'values')->>'workDate'));
CREATE INDEX worklogs_team ON enterprise_workflow.worklogs(enterprise_id,team_id,updated_at DESC);
CREATE TABLE enterprise_workflow.worklog_commands(enterprise_id uuid NOT NULL,id uuid NOT NULL,team_id uuid NOT NULL,log_id uuid NOT NULL,subject text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id));
CREATE TABLE enterprise_workflow.worklog_revisions(enterprise_id uuid NOT NULL,log_id uuid NOT NULL,revision integer NOT NULL,command_id uuid NOT NULL,actor text NOT NULL,reason text NOT NULL,action text NOT NULL,document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,log_id,revision),FOREIGN KEY(enterprise_id,log_id) REFERENCES enterprise_workflow.worklogs(enterprise_id,id),FOREIGN KEY(enterprise_id,command_id) REFERENCES enterprise_workflow.worklog_commands(enterprise_id,id));
INSERT INTO enterprise_workflow.schema_version VALUES(23);
COMMIT;
