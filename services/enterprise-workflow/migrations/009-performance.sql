-- Explicit additive migration on the workflow database only; source app_* is untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.performance_allocations (
 enterprise_id uuid NOT NULL, team_id uuid NOT NULL, fact_id text NOT NULL, version integer NOT NULL CHECK(version>0), document jsonb NOT NULL,
 PRIMARY KEY(enterprise_id,team_id,fact_id), FOREIGN KEY(enterprise_id,fact_id) REFERENCES enterprise_workflow.events(enterprise_id,id),
 CHECK(((document->>'version')::integer=version) IS TRUE)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.performance_rule_drafts (
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),document jsonb NOT NULL,
 PRIMARY KEY(enterprise_id,team_id),FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id),CHECK(((document->>'version')::integer=version) IS TRUE)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.performance_rules (
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),document jsonb NOT NULL,
 PRIMARY KEY(enterprise_id,team_id,version),FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.performance_periods (
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,id uuid NOT NULL,version integer NOT NULL CHECK(version>0),document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,team_id,id),FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id),CHECK(((document->>'version')::integer=version) IS TRUE)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.performance_claims (
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,fact_id text NOT NULL,period_id uuid NOT NULL,
 PRIMARY KEY(enterprise_id,team_id,fact_id),FOREIGN KEY(enterprise_id,fact_id) REFERENCES enterprise_workflow.events(enterprise_id,id),
 FOREIGN KEY(enterprise_id,team_id,period_id) REFERENCES enterprise_workflow.performance_periods(enterprise_id,team_id,id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.performance_commands (
 enterprise_id uuid NOT NULL,id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.performance_audit (
 seq bigserial PRIMARY KEY,enterprise_id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,operation text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS performance_audit_team ON enterprise_workflow.performance_audit(enterprise_id,team_id,seq DESC);
CREATE INDEX IF NOT EXISTS performance_periods_team ON enterprise_workflow.performance_periods(enterprise_id,team_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS performance_accepted_team ON enterprise_workflow.events(enterprise_id,(event->>'teamId'),created_at) WHERE event->>'type'='workflow.task.accepted.v1';
INSERT INTO enterprise_workflow.schema_version VALUES(9) ON CONFLICT DO NOTHING;
COMMIT;
