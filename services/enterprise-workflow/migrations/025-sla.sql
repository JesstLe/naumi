BEGIN;
ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN sla_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE enterprise_workflow.notifications ADD COLUMN reminder jsonb;
CREATE TABLE enterprise_workflow.sla_policies(
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),enabled boolean NOT NULL,document jsonb NOT NULL,
 scan_order uuid,scan_clock text NOT NULL DEFAULT '',next_scan_at timestamptz NOT NULL DEFAULT now(),last_scan_at timestamptz,last_error text,scan_seq bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(enterprise_id,team_id),FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id)
);
CREATE INDEX sla_due ON enterprise_workflow.sla_policies(next_scan_at,enterprise_id,team_id) WHERE enabled;
CREATE SEQUENCE enterprise_workflow.sla_scan_seq;
CREATE TABLE enterprise_workflow.sla_commands(enterprise_id uuid NOT NULL,id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id));
CREATE TABLE enterprise_workflow.sla_policy_revisions(enterprise_id uuid NOT NULL,team_id uuid NOT NULL,revision integer NOT NULL,command_id uuid NOT NULL,actor text NOT NULL,reason text NOT NULL,document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,team_id,revision),FOREIGN KEY(enterprise_id,command_id) REFERENCES enterprise_workflow.sla_commands(enterprise_id,id));
CREATE TABLE enterprise_workflow.sla_occurrences(
 id text PRIMARY KEY,enterprise_id uuid NOT NULL,team_id uuid NOT NULL,order_id uuid NOT NULL,task_id uuid,clock_key text NOT NULL,stage integer NOT NULL CHECK(stage BETWEEN 0 AND 2),policy_version integer NOT NULL,
 document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(enterprise_id,team_id,clock_key,stage),FOREIGN KEY(enterprise_id,order_id) REFERENCES enterprise_workflow.orders(enterprise_id,id)
);
CREATE INDEX sla_occurrences_team ON enterprise_workflow.sla_occurrences(enterprise_id,team_id,created_at DESC,id);
INSERT INTO enterprise_workflow.schema_version VALUES(25);
COMMIT;
