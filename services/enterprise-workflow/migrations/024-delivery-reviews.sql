BEGIN;
ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN reviews_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN demand_assets_enabled boolean NOT NULL DEFAULT false;
UPDATE enterprise_workflow.runtime_installation SET demand_assets_enabled=(minimum_reader>=22);
CREATE TABLE enterprise_workflow.delivery_reviews(
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,id uuid NOT NULL,order_id uuid NOT NULL,task_id uuid NOT NULL,submission_id text NOT NULL,
 version integer NOT NULL CHECK(version>0),document jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,submission_id),
 FOREIGN KEY(enterprise_id,order_id) REFERENCES enterprise_workflow.orders(enterprise_id,id),
 FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id)
);
CREATE INDEX delivery_reviews_task ON enterprise_workflow.delivery_reviews(enterprise_id,order_id,task_id,updated_at DESC);
CREATE TABLE enterprise_workflow.delivery_review_commands(enterprise_id uuid NOT NULL,id uuid NOT NULL,review_id uuid NOT NULL,subject text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id));
CREATE TABLE enterprise_workflow.delivery_review_revisions(enterprise_id uuid NOT NULL,review_id uuid NOT NULL,revision integer NOT NULL,command_id uuid NOT NULL,actor text NOT NULL,reason text NOT NULL,action text NOT NULL,document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,review_id,revision),FOREIGN KEY(enterprise_id,review_id) REFERENCES enterprise_workflow.delivery_reviews(enterprise_id,id),FOREIGN KEY(enterprise_id,command_id) REFERENCES enterprise_workflow.delivery_review_commands(enterprise_id,id));
INSERT INTO enterprise_workflow.schema_version VALUES(24);
COMMIT;
