BEGIN;
CREATE TABLE enterprise_workflow.demand_creation_batches(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,
 identity_hash text NOT NULL,fingerprint text NOT NULL,preview_hash text NOT NULL,reason text NOT NULL,
 document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id)
);
CREATE INDEX demand_creation_batches_owner ON enterprise_workflow.demand_creation_batches(enterprise_id,team_id,subject,created_at DESC);
INSERT INTO enterprise_workflow.schema_version VALUES(21);
COMMIT;
