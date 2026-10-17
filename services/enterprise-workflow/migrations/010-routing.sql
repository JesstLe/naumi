BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.routing_connections (
 enterprise_id uuid NOT NULL,source_team uuid NOT NULL,target_team uuid NOT NULL,version integer NOT NULL CHECK(version>0),enabled boolean NOT NULL,actor text NOT NULL,reason text NOT NULL,
 PRIMARY KEY(enterprise_id,source_team,target_team),FOREIGN KEY(enterprise_id,source_team) REFERENCES enterprise_workflow.teams(enterprise_id,team_id),FOREIGN KEY(enterprise_id,target_team) REFERENCES enterprise_workflow.teams(enterprise_id,team_id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.routing_books (
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),document jsonb NOT NULL,
 PRIMARY KEY(enterprise_id,team_id),FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id),CHECK(((document->>'version')::integer=version) IS TRUE)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.routing_versions (
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,revision integer NOT NULL,document jsonb NOT NULL,PRIMARY KEY(enterprise_id,team_id,revision)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.routing_commands (
 enterprise_id uuid NOT NULL,id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(enterprise_id,id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.routing_audit (
 seq bigserial PRIMARY KEY,enterprise_id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,operation text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS routing_audit_team ON enterprise_workflow.routing_audit(enterprise_id,team_id,seq DESC);
CREATE INDEX IF NOT EXISTS workflow_order_request_team ON enterprise_workflow.orders(enterprise_id,(document->>'requestTeamId'),updated_at DESC);
INSERT INTO enterprise_workflow.schema_version VALUES(10) ON CONFLICT DO NOTHING;
COMMIT;
