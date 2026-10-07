-- Additive supplier cost ledger; keep wallet, media and historical data.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('naumi-supplier-cost-schema-v1',0));

CREATE TABLE IF NOT EXISTS app_supplier_accounts(
 id text PRIMARY KEY,provider_id text NOT NULL,protocol text NOT NULL,base_url text NOT NULL,credential_ref uuid,
 label text NOT NULL,fx jsonb,policy jsonb NOT NULL DEFAULT '{}'::jsonb,usage_enabled boolean NOT NULL DEFAULT false,
 last_usage_at timestamptz,updated_by text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_supplier_calls(
 id uuid PRIMARY KEY,operation_id text NOT NULL,order_id text,user_email text,feature text NOT NULL,public_model_id text,
 attempt_id text NOT NULL,account_id text NOT NULL REFERENCES app_supplier_accounts(id),provider_id text NOT NULL,model text NOT NULL,
 actual_model text,task_id text,request_id text,phase text NOT NULL,parent_call_id uuid REFERENCES app_supplier_calls(id),
 matched_rule_id text,model_version bigint,billing_version bigint,procurement jsonb,fx jsonb,
 state text NOT NULL DEFAULT 'submitting',cost_status text NOT NULL DEFAULT 'pending' CHECK(cost_status IN('pending','estimated','reported','reconciled')),
 amount_micros numeric(30,0),currency text CHECK(currency IN('USD','CNY')),credits_micros numeric(30,0),cny_micros numeric(30,0),
 usage jsonb,evidence jsonb NOT NULL DEFAULT '{}'::jsonb,delivered int,completed_at timestamptz,posting_time_known boolean NOT NULL DEFAULT false,
 cost_confirmed_at timestamptz,last_observed_at timestamptz,started_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,attempt_id),CHECK(amount_micros IS NULL OR amount_micros>=0),CHECK(credits_micros IS NULL OR credits_micros>=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS app_supplier_calls_task ON app_supplier_calls(account_id,task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS app_supplier_calls_operation ON app_supplier_calls(operation_id,started_at);
CREATE INDEX IF NOT EXISTS app_supplier_calls_time ON app_supplier_calls(account_id,completed_at,model);
CREATE INDEX IF NOT EXISTS app_supplier_calls_filters ON app_supplier_calls(user_email,feature,started_at);
CREATE TABLE IF NOT EXISTS app_supplier_call_outputs(
 call_id uuid NOT NULL REFERENCES app_supplier_calls(id),output_index int NOT NULL CHECK(output_index>=0),
 supplier_ref_hash text,state text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(call_id,output_index)
);
CREATE TABLE IF NOT EXISTS app_supplier_query_limits(key_hash text PRIMARY KEY,last_usage_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS app_supplier_cost_adjustments(
 id uuid PRIMARY KEY,call_id uuid NOT NULL REFERENCES app_supplier_calls(id),kind text NOT NULL,before_receipt jsonb NOT NULL,
 after_receipt jsonb NOT NULL,reason text NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_supplier_cost_jobs(
 key text PRIMARY KEY,kind text NOT NULL CHECK(kind IN('task','router','usage')),account_id text REFERENCES app_supplier_accounts(id),
 payload jsonb NOT NULL,state text NOT NULL DEFAULT 'queued',attempts int NOT NULL DEFAULT 0,lease_id uuid,lease_until timestamptz,
 due_at timestamptz NOT NULL DEFAULT now(),last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_supplier_cost_jobs_due ON app_supplier_cost_jobs(due_at) WHERE state='queued';
CREATE TABLE IF NOT EXISTS app_supplier_callback_inbox(
 id uuid PRIMARY KEY,account_id text NOT NULL REFERENCES app_supplier_accounts(id),task_id text NOT NULL,payload_hash text NOT NULL,
 hint jsonb NOT NULL,source_verified boolean NOT NULL DEFAULT false,received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,task_id,payload_hash)
);
CREATE TABLE IF NOT EXISTS app_supplier_usage_runs(
 id uuid PRIMARY KEY,account_id text NOT NULL REFERENCES app_supplier_accounts(id),window_start timestamptz NOT NULL,window_end timestamptz NOT NULL,
 timezone text NOT NULL,total jsonb NOT NULL,evidence jsonb NOT NULL,fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_supplier_usage_buckets(
 account_id text NOT NULL REFERENCES app_supplier_accounts(id),window_start timestamptz NOT NULL,window_end timestamptz NOT NULL,
 model text NOT NULL,date text NOT NULL,run_id uuid NOT NULL REFERENCES app_supplier_usage_runs(id),remote_amount_micros numeric(30,0) NOT NULL,
 remote_credits_micros numeric(30,0) NOT NULL,remote_requests int NOT NULL,local_amount_micros numeric(30,0) NOT NULL,
 local_credits_micros numeric(30,0) NOT NULL,local_requests int NOT NULL,pending int NOT NULL,status text NOT NULL,
 amount_delta_micros numeric(30,0) NOT NULL,credits_delta_micros numeric(30,0) NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,window_start,window_end,model,date)
);
CREATE TABLE IF NOT EXISTS app_supplier_admin_audit(
 id uuid PRIMARY KEY,actor text NOT NULL,action text NOT NULL,target text NOT NULL,changes jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_supplier_variable_costs(id uuid PRIMARY KEY,operation_id text NOT NULL,amount_cny_micros numeric(30,0) NOT NULL CHECK(amount_cny_micros>=0),label text NOT NULL,evidence text NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());

COMMIT;
