import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TeamError } from '@/lib/teams/server';

export const id = z.string().uuid();
export const clientId = z.string().min(1).max(160).regex(/^[\w.:~-]+$/);
export const memberId = z.string().trim().toLowerCase().email().max(254);
export const sendSchema = z.object({ clientId, body: z.string().max(32000), replyTo: id.optional(),
  attachmentIds: z.array(id).max(20).default([]), mentionIds: z.array(memberId).max(100).default([]), shareId: id.optional() }).strict();
export const createSchema = z.object({ clientId, kind: z.enum(['direct', 'group']),
  memberIds: z.array(memberId).min(1).max(100), title: z.string().trim().max(100).optional() }).strict();
export const changeSchema = z.object({ pinned: z.boolean().optional(), muted: z.boolean().optional(),
  title: z.string().trim().max(100).optional(), addMemberIds: z.array(memberId).max(100).optional(),
  removeMemberIds: z.array(memberId).max(100).optional(), leave: z.boolean().optional() }).strict();
export const forwardSchema = z.object({ clientId, messageIds: z.array(id).min(1).max(20), conversationIds: z.array(id).min(1).max(10) }).strict();
export const presenceSchema = z.object({ sessionId: clientId, state: z.enum(['online', 'away', 'offline']) }).strict();
export const uploadSchema = z.object({ clientId, conversationId: id, name: z.string().min(1).max(240),
  bytes: z.number().int().nonnegative().safe(), mime: z.string().max(160) }).strict();
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const unique = (values: string[]) => [...new Set(values)].sort();
export function requireMembers(members: ReadonlySet<string>, ids: string[]) {
  if (ids.some(id => !members.has(id))) throw new TeamError('成员不属于当前活跃企业', 403);
}
export function encodeCursor(binding: string, key: string) { return Buffer.from(JSON.stringify([binding, key])).toString('base64url'); }
export function decodeCursor(raw: string | null | undefined, binding: string): string | null {
  if (!raw) return null;
  try { if (raw.length > 1500) throw Error(); const data = JSON.parse(Buffer.from(raw, 'base64url').toString());
    if (!Array.isArray(data) || data.length !== 2 || data[0] !== binding || typeof data[1] !== 'string') throw Error(); return data[1];
  } catch { throw new TeamError('分页游标无效，请刷新', 400); }
}
export function fileName(value: string) {
  try { encodeURIComponent(value); } catch { throw new TeamError('文件名编码无效', 400); }
  // A display name is never a filesystem path, including Windows devices/ADS.
  if (/[\\/\x00-\x1f\x7f:<>"|?*\u202a-\u202e\u2066-\u2069]/u.test(value) || /[. ]$/.test(value)
      || value === '.' || value === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))
    throw new TeamError('文件名无效', 400);
  return value;
}
function limit(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]; const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new TeamError(`配置 ${name} 无效`, 503);
  return n;
}
export function collaborationLimits() {
  const chunkBytes = limit('COLLABORATION_CHUNK_BYTES', 4 * 1024 ** 2, 64 * 1024, 16 * 1024 ** 2);
  return { attachmentBytes: Math.min(limit('COLLABORATION_ATTACHMENT_BYTES', 2 * 1024 ** 3, 1, 64 * 1024 ** 3), chunkBytes * 16384), chunkBytes };
}
export const uploadTtlMs = () => limit('COLLABORATION_UPLOAD_TTL_MS', 24 * 3600_000, 60_000, 7 * 24 * 3600_000);
export const presenceTtlMs = () => limit('COLLABORATION_PRESENCE_TTL_MS', 90_000, 15_000, 300_000);
