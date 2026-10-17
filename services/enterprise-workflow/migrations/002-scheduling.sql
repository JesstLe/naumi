-- Additive. Explicitly provision in an independent enterprise database; no automatic startup DDL.
BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.accounts (
  enterprise_id uuid NOT NULL, subject text NOT NULL, enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz, PRIMARY KEY(enterprise_id,subject)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.teams (
  enterprise_id uuid NOT NULL, team_id uuid NOT NULL, enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY(enterprise_id,team_id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.team_members (
  enterprise_id uuid NOT NULL, team_id uuid NOT NULL, subject text NOT NULL,
  enabled boolean NOT NULL DEFAULT true, expires_at timestamptz,
  permissions jsonb NOT NULL CHECK(jsonb_typeof(permissions)='array'),
  work_kinds jsonb NOT NULL CHECK(jsonb_typeof(work_kinds)='array'),
  PRIMARY KEY(enterprise_id,team_id,subject),
  FOREIGN KEY(enterprise_id,subject) REFERENCES enterprise_workflow.accounts(enterprise_id,subject),
  FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.schedule_workbooks (
  enterprise_id uuid NOT NULL, team_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
  document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(enterprise_id,team_id),
  FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id),
  CHECK(((document->>'version')::integer=version) IS TRUE), CHECK((document->>'schema'='3') IS TRUE)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.schedule_personal (
  enterprise_id uuid NOT NULL, team_id uuid NOT NULL, subject text NOT NULL, view_id text NOT NULL,
  version integer NOT NULL CHECK(version>0), document jsonb NOT NULL,
  PRIMARY KEY(enterprise_id,team_id,subject,view_id),
  FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.schedule_workbooks(enterprise_id,team_id),
  CHECK(((document->>'version')::integer=version) IS TRUE)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.schedule_commands (
  enterprise_id uuid NOT NULL, id uuid NOT NULL, team_id uuid NOT NULL, subject text NOT NULL,
  fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(enterprise_id,id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.schedule_audit (
  enterprise_id uuid NOT NULL, id uuid NOT NULL, team_id uuid NOT NULL, subject text NOT NULL,
  operation text NOT NULL, scope text NOT NULL CHECK(scope IN ('team','personal')),
  revision integer NOT NULL, detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(enterprise_id,id)
);
CREATE INDEX IF NOT EXISTS schedule_audit_team ON enterprise_workflow.schedule_audit(enterprise_id,team_id,created_at);
INSERT INTO enterprise_workflow.schema_version VALUES(2) ON CONFLICT DO NOTHING;
COMMIT;
