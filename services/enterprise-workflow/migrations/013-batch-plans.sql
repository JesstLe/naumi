BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.batch_plans (
 enterprise_id uuid NOT NULL, id uuid NOT NULL, team_id uuid NOT NULL, subject text NOT NULL,
 identity_hash text NOT NULL, input_hash text NOT NULL, plan_hash text NOT NULL, document jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, close_reason text,
 PRIMARY KEY(enterprise_id,id),
 CHECK((document->>'batchId'=id::text) IS TRUE),
 CHECK((closed_at IS NULL)=(close_reason IS NULL))
);
CREATE INDEX IF NOT EXISTS batch_plans_owner ON enterprise_workflow.batch_plans(enterprise_id,team_id,subject,created_at DESC,id);
INSERT INTO enterprise_workflow.schema_version VALUES(13) ON CONFLICT DO NOTHING;
COMMIT;
