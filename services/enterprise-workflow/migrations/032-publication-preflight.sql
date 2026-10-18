BEGIN;
CREATE TABLE enterprise_workflow.publication_preflights(enterprise_id uuid NOT NULL,id uuid NOT NULL,publication_id uuid NOT NULL,publication_version integer NOT NULL,subject text NOT NULL,fingerprint text NOT NULL,document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,publication_id) REFERENCES enterprise_workflow.publications(enterprise_id,id));
CREATE INDEX publication_preflight_parent ON enterprise_workflow.publication_preflights(enterprise_id,publication_id,created_at DESC,id DESC);
INSERT INTO enterprise_workflow.schema_version VALUES(32);
COMMIT;
