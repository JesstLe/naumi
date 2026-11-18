import 'server-only';
import {ensureEnterpriseSchema} from '../schema';
import {getPool} from '@/platform/db/pool';
import {databaseSchemaReadiness} from '@/platform/db/schema-readiness';
export async function ensureIdentitySchema(){
  await ensureEnterpriseSchema();
  // Additive only. Existing account and business primary keys remain unchanged.
  const state=databaseSchemaReadiness(getPool(),'enterprise-identity-v2');
  if(!state.pending)state.pending=getPool().query(`
    CREATE TABLE IF NOT EXISTS app_identity_subjects(
      subject_id uuid PRIMARY KEY,account_email text NOT NULL UNIQUE REFERENCES app_users(email),created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_identity_organizations(
      enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id),subject_id uuid NOT NULL REFERENCES app_identity_subjects(subject_id),
      organization jsonb NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,subject_id));
    CREATE TABLE IF NOT EXISTS app_identity_product_grants(
      enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id),subject_id uuid NOT NULL REFERENCES app_identity_subjects(subject_id),product_id text NOT NULL,
      enabled boolean NOT NULL,roles jsonb NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(enterprise_id,subject_id,product_id));
    CREATE TABLE IF NOT EXISTS app_identity_outbox(
      sequence bigserial PRIMARY KEY,event_id uuid NOT NULL UNIQUE,enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id),
      subject_id uuid NOT NULL REFERENCES app_identity_subjects(subject_id),product_id text,event_type text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS identity_outbox_enterprise ON app_identity_outbox(enterprise_id,sequence);
    CREATE TABLE IF NOT EXISTS app_identity_receipts(
      id uuid PRIMARY KEY,enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id),actor text NOT NULL,fingerprint text NOT NULL,
      result jsonb NOT NULL,changes jsonb NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_identity_invites(
      id uuid PRIMARY KEY,enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id),email text NOT NULL REFERENCES app_users(email),
      token_hash text NOT NULL UNIQUE,activation_mode text NOT NULL CHECK(activation_mode IN ('new','reset')),
      expected_user_version integer NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_identity_consumer_acks(
      enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id),product_id text NOT NULL,revision text NOT NULL,
      last_sequence bigint NOT NULL DEFAULT 0,applied_members integer NOT NULL,last_success_at timestamptz NOT NULL DEFAULT now(),
      last_error text,PRIMARY KEY(enterprise_id,product_id));
    CREATE TABLE IF NOT EXISTS app_identity_oidc_store(
      model text NOT NULL,id text NOT NULL,payload jsonb NOT NULL,grant_id text,uid text,user_code text,
      expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(model,id));
    CREATE INDEX IF NOT EXISTS identity_oidc_uid ON app_identity_oidc_store(model,uid);
    CREATE INDEX IF NOT EXISTS identity_oidc_grant ON app_identity_oidc_store(grant_id);
  `).then(()=>{}).catch(error=>{state.pending=null;throw error;});
  await state.pending;
}
