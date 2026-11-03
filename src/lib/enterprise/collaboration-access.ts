import 'server-only';
import type { PoolClient } from 'pg';
import { dbEnabled, getPool } from '@/lib/db';
import { enterpriseUserEmail } from './access';
import { ensureEnterpriseSchema } from './server';
import { pinnedEnterpriseIds } from './integration/policy';
import { requireTeamGrant } from '@/lib/teams/grants';
import { TeamError } from '@/lib/teams/server';
import { teamJson, teamMutationOrigin } from '@/lib/teams/access';
import { policyFromRow } from '@/lib/feature-access/server';
import { allows } from '@/lib/feature-access/catalog';

export type CollaborationScope = {
  enterpriseId: string; actorId: string; ownerId: string;
  memberIds: ReadonlySet<string>;
};

/** Customer identity only. A platform administrator is NOT a chat participant. */
export async function authorizeCollaborationRequest(request: Request): Promise<{ email: string } | Response> {
  if (!['GET', 'HEAD'].includes(request.method) && !teamMutationOrigin(request))
    return teamJson({ error: '请求来源无效' }, 403);
  if (!dbEnabled) return teamJson({ error: '数据库未配置' }, 503);
  const email = await enterpriseUserEmail(request);
  return email ? { email: email.trim().toLowerCase() } : teamJson({ error: '请先登录' }, 401);
}

/** Same transaction owns identity locks and the caller's writes. No nested checkout.
 * Ordinary active employees have a directory; view_records / site-admin are unrelated.
 */
export async function withCollaborationScope<T>(email: string, enterpriseId: string,
  run: (tx: PoolClient, scope: CollaborationScope) => Promise<T>): Promise<T> {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(enterpriseId)) throw new TeamError('企业参数无效', 400);
  const pinned = pinnedEnterpriseIds();
  if (pinned.length && !pinned.includes(enterpriseId)) throw new TeamError('企业不存在', 404);
  await ensureEnterpriseSchema();
  const tx = await getPool().connect();
  let discard = false;
  try {
    await tx.query('BEGIN');
    await tx.query("SET LOCAL statement_timeout='12s'; SET LOCAL lock_timeout='5s'");
    const actorId = email.trim().toLowerCase();
    const team = (await tx.query(`SELECT t.owner_email,t.enabled,t.authorized_until,s.enabled AS enterprise_enabled
      FROM app_account_teams t JOIN app_enterprise_settings s ON s.team_id=t.id WHERE t.id=$1 FOR SHARE OF t,s`, [enterpriseId])).rows[0];
    if (!team || !team.enabled || !team.enterprise_enabled || team.authorized_until && new Date(team.authorized_until).getTime() <= Date.now())
      throw new TeamError('企业不存在或授权已关闭、到期', 403);
    await requireTeamGrant(tx, { email: team.owner_email, admin: false });
    const entitlement = (await tx.query('SELECT feature_policy FROM app_tenant_entitlements WHERE tenant_id=$1 FOR SHARE', [enterpriseId])).rows[0];
    if (entitlement?.feature_policy?.team === false) throw new TeamError('企业协作已停用', 403);
    const people = (await tx.query(`SELECT m.email FROM app_enterprise_members m JOIN app_users u ON u.email=m.email
      WHERE m.enterprise_id=$1 AND m.membership_status='active' AND (m.membership_expires_at IS NULL OR m.membership_expires_at>now())
      AND NOT u.banned AND (u.account_expires_at IS NULL OR u.account_expires_at>now()) ORDER BY m.email FOR SHARE OF m,u`, [enterpriseId])).rows;
    const memberIds = new Set<string>([team.owner_email, ...people.map(p => p.email)]);
    if (!memberIds.has(actorId)) throw new TeamError('当前企业身份已失效', 403);
    const policy = (await tx.query('SELECT mode,allowed,version FROM app_feature_access WHERE email=$1 FOR SHARE', [actorId])).rows[0];
    if (!allows(policyFromRow(policy), 'team')) throw new TeamError('企业协作尚未授权', 403);
    const result = await run(tx, { enterpriseId, actorId, ownerId: team.owner_email, memberIds });
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    try { await tx.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { tx.release(discard); }
}

export function collaborationFailure(error: unknown): Response {
  if (error instanceof TeamError) return teamJson({ error: error.message }, error.status);
  const known = error as { status?: number; code?: string; name?: string; message?: string } | null;
  if (known?.name === 'ZodError' || known instanceof SyntaxError) return teamJson({ error: '请求参数无效' }, 400);
  if (known?.status && [400, 401, 403, 404, 409, 410, 413, 416, 429, 503].includes(known.status))
    return teamJson({ error: known.message || '请求失败', ...(known.code ? { code: known.code } : {}) }, known.status);
  // A lost commit ACK stays unknown. Retrying the SAME clientId is the recovery path.
  return teamJson({ error: '结果尚未确认，请使用同一请求重试', uncertain: true }, 503);
}

/** Batched SSE identity leases. Business payloads still require withCollaborationScope.
 * Keep enterprise/grant rules in their owning domain, not in the transport hub.
 */
export async function activeCollaborationLeases(identities: ReadonlyArray<{ enterpriseId: string; actorId: string }>): Promise<ReadonlySet<string>> {
  if (!identities.length) return new Set<string>();
  await ensureEnterpriseSchema();
  const pinned = pinnedEnterpriseIds();
  const rows = (await getPool().query(`SELECT DISTINCT q.enterprise_id,q.actor_id FROM
      unnest($1::uuid[],$2::text[])q(enterprise_id,actor_id)
      JOIN app_account_teams t ON t.id=q.enterprise_id AND t.enabled AND (t.authorized_until IS NULL OR t.authorized_until>now())
      JOIN app_enterprise_settings s ON s.team_id=t.id AND s.enabled
      JOIN app_users u ON u.email=q.actor_id AND NOT u.banned AND (u.account_expires_at IS NULL OR u.account_expires_at>now())
      JOIN app_users o ON o.email=t.owner_email AND NOT o.banned AND (o.account_expires_at IS NULL OR o.account_expires_at>now())
      JOIN app_team_access_grants g ON g.email=t.owner_email AND g.enabled AND g.revoked_at IS NULL AND g.starts_at<=now() AND (g.expires_at IS NULL OR g.expires_at>now())
      LEFT JOIN app_feature_access f ON f.email=q.actor_id LEFT JOIN app_tenant_entitlements te ON te.tenant_id=t.id
      WHERE (te.feature_policy->>'team' IS DISTINCT FROM 'false') AND (f.email IS NULL OR f.mode='default' OR f.mode='custom' AND f.allowed ? 'team')
      AND (t.owner_email=q.actor_id OR EXISTS(SELECT 1 FROM app_enterprise_members m WHERE m.enterprise_id=t.id AND m.email=q.actor_id
        AND m.membership_status='active' AND (m.membership_expires_at IS NULL OR m.membership_expires_at>now())))`,
    [identities.map(i => i.enterpriseId), identities.map(i => i.actorId)])).rows;
  return new Set(rows.filter(r => !pinned.length || pinned.includes(r.enterprise_id)).map(r => `${r.enterprise_id}:${r.actor_id}`));
}
