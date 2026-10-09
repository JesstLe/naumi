CREATE TABLE IF NOT EXISTS app_supplier_model_metadata(
 id uuid PRIMARY KEY,provider_id text NOT NULL,provider_name text NOT NULL,model_id text NOT NULL,label text NOT NULL,catalog_owner text NOT NULL DEFAULT '',
 family text NOT NULL DEFAULT '',brand text NOT NULL DEFAULT '',modality text NOT NULL DEFAULT 'unknown',capability_state text NOT NULL DEFAULT 'unknown',
 metadata jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1,last_seen_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),updated_by text,
 UNIQUE(provider_id,model_id)
);
CREATE INDEX IF NOT EXISTS app_supplier_model_metadata_filters ON app_supplier_model_metadata(provider_id,family,brand);
CREATE TABLE IF NOT EXISTS app_supplier_model_price_points(
 model_id uuid NOT NULL REFERENCES app_supplier_model_metadata(id),id uuid NOT NULL,
 quality text NOT NULL,resolution text NOT NULL,basis text NOT NULL,currency text NOT NULL,
 amount_micros numeric(30,0),input_micros_per_million numeric(30,0),output_micros_per_million numeric(30,0),cached_input_micros_per_million numeric(30,0),image_input_micros_per_million numeric(30,0),
 price jsonb NOT NULL,PRIMARY KEY(model_id,id)
);
CREATE INDEX IF NOT EXISTS app_supplier_model_price_basis ON app_supplier_model_price_points(basis,model_id);
CREATE TABLE IF NOT EXISTS app_supplier_model_metadata_versions(
 model_id uuid NOT NULL REFERENCES app_supplier_model_metadata(id),revision bigint NOT NULL,operation_id uuid UNIQUE,request_fingerprint text,actor text NOT NULL,
 metadata jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(model_id,revision)
);
