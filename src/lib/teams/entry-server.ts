import 'server-only';
import { getPool } from '@/lib/db';
import { enterpriseList, enterpriseManaged } from '@/lib/enterprise/server';
import { allows } from '@/lib/feature-access/catalog';
import { userFeaturePolicy } from '@/lib/feature-access/server';
import { grantStatus, teamEntryAccess } from './grants';
import type { EntryStatus, TeamEntryDiscovery } from './entry-contract';

/** Discovery reports the existing authorization rules; it never creates a grant. */
export async function discoverTeamEntry(email: string): Promise<TeamEntryDiscovery> {
  const [access, managed, policy] = await Promise.all([
    teamEntryAccess(email), enterpriseManaged(email), userFeaturePolicy(email),
  ]);
  const enterprise = managed && !access.admin;
  const row = enterprise
    ? (await getPool().query(`SELECT g.starts_at,g.expires_at,g.enabled,g.revoked_at,
        t.enabled AS team_enabled,s.enabled AS enterprise_enabled
        FROM app_enterprise_settings s JOIN app_account_teams t ON t.id=s.team_id
        LEFT JOIN app_team_access_grants g ON g.email=t.owner_email
        WHERE t.owner_email=$1 OR EXISTS(SELECT 1 FROM app_enterprise_members m
          WHERE m.enterprise_id=s.team_id AND m.email=$1) ORDER BY t.id LIMIT 1`, [email])).rows[0]
    : (await getPool().query('SELECT starts_at,expires_at,enabled,revoked_at FROM app_team_access_grants WHERE email=$1', [email])).rows[0];
  let status: EntryStatus = row?.starts_at ? grantStatus(row) : 'ungranted';
  let expiresAt = row?.expires_at?.toISOString?.() ?? row?.expires_at ?? null;
  const startsAt = row?.starts_at?.toISOString?.() ?? row?.starts_at ?? null;
  if (enterprise && (!row?.team_enabled || !row?.enterprise_enabled)) status = 'paused';
  let allowed = false;
  if (status === 'active') {
    if (!allows(policy, 'team')) status = 'forbidden';
    else if (enterprise) {
      const entries = await enterpriseList({ email, admin: false });
      allowed = entries.length > 0;
      if (allowed) expiresAt = entries[0].authorized_until;
      else status = 'forbidden';
    } else {
      allowed = access.allowed;
      if (!allowed) status = 'forbidden';
    }
  }
  return { allowed, canManageTeams: allowed && access.admin, enterprise,
    expiresAt, startsAt, status, href: enterprise ? '/enterprise' : '/team' };
}
