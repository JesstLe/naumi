import "server-only";
import { emitCollaborationEventTx } from "../enterprise/collaboration-events";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CanvasShare, CanvasShareSource, CollaborationPage } from "../collaboration/contracts";
import { assertParticipants, fail, fingerprint, shareCreateSchema, shareChangeSchema, type ShareScope } from "./domain";
import { captureShareSnapshotTx, type FrozenMedia, type ShareSnapshot } from "./snapshot";
import { storageKeyFromManagedUrl } from "../storage";
import { createShareCopyTx } from "./copy";
import type { StagedMedia, SharePreview } from "./media";

type ShareRow = { id: string; enterprise_id: string; author_id: string; requester_id: string; status: CanvasShare["status"]; title: string; kind: CanvasShare["kind"]; version: string | number; source: CanvasShareSource | null; preview: SharePreview | null; result_project_key: string | null; created_at: Date; updated_at: Date };
export function shareCard(row: ShareRow, actor: string): CanvasShare {
  return { id: row.id, enterpriseId: row.enterprise_id, authorId: row.author_id, requesterId: row.requester_id, title: row.title, kind: row.kind,
    status: row.status, version: Number(row.version), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
    previewUrl: row.preview && row.status !== "revoked" && row.status !== "rejected" ? `/api/collaboration/shares/${row.id}/preview?enterpriseId=${row.enterprise_id}` : null,
    resultProjectKey: actor === row.requester_id ? row.result_project_key : null };
}
async function rowTx(tx: PoolClient, scope: ShareScope, id: string, lock = false): Promise<ShareRow> {
  const row = (await tx.query(`SELECT * FROM app_canvas_shares WHERE id=$1 AND enterprise_id=$2 AND ($3=author_id OR $3=requester_id) ${lock ? "FOR UPDATE" : ""}`, [id, scope.enterpriseId, scope.actorId])).rows[0] as ShareRow;
  if (!row) fail("SHARE_NOT_FOUND", "分享不存在", 404);
  assertParticipants(scope, row.author_id, row.requester_id); return row;
}
export async function getShareTx(tx: PoolClient, scope: ShareScope, id: string) { return shareCard(await rowTx(tx, scope, id), scope.actorId); }
async function operationTx(tx: PoolClient, scope: ShareScope, operationId: string, input: unknown) {
  const digest = fingerprint(input);
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`share-op:${scope.enterpriseId}:${scope.actorId}:${operationId}`]);
  const old = (await tx.query("SELECT input_digest,share_id FROM app_canvas_share_operations WHERE enterprise_id=$1 AND actor_id=$2 AND operation_id=$3", [scope.enterpriseId, scope.actorId, operationId])).rows[0];
  if (old && old.input_digest !== digest) fail("SHARE_OPERATION_CONFLICT", "此操作编号已用于其他内容");
  return { digest, replay: old ? await getShareTx(tx, scope, old.share_id) : null };
}
async function saveOperationTx(tx: PoolClient, scope: ShareScope, operationId: string, digest: string, shareId: string) {
  await tx.query("INSERT INTO app_canvas_share_operations(enterprise_id,actor_id,operation_id,input_digest,share_id) VALUES($1,$2,$3,$4,$5)", [scope.enterpriseId, scope.actorId, operationId, digest, shareId]);
}
function selectedPreview(snapshot: ShareSnapshot): SharePreview {
  const permitted = snapshot.source.nodeIds ? new Set(snapshot.source.nodeIds) : null;
  for (const node of snapshot.nodes) if (node.kind === "artwork" && (!permitted || permitted.has(node.id))) {
    const key = storageKeyFromManagedUrl(node.data.canvas_image_version?.image || node.data.image_url || "");
    const media = snapshot.media.find(m => m.key === key && m.mime.startsWith("image/")); if (media) return media;
  }
  return { diagram: true, tiles: snapshot.nodes.filter(n => !permitted || permitted.has(n.id)).map(n => ({ title: String(n.data.title || ""), kind: n.kind,
    x: Number(n.data.x ?? n.data.canvas_x ?? 0), y: Number(n.data.y ?? n.data.canvas_y ?? 0), width: Math.max(64, Number(n.data.width ?? n.data.canvas_width ?? 320)), height: Math.max(64, Number(n.data.height ?? n.data.canvas_height ?? 200)) })) };
}
export async function createShareTx(tx: PoolClient, scope: ShareScope, raw: unknown): Promise<CanvasShare> {
  const input = shareCreateSchema.parse(raw), author = input.action === "offer" ? scope.actorId : input.authorId, requester = input.action === "offer" ? input.requesterId : scope.actorId;
  assertParticipants(scope, author, requester);
  const operation = await operationTx(tx, scope, input.operationId, { create: input }); if (operation.replay) return operation.replay;
  const snapshot = input.action === "offer" ? await captureShareSnapshotTx(tx, author, scope.enterpriseId, input.source) : null;
  const row = (await tx.query(`INSERT INTO app_canvas_shares(id,enterprise_id,author_id,requester_id,status,title,kind,source,preview)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING *`, [randomUUID(), scope.enterpriseId, author, requester,
    input.action === "offer" ? "offered" : "requested", snapshot?.title || "画布申请", snapshot?.source.kind || "workflow", snapshot ? JSON.stringify(snapshot.source) : null, snapshot ? JSON.stringify(selectedPreview(snapshot)) : null])).rows[0] as ShareRow;
  await saveOperationTx(tx, scope, input.operationId, operation.digest, row.id);
  await emitCollaborationEventTx(tx, scope.enterpriseId, ["shares"], [author, requester]);
  return shareCard(row, scope.actorId);
}
function authorizeChange(row: ShareRow, scope: ShareScope, input: ReturnType<typeof shareChangeSchema.parse>) {
  if (Number(row.version) !== input.expectedVersion) fail("SHARE_VERSION_CONFLICT", "分享状态已更新，请刷新后操作");
  if (input.action === "request") {
    if (scope.actorId !== row.requester_id) fail("SHARE_FORBIDDEN", "仅接收者可申请", 403);
    if (row.status !== "offered") fail("SHARE_STATE_CONFLICT", "此分享当前不可申请");
  } else {
    if (scope.actorId !== row.author_id) fail("SHARE_FORBIDDEN", "仅作者可处理分享", 403);
    if (input.action === "approve" && row.status !== "requested" || input.action === "reject" && row.status !== "requested" || input.action === "revoke" && !["offered", "requested", "approved"].includes(row.status))
      fail("SHARE_STATE_CONFLICT", "此分享状态不支持当前操作");
  }
}
export type ApprovalPreparation = { shareId: string; requesterId: string; source: CanvasShareSource; snapshot: ShareSnapshot; digest: string };
export async function prepareApprovalTx(tx: PoolClient, scope: ShareScope, id: string, raw: unknown): Promise<ApprovalPreparation | CanvasShare> {
  const input = shareChangeSchema.parse(raw); if (input.action !== "approve") fail("SHARE_INVALID_ACTION", "批准操作无效", 400);
  const operation = await operationTx(tx, scope, input.operationId, { id, change: input }); if (operation.replay) return operation.replay;
  const row = await rowTx(tx, scope, id, true); authorizeChange(row, scope, input);
  const source = input.source || row.source; if (!source) fail("SHARE_SOURCE_REQUIRED", "请作者选择需要授权的作品或画布", 400);
  const snapshot = await captureShareSnapshotTx(tx, row.author_id, scope.enterpriseId, source);
  return { shareId: id, requesterId: row.requester_id, source, snapshot, digest: operation.digest };
}
export async function changeShareTx(tx: PoolClient, scope: ShareScope, id: string, raw: unknown, approval?: { prepared: ApprovalPreparation; stage: StagedMedia }): Promise<CanvasShare> {
  const input = shareChangeSchema.parse(raw), operation = await operationTx(tx, scope, input.operationId, { id, change: input }); if (operation.replay) return operation.replay;
  const row = await rowTx(tx, scope, id, true); authorizeChange(row, scope, input);
  let project = row.result_project_key, snapshot: ShareSnapshot | null = null;
  if (input.action === "approve") {
    if (!approval || approval.prepared.digest !== operation.digest || approval.prepared.shareId !== id || approval.prepared.requesterId !== row.requester_id) fail("SHARE_APPROVAL_NOT_PREPARED", "批准内容未准备完整");
    // Both accounts are locked in canonical order before touching either graph: reciprocal sharing cannot deadlock.
    for (const actor of [row.author_id, row.requester_id].sort()) {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [actor]);
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
    }
    snapshot = await captureShareSnapshotTx(tx, row.author_id, scope.enterpriseId, approval.prepared.source);
    if (snapshot.digest !== approval.prepared.snapshot.digest) fail("SHARE_SOURCE_CHANGED", "源内容已改变，请重新确认后批准");
    project = await createShareCopyTx(tx, row.id, row.requester_id, scope.enterpriseId, snapshot, approval.stage);
  }
  const status = ({ request: "requested", approve: "approved", reject: "rejected", revoke: "revoked" } as const)[input.action];
  const saved = (await tx.query(`UPDATE app_canvas_shares SET status=$3,version=version+1,updated_at=now(),result_project_key=$4,
    title=COALESCE($5,title),kind=COALESCE($6,kind),source=COALESCE($7::jsonb,source),snapshot=COALESCE($8::jsonb,snapshot),snapshot_digest=COALESCE($9,snapshot_digest),
    preview=CASE WHEN $3 IN ('rejected','revoked') THEN NULL ELSE COALESCE($10::jsonb,preview) END
    WHERE id=$1 AND version=$2 RETURNING *`, [row.id, input.expectedVersion, status, project, snapshot?.title || null, snapshot?.source.kind || null,
    snapshot ? JSON.stringify(snapshot.source) : null, snapshot ? JSON.stringify(snapshot) : null, snapshot?.digest || null,
    snapshot ? JSON.stringify(selectedPreview(snapshot)) : null])).rows[0] as ShareRow | undefined;
  if (!saved) fail("SHARE_VERSION_CONFLICT", "分享状态已更新");
  // Approved previews point at the recipient's durable bytes; revocation only removes the share capability, not their copy.
  if (snapshot && saved.preview && !("diagram" in saved.preview) && approval) {
    const previewKey = saved.preview.key, copied = approval.stage.media.find(m => m.key === previewKey)!;
    saved.preview = { ...saved.preview, key: copied.targetKey };
    await tx.query("UPDATE app_canvas_shares SET preview=$2::jsonb WHERE id=$1", [id, JSON.stringify(saved.preview)]);
  }
  await saveOperationTx(tx, scope, input.operationId, operation.digest, row.id);
  await emitCollaborationEventTx(tx, scope.enterpriseId, ["shares"], [row.author_id, row.requester_id]);
  return shareCard(saved, scope.actorId);
}
export async function listSharesTx(tx: PoolClient, scope: ShareScope, direction: string, cursor?: string | null): Promise<CollaborationPage<CanvasShare>> {
  if (!["sent", "received"].includes(direction)) fail("SHARE_DIRECTION_INVALID", "分享列表方向无效", 400);
  let after: { time: string; id: string } | null = null;
  if (cursor) { try { after = JSON.parse(Buffer.from(cursor, "base64url").toString()); if (!after || typeof after.time !== "string" || !Number.isFinite(Date.parse(after.time)) || !/^[a-f\d-]{36}$/.test(after.id)) throw new Error(); } catch { fail("SHARE_CURSOR_INVALID", "分页游标无效", 400); } }
  const rows = (await tx.query(`SELECT *,created_at::text AS cursor_time FROM app_canvas_shares WHERE enterprise_id=$1 AND ${direction === "sent" ? "author_id" : "requester_id"}=$2
    AND author_id=ANY($3::text[]) AND requester_id=ANY($3::text[]) AND ($4::timestamptz IS NULL OR (created_at,id)<($4::timestamptz,$5::uuid))
    ORDER BY created_at DESC,id DESC LIMIT 51`, [scope.enterpriseId, scope.actorId, [...scope.memberIds], after?.time || null, after?.id || null])).rows as Array<ShareRow & { cursor_time: string }>;
  const page = rows.slice(0, 50), last = page.at(-1);
  return { items: page.map(row => shareCard(row, scope.actorId)), nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ time: last.cursor_time, id: last.id })).toString("base64url") : null };
}
export async function getSharePreviewTx(tx: PoolClient, scope: ShareScope, id: string): Promise<SharePreview> {
  const row = await rowTx(tx, scope, id);
  if (!row.preview || ["revoked", "rejected"].includes(row.status)) fail("SHARE_PREVIEW_UNAVAILABLE", "分享没有可用预览", 404);
  return row.preview;
}
/** Message module must call only for kind=direct; arrays with a third participant (including duplicates) fail closed. */
export async function validateShareForMessageTx(tx: PoolClient, actorId: string, enterpriseId: string, conversationMemberIds: readonly string[], shareId: string): Promise<void> {
  // A fabricated card before the first shares request is a denied reference, not a schema error or nested initialization.
  if (!(await tx.query("SELECT to_regclass('app_canvas_shares') AS present")).rows[0].present) fail("SHARE_MESSAGE_FORBIDDEN", "分享卡片不存在", 403);
  const row = (await tx.query("SELECT author_id,requester_id,status FROM app_canvas_shares WHERE id=$1 AND enterprise_id=$2 FOR SHARE", [shareId, enterpriseId])).rows[0];
  if (!row || ["revoked", "rejected"].includes(row.status) || conversationMemberIds.length !== 2 || new Set(conversationMemberIds).size !== 2 ||
    !conversationMemberIds.includes(row.author_id) || !conversationMemberIds.includes(row.requester_id) || ![row.author_id, row.requester_id].includes(actorId))
    fail("SHARE_MESSAGE_FORBIDDEN", "分享卡片仅可发送给指定双方", 403);
}
