import 'server-only';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { enterpriseRead, enterpriseReportRead } from '@/lib/enterprise/server';
import { settingsSecret } from '@/lib/settings-secret';
import { TeamError } from "@/lib/teams/errors";
import type { TeamActor } from '@/lib/teams/grants';
import type { EnterpriseOverviewMeta } from '@/components/enterprise/saas-overview-contracts';

const instant = (value: unknown): string | null => value == null ? null : value instanceof Date ? value.toISOString() : String(value);
const actions: Record<string, string> = { role: '更新岗位权限', organization: '更新岗位与上级', status: '更新企业成员状态', expiry: '更新企业身份期限', profile: '更新企业名称' };

/** Returns only enterprise-safe fields. No account wallets, raw audit payloads or supplier data. */
export async function enterpriseOverviewMeta(actor: TeamActor, tenantId: string): Promise<EnterpriseOverviewMeta> {
  return enterpriseReportRead(actor, tenantId, async (tx, scope) => {
    const team = (await tx.query('SELECT name,version FROM app_account_teams WHERE id=$1', [tenantId])).rows[0];
    const members = (await tx.query(`SELECT m.email FROM app_enterprise_members m JOIN app_users u ON u.email=m.email
      WHERE m.enterprise_id=$1 AND m.email=ANY($2::text[]) AND NOT u.banned
      AND (u.account_expires_at IS NULL OR u.account_expires_at>now())
      AND m.membership_status='active' AND (m.membership_expires_at IS NULL OR m.membership_expires_at>now())`, [tenantId, [...scope.visible]])).rows;
    const visible = [...scope.visible, ...(scope.owner ? [scope.team.owner_email] : [])];
    const activities = (await tx.query(`SELECT id,action,actor,target,created_at FROM app_enterprise_audit
      WHERE enterprise_id=$1 AND action=ANY($3::text[]) AND ($4 OR target=ANY($2::text[]) OR actor=$5)
      ORDER BY created_at DESC,id DESC LIMIT 8`, [tenantId, visible, Object.keys(actions), scope.owner, actor.email])).rows;
    const effective = members.length + (scope.owner ? 1 : 0);
    const expiring = Number((await tx.query(`SELECT count(*) AS n FROM app_enterprise_members
      WHERE enterprise_id=$1 AND email=ANY($2::text[]) AND membership_status='active'
      AND membership_expires_at>now() AND membership_expires_at<=now()+interval '7 days'`, [tenantId, [...scope.visible]])).rows[0].n);
    return { tenantId, name: team.name, version: team.version, scope: scope.owner ? 'tenant' : 'current_subordinates',
      members: { visible: visible.length, effective, expiring },
      activities: activities.map(r => ({ id: r.id, action: actions[r.action], actor: r.actor, target: r.target, createdAt: instant(r.created_at)! })), generatedAt: new Date().toISOString() };
  });
}

export const enterpriseProfileCommand = z.object({ tenantId: z.string().uuid(), commandId: z.string().uuid(), expectedVersion: z.number().int().nonnegative(), name: z.string().trim().min(2).max(80) }).strict();
export async function updateEnterpriseProfile(actor: TeamActor, command: z.infer<typeof enterpriseProfileCommand>) {
  const fingerprint = createHmac('sha256', settingsSecret()).update(JSON.stringify(command)).digest('hex');
  return enterpriseRead(actor, command.tenantId, async (tx, scope) => {
    if (!scope.owner || actor.admin) throw new TeamError('企业资料仅由企业所有者维护', 403);
    const existing = (await tx.query('SELECT fingerprint,result FROM app_enterprise_audit WHERE id=$1 AND enterprise_id=$2', [command.commandId, command.tenantId])).rows[0];
    if (existing) { if (existing.fingerprint !== fingerprint) throw new TeamError('请求编号已用于其他修改', 409); return existing.result; }
    const before = (await tx.query('SELECT name,version FROM app_account_teams WHERE id=$1', [command.tenantId])).rows[0];
    const row = (await tx.query('UPDATE app_account_teams SET name=$3,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING name,version', [command.tenantId, command.expectedVersion, command.name])).rows[0];
    if (!row) throw new TeamError('企业资料已变化，请刷新后重新编辑', 409);
    const result = { name: row.name, version: row.version };
    await tx.query(`INSERT INTO app_enterprise_audit(id,enterprise_id,actor,action,target,fingerprint,result,changes)
      VALUES($1,$2,$3,'profile',$7,$4,$5::jsonb,$6::jsonb)`, [command.commandId, command.tenantId, actor.email, fingerprint, JSON.stringify(result), JSON.stringify({ before, after: result }), command.tenantId]);
    return result;
  }).catch(error => {
    if (error && typeof error === 'object' && 'code' in error && ['40001', '40P01', '23505'].includes(String(error.code))) throw new TeamError('企业资料已变化，请刷新后核对原操作结果', 409);
    throw error;
  });
}
