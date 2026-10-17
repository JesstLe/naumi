BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.runtime_installation (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),installation_id text NOT NULL,
 minimum_reader integer NOT NULL,minimum_writer integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.runtime_migrations (
 version integer PRIMARY KEY,sha256 text NOT NULL CHECK(length(sha256)=64),provenance text NOT NULL CHECK(provenance IN ('executed','adopted-baseline')),installed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.runtime_migration_runs (
 plan_hash text PRIMARY KEY,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.runtime_provision_commands (
 command_id uuid PRIMARY KEY,fingerprint text NOT NULL,plan_hash text NOT NULL,result jsonb NOT NULL,reason text NOT NULL,database_actor text NOT NULL DEFAULT current_user,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO enterprise_workflow.schema_version VALUES(12) ON CONFLICT DO NOTHING;
COMMIT;
