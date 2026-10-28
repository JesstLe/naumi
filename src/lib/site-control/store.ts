import 'server-only';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db/connection';
import { enterpriseSiteIdentity } from './identity';
import { sitePolicyInputSchema, sitePolicySchema, type SitePolicy, type SitePolicyInput, type SiteProfile } from './contracts';

export class SitePolicyError extends Error {
  constructor(readonly code: 'CONFLICT' | 'DENIED' | 'NOT_CONFIGURED') { super(code); }
}
let ready: Promise<void> | undefined;
export async function ensureSitePolicySchema() {
  if (!ready) ready = getPool().query(`
    CREATE TABLE IF NOT EXISTS app_site_media_audit (
      id bigserial PRIMARY KEY, command_id uuid NOT NULL, actor text NOT NULL,
      creation_id text NOT NULL, asset_id text NOT NULL, original boolean NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_site_policy (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      policy jsonb NOT NULL, updated_by text NOT NULL, command_id uuid NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS app_site_policy_audit (
      command_id uuid PRIMARY KEY, actor text NOT NULL, before_policy jsonb,
      after_policy jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
  `).then(() => {}).catch(error => { ready = undefined; throw error; });
  await ready;
}
function assertBinding(policy: SitePolicyInput) {
  const identity = enterpriseSiteIdentity();
  if (!identity || policy.enterpriseId !== identity.enterpriseId || policy.sourceInstanceId !== identity.sourceInstanceId) throw new SitePolicyError('DENIED');
}
export async function readSitePolicy(tx: Pick<PoolClient, 'query'> = getPool()): Promise<SitePolicy | null> {
  const row = (await tx.query('SELECT policy FROM app_site_policy WHERE singleton=true')).rows[0];
  if (!row) return null;
  const policy = sitePolicySchema.parse(row.policy);
  assertBinding(policy);
  return policy;
}
/** Called in the connector's receipt transaction: policy and ACK outcome commit together. */
export async function applySitePolicyTx(tx: PoolClient, command: { id: string; actor: string; expectedRevision: number; policy: SitePolicyInput }): Promise<SitePolicy> {
  const input = sitePolicyInputSchema.parse(command.policy);
  assertBinding(input);
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi:site-policy'))");
  const current = await readSitePolicy(tx);
  if ((current?.revision ?? 0) !== command.expectedRevision) throw new SitePolicyError('CONFLICT');
  const policy: SitePolicy = { ...input, revision: command.expectedRevision + 1, updatedAt: new Date().toISOString() };
  await tx.query(`INSERT INTO app_site_policy(singleton,policy,updated_by,command_id) VALUES(true,$1,$2,$3)
    ON CONFLICT(singleton) DO UPDATE SET policy=excluded.policy,updated_by=excluded.updated_by,command_id=excluded.command_id`, [JSON.stringify(policy), command.actor, command.id]);
  await tx.query('INSERT INTO app_site_policy_audit(command_id,actor,before_policy,after_policy) VALUES($1,$2,$3,$4)', [command.id, command.actor, current ? JSON.stringify(current) : null, JSON.stringify(policy)]);
  return policy;
}
/** No central network dependency or stale permission cache on the request path. */
export async function siteProfile(): Promise<SiteProfile> {
  if (!enterpriseSiteIdentity()) return { mode: 'platform' };
  await ensureSitePolicySchema();
  const policy = await readSitePolicy();
  if (!policy) throw new SitePolicyError('NOT_CONFIGURED');
  return { mode: 'enterprise', policy };
}
