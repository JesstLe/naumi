BEGIN;
CREATE TABLE enterprise_workflow.performance_appeals(
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,id uuid NOT NULL,period_id uuid NOT NULL,fact_id text NOT NULL,subject text NOT NULL,
 version integer NOT NULL CHECK(version>0),status text NOT NULL CHECK(status IN ('submitted','in_review','resolved','withdrawn')),document jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,team_id,period_id) REFERENCES enterprise_workflow.performance_periods(enterprise_id,team_id,id),
 CHECK((document->>'version')::integer=version),CHECK(document->>'status'=status)
);
CREATE UNIQUE INDEX performance_appeal_open ON enterprise_workflow.performance_appeals(enterprise_id,team_id,period_id,fact_id,subject) WHERE status IN ('submitted','in_review');
CREATE INDEX performance_appeal_list ON enterprise_workflow.performance_appeals(enterprise_id,team_id,period_id,updated_at DESC,id);
CREATE TABLE enterprise_workflow.appeal_commands(enterprise_id uuid NOT NULL,id uuid NOT NULL,team_id uuid NOT NULL,appeal_id uuid NOT NULL,subject text NOT NULL,fingerprint text NOT NULL,applied_version integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id));
CREATE TABLE enterprise_workflow.appeal_revisions(enterprise_id uuid NOT NULL,appeal_id uuid NOT NULL,revision integer NOT NULL,command_id uuid NOT NULL,actor text NOT NULL,action text NOT NULL,reason text NOT NULL,document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,appeal_id,revision),FOREIGN KEY(enterprise_id,appeal_id) REFERENCES enterprise_workflow.performance_appeals(enterprise_id,id),FOREIGN KEY(enterprise_id,command_id) REFERENCES enterprise_workflow.appeal_commands(enterprise_id,id));
INSERT INTO enterprise_workflow.schema_version VALUES(27);
COMMIT;
