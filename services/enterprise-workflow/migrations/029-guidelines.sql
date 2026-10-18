BEGIN;
ALTER TABLE enterprise_workflow.runtime_installation ADD COLUMN guidelines_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE enterprise_workflow.guideline_books(enterprise_id uuid NOT NULL,team_id uuid NOT NULL,id uuid NOT NULL,brand_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),document jsonb NOT NULL,PRIMARY KEY(enterprise_id,team_id,id),FOREIGN KEY(enterprise_id,brand_id) REFERENCES enterprise_workflow.catalog_entities(enterprise_id,id),CHECK((document->>'version')::integer=version));
CREATE TABLE enterprise_workflow.guideline_commands(enterprise_id uuid NOT NULL,id uuid NOT NULL,team_id uuid NOT NULL,book_id uuid NOT NULL,actor text NOT NULL,reason text NOT NULL,fingerprint text NOT NULL,operation text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id));
CREATE TABLE enterprise_workflow.guideline_versions(enterprise_id uuid NOT NULL,team_id uuid NOT NULL,id uuid NOT NULL,revision integer NOT NULL,document jsonb NOT NULL,revoked boolean NOT NULL DEFAULT false,withdrawal jsonb,command_id uuid NOT NULL,PRIMARY KEY(enterprise_id,team_id,id,revision),FOREIGN KEY(enterprise_id,team_id,id) REFERENCES enterprise_workflow.guideline_books(enterprise_id,team_id,id),FOREIGN KEY(enterprise_id,command_id) REFERENCES enterprise_workflow.guideline_commands(enterprise_id,id));
CREATE INDEX guideline_brand ON enterprise_workflow.guideline_books(enterprise_id,team_id,brand_id,id);
CREATE INDEX orders_guideline ON enterprise_workflow.orders(enterprise_id,((document->'guideline')->>'id'),((document->'guideline')->>'revision'));
INSERT INTO enterprise_workflow.schema_version VALUES(29);
COMMIT;
