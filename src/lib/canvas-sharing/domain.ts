import { createHash } from "node:crypto";
import { z } from "zod";
import { videoNodeIdSchema, videoProjectKeySchema } from "../canvas/video-node-schema";

export class CanvasShareError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
export function fail(code: string, message: string, status = 409): never { throw new CanvasShareError(code, message, status); }
export const shareSourceSchema = z.strictObject({
  projectKey: videoProjectKeySchema, kind: z.enum(["artwork", "workflow"]),
  nodeIds: z.array(videoNodeIdSchema).min(1).max(200).refine(ids => new Set(ids).size === ids.length).optional(),
}).refine(source => source.kind !== "artwork" || source.nodeIds?.length === 1, "作品分享须明确选择一项作品");
const operationId = z.string().uuid();
export const shareCreateSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("request"), operationId, authorId: z.string().email().max(254).transform(v => v.toLowerCase()) }),
  z.strictObject({ action: z.literal("offer"), operationId, requesterId: z.string().email().max(254).transform(v => v.toLowerCase()), source: shareSourceSchema }),
]);
export const shareChangeSchema = z.strictObject({
  action: z.enum(["request", "approve", "reject", "revoke"]), operationId,
  expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), source: shareSourceSchema.optional(),
}).refine(value => !value.source || value.action === "approve", "仅批准时选择分享内容");
export function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const fingerprint = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export function newIdentity(seed: string) { return `share-${fingerprint(seed).slice(0, 40)}`; }
export function newOperation(seed: string) {
  const h = fingerprint(seed); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** A shape check is not membership authorization. Production scopes come only from enterprise/collaboration-access. */
export type ShareScope = { enterpriseId: string; actorId: string; ownerId: string; memberIds: ReadonlySet<string> };
export function assertParticipants(scope: ShareScope, author: string, requester: string) {
  if (author === requester || !scope.memberIds.has(author) || !scope.memberIds.has(requester) || ![author, requester].includes(scope.actorId))
    fail("SHARE_FORBIDDEN", "分享成员当前不可用", 403);
}
