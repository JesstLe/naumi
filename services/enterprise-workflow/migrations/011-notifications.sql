BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.notifications (
 id uuid PRIMARY KEY, enterprise_id uuid NOT NULL, team_id uuid NOT NULL, subject text NOT NULL,
 event_id text NOT NULL, order_id uuid NOT NULL, task_id uuid, action text NOT NULL, actor text NOT NULL,
 title text NOT NULL, aggregate_version integer NOT NULL, created_at timestamptz NOT NULL, read_at timestamptz,
 UNIQUE(enterprise_id,event_id,team_id,subject),
 FOREIGN KEY(enterprise_id,order_id) REFERENCES enterprise_workflow.orders(enterprise_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS notification_inbox ON enterprise_workflow.notifications(enterprise_id,team_id,subject,created_at DESC,id);
CREATE TABLE IF NOT EXISTS enterprise_workflow.notification_policies (
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,version integer NOT NULL,enabled boolean NOT NULL,connector_id text NOT NULL,
 PRIMARY KEY(enterprise_id,team_id),FOREIGN KEY(enterprise_id,team_id) REFERENCES enterprise_workflow.teams(enterprise_id,team_id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.notification_bindings (
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,version integer NOT NULL,enabled boolean NOT NULL,userid text NOT NULL,
 PRIMARY KEY(enterprise_id,team_id,subject),FOREIGN KEY(enterprise_id,team_id,subject) REFERENCES enterprise_workflow.team_members(enterprise_id,team_id,subject)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.notification_deliveries (
 id uuid PRIMARY KEY,notification_id uuid NOT NULL UNIQUE REFERENCES enterprise_workflow.notifications(id) ON DELETE CASCADE,
 enterprise_id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,version integer NOT NULL DEFAULT 1,
 connector_id text NOT NULL,connector_revision text,userid text,policy_version integer NOT NULL,binding_version integer,
 state text NOT NULL CHECK(state IN ('pending','retry','sending','accepted','polling','delivered','blocked','dead','unknown','cancelled')),
 attempts integer NOT NULL DEFAULT 0,polls integer NOT NULL DEFAULT 0,next_at timestamptz NOT NULL DEFAULT now(),
 lease_id uuid,lease_until timestamptz,receipt text,receipt_source text CHECK(receipt_source IN ('provider','manual')),accepted_at timestamptz,delivered_at timestamptz,provider_read boolean NOT NULL DEFAULT false,
 error_code text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
CREATE INDEX IF NOT EXISTS notification_due ON enterprise_workflow.notification_deliveries(state,next_at) WHERE state IN ('pending','retry','accepted');
CREATE INDEX IF NOT EXISTS notification_leases ON enterprise_workflow.notification_deliveries(lease_until) WHERE lease_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_team ON enterprise_workflow.notification_deliveries(enterprise_id,team_id,created_at DESC,id);
CREATE TABLE IF NOT EXISTS enterprise_workflow.notification_commands (
 enterprise_id uuid NOT NULL,id uuid NOT NULL,subject text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(enterprise_id,id)
);
CREATE TABLE IF NOT EXISTS enterprise_workflow.notification_audit (
 seq bigserial PRIMARY KEY,enterprise_id uuid NOT NULL,team_id uuid NOT NULL,subject text NOT NULL,operation text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_audit_team ON enterprise_workflow.notification_audit(enterprise_id,team_id,seq DESC);
INSERT INTO enterprise_workflow.schema_version VALUES(11) ON CONFLICT DO NOTHING;
COMMIT;
