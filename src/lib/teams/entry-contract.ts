import type { TeamAccessStatus } from './contracts';

export type EntryStatus = TeamAccessStatus | 'forbidden';
export type TeamEntryDiscovery = {
  allowed: boolean;
  canManageTeams: boolean;
  enterprise: boolean;
  expiresAt: string | null;
  startsAt: string | null;
  status: EntryStatus;
  href: '/enterprise' | '/team' | '/admin';
};

const labels: Record<EntryStatus | 'loading' | 'error', [string, string]> = {
  active: ['已授权', 'Authorized'], ungranted: ['未授权', 'Not authorized'],
  scheduled: ['待生效', 'Scheduled'], paused: ['已暂停', 'Paused'],
  expired: ['已到期', 'Expired'], revoked: ['已撤销', 'Revoked'],
  forbidden: ['未开放管理权限', 'Management access disabled'],
  loading: ['正在读取授权', 'Loading access'], error: ['授权状态暂未读取', 'Access status unavailable'],
};
export function entryStatusLabel(status: keyof typeof labels, english = false) {
  return labels[status][english ? 1 : 0];
}
/** Reject incomplete old/error responses instead of turning them into a denial. */
export function parseEntryDiscovery(value: unknown): TeamEntryDiscovery {
  const v = value as TeamEntryDiscovery;
  const date = (d: unknown) => d === null || typeof d === 'string' && Number.isFinite(Date.parse(d));
  if (!v || typeof v.allowed !== 'boolean' || typeof v.enterprise !== 'boolean' ||
    typeof v.canManageTeams !== 'boolean' || !Object.hasOwn(labels, v.status) ||
    ['loading', 'error'].includes(v.status) || !date(v.startsAt) || !date(v.expiresAt) ||
    !['/enterprise', '/team', '/admin'].includes(v.href) || v.allowed !== (v.status === 'active')) {
    throw new Error('Invalid entry discovery');
  }
  return v;
}
