import 'server-only';
import type { Pool, PoolClient } from 'pg';
import { getPool } from "@/platform/db/pool";
import { checkReadClientSocket, withOwnedReportClient } from '@/platform/db/owned-read-client';
import { enterpriseHeavyReportRead } from '@/lib/enterprise/server';
import { TeamError } from "@/lib/teams/errors";
import type { TeamActor } from '@/lib/teams/grants';
import { tenantDates } from './tenants';
import type { TenantUsage, TenantUsageQuery } from './tenant-usage-contracts';

/** Attribution is frozen on the accepted creation, never inferred from today's membership.
 * Supplier funds are platform procurement, not a tenant wallet or customer credit balance. */
export async function readTenantUsage(tx: PoolClient, query: TenantUsageQuery, visible: string[] | null): Promise<TenantUsage> {
  const dates = tenantDates(query);
  const base = {
    tenantId: query.tenantId, scope: visible === null ? 'tenant' as const : 'current_subordinates' as const,
    fundingModel: 'platform_shared' as const, billingModel: 'member_accounts' as const,
    period: { from: dates.from, to: dates.to }, generatedAt: new Date().toISOString(),
  };
  const present = (await tx.query(`SELECT to_regclass('app_creation_records') IS NOT NULL
    AND to_regclass('app_creation_links') IS NOT NULL AND to_regclass('app_billing_operations') IS NOT NULL AS present`)).rows[0].present;
  if (!present) return { ...base, availability: 'not_recorded', creations: null, chargedCredits: null,
    reservedCredits: null, settledOperations: null, pendingOperations: null, unrecordedCreations: null };
  const result = (await tx.query(`WITH RECURSIVE roots AS (
    SELECT id,actor_email,tenant_id,payer_account_id FROM app_creation_records
    WHERE tenant_id=$1 AND scope_kind='tenant' AND parent_id IS NULL
      AND accepted_at>=$2 AND accepted_at<$3 AND ($4::text[] IS NULL OR actor_email=ANY($4))
  ), family AS (
    SELECT id AS root_id,id,actor_email,tenant_id,payer_account_id FROM roots
    UNION
    SELECT p.root_id,c.id,c.actor_email,c.tenant_id,c.payer_account_id FROM app_creation_records c JOIN family p
      ON c.parent_id=p.id AND c.actor_email=p.actor_email AND c.tenant_id=p.tenant_id AND c.scope_kind='tenant'
  ), billing_links AS (
    SELECT f.root_id,f.id AS node_id,f.actor_email,f.payer_account_id,l.actor_email AS link_actor,l.target_id
    FROM family f JOIN app_creation_links l ON l.creation_id=f.id AND l.target_type='billing'
  ), linked AS (
    SELECT DISTINCT l.root_id,l.node_id,o.id,o.state,o.charged_credits,o.reserved_credits
    FROM billing_links l JOIN app_billing_operations o ON o.id=l.target_id AND o.email=l.payer_account_id
    WHERE l.link_actor=l.actor_email
    AND NOT EXISTS(SELECT 1 FROM app_creation_links other JOIN app_creation_records c ON c.id=other.creation_id
      WHERE other.target_type='billing' AND other.target_id=o.id AND other.actor_email=c.actor_email
      AND c.payer_account_id=o.email AND c.tenant_id IS DISTINCT FROM $1::uuid)
  ), operations AS (
    SELECT DISTINCT id,state,charged_credits,reserved_credits FROM linked
  ), free_roots AS (
    SELECT f.id AS root_id FROM roots f JOIN app_creation_links l ON l.creation_id=f.id AND l.actor_email=f.actor_email
      AND l.target_type='no-charge' AND l.relation='explicit-no-charge'
  ), recorded AS (
    SELECT root_id FROM linked UNION SELECT root_id FROM free_roots
  ), unresolved AS (
    SELECT DISTINCT l.root_id FROM billing_links l WHERE NOT EXISTS(
      SELECT 1 FROM linked x WHERE x.root_id=l.root_id AND x.node_id=l.node_id AND x.id=l.target_id)
  ) SELECT (SELECT count(*)::int FROM roots) AS creations,
    (SELECT count(*)::int FROM roots r WHERE NOT EXISTS(SELECT 1 FROM recorded x WHERE x.root_id=r.id)
      OR EXISTS(SELECT 1 FROM unresolved x WHERE x.root_id=r.id)) AS unrecorded,
    (EXISTS(SELECT 1 FROM operations) OR EXISTS(SELECT 1 FROM free_roots)) AS has_known,
    count(*) FILTER(WHERE state IN ('settled','released'))::int AS settled,
    count(*) FILTER(WHERE state NOT IN ('settled','released'))::int AS pending,
    COALESCE(sum(charged_credits) FILTER(WHERE state IN ('settled','released')),0)::float8 AS charged,
    COALESCE(sum(reserved_credits) FILTER(WHERE state NOT IN ('settled','released')),0)::float8 AS reserved
    FROM operations`, [query.tenantId, dates.start, dates.end, visible])).rows[0];
  const completelyUnknown = result.creations > 0 && !result.has_known;
  return { ...base, availability: 'available', creations: result.creations, chargedCredits: completelyUnknown ? null : result.charged,
    reservedCredits: completelyUnknown ? null : result.reserved, settledOperations: result.settled,
    pendingOperations: result.pending, unrecordedCreations: result.unrecorded };
}

export async function platformTenantUsage(query: TenantUsageQuery, pool: Pool = getPool(), signal?: AbortSignal) {
  return withOwnedReportClient(pool, async tx => {
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await tx.query("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='1s'" + (signal ? checkReadClientSocket : ''));
    const tenant = (await tx.query(`SELECT 1 FROM app_account_teams t JOIN app_enterprise_settings e ON e.team_id=t.id WHERE t.id=$1`, [query.tenantId])).rows[0];
    if (!tenant) throw new TeamError('企业不存在', 404);
    const result = await readTenantUsage(tx, query, null); await tx.query('COMMIT'); return result;
  }, signal);
}
export async function enterpriseTenantUsage(actor: TeamActor, query: TenantUsageQuery, signal?: AbortSignal) {
  return enterpriseHeavyReportRead({ ...actor, admin: false, consoleAdmin: false }, query.tenantId,
    (tx, scope) => readTenantUsage(tx, query, scope.owner ? null : [...scope.visible]), signal);
}
