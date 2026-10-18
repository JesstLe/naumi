BEGIN;
ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN capacity_enabled boolean NOT NULL DEFAULT false;
CREATE INDEX orders_task_people ON enterprise_workflow.orders USING gin((document->'tasks') jsonb_path_ops);
CREATE TABLE enterprise_workflow.person_capacity(
 enterprise_id uuid NOT NULL,subject text NOT NULL,version integer NOT NULL CHECK(version>0),document jsonb NOT NULL,
 PRIMARY KEY(enterprise_id,subject),FOREIGN KEY(enterprise_id,subject) REFERENCES enterprise_workflow.accounts(enterprise_id,subject)
);
CREATE TABLE enterprise_workflow.capacity_commands(enterprise_id uuid NOT NULL,id uuid NOT NULL,subject text NOT NULL,target_subject text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id));
CREATE TABLE enterprise_workflow.capacity_revisions(enterprise_id uuid NOT NULL,target_subject text NOT NULL,revision integer NOT NULL,command_id uuid NOT NULL,actor text NOT NULL,reason text NOT NULL,document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,target_subject,revision),FOREIGN KEY(enterprise_id,command_id) REFERENCES enterprise_workflow.capacity_commands(enterprise_id,id));
INSERT INTO enterprise_workflow.schema_version VALUES(26);
COMMIT;
