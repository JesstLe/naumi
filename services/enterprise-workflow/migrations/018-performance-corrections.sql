BEGIN;
CREATE TABLE IF NOT EXISTS enterprise_workflow.performance_corrections (
 enterprise_id uuid NOT NULL, team_id uuid NOT NULL, id uuid NOT NULL,
 period_id uuid NOT NULL, fact_id text NOT NULL, version integer NOT NULL CHECK(version>0),
 state text NOT NULL CHECK(state IN ('proposed','approved','rejected','withdrawn')),
 applied_revision integer, document jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),
 FOREIGN KEY(enterprise_id,team_id,period_id) REFERENCES enterprise_workflow.performance_periods(enterprise_id,team_id,id),
 FOREIGN KEY(enterprise_id,fact_id) REFERENCES enterprise_workflow.events(enterprise_id,id),
 CHECK((state='approved')=(applied_revision IS NOT NULL)),
 CHECK(applied_revision IS NULL OR applied_revision>0),
 CHECK((document->>'version')::int=version AND document->>'state'=state)
);
CREATE UNIQUE INDEX IF NOT EXISTS performance_correction_revision ON enterprise_workflow.performance_corrections(enterprise_id,team_id,period_id,fact_id,applied_revision) WHERE state='approved';
CREATE INDEX IF NOT EXISTS performance_correction_period ON enterprise_workflow.performance_corrections(enterprise_id,team_id,period_id,created_at DESC,id);
INSERT INTO enterprise_workflow.schema_version VALUES(18) ON CONFLICT DO NOTHING;
COMMIT;
