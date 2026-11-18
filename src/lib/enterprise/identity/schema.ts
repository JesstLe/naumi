import 'server-only';
import {ensureEnterpriseSchema} from '../schema';
import {getPool} from '@/platform/db/pool';
import {databaseSchemaReadiness} from '@/platform/db/schema-readiness';
export async function ensureIdentitySchema(){
  await ensureEnterpriseSchema();
  // Additive only. Existing account and business primary keys remain unchanged.
  const state=databaseSchemaReadiness(getPool(),'enterprise-identity');
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
  `).then(()=>{}).catch(error=>{state.pending=null;throw error;});
  await state.pending;
}
