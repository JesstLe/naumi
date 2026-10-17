BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.source_enterprises (
 source_instance text NOT NULL, source_enterprise uuid NOT NULL, enterprise_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(source_instance,source_enterprise), UNIQUE(source_instance,source_enterprise,enterprise_id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.source_identities (
 source_instance text NOT NULL, source_enterprise uuid NOT NULL, enterprise_id uuid NOT NULL,
 source_subject text NOT NULL, subject text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, PRIMARY KEY(source_instance,source_enterprise,source_subject),
 UNIQUE(source_instance,source_enterprise,subject),
 FOREIGN KEY(source_instance,source_enterprise,enterprise_id) REFERENCES enterprise_workflow.source_enterprises(source_instance,source_enterprise,enterprise_id),
 FOREIGN KEY(enterprise_id,subject) REFERENCES enterprise_workflow.accounts(enterprise_id,subject)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.identity_binding_audit (
 id uuid PRIMARY KEY, enterprise_id uuid NOT NULL, actor text NOT NULL, operation text NOT NULL,
 detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO enterprise_workflow.schema_version VALUES(4) ON CONFLICT DO NOTHING;
COMMIT;
