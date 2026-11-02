import "server-only";
import { withCollaborationScope } from "../enterprise/collaboration-access";
import { ensureCanvasSharingSchema } from "./schema";
import { shareChangeSchema, fingerprint, fail } from "./domain";
import { createShareTx, changeShareTx, prepareApprovalTx, getShareTx, listSharesTx, getSharePreviewTx } from "./service";
import { cleanupStagedMedia, copyStagedMedia, prepareMediaStaging, renderSharePreview } from "./media";

export async function createShare(email: string, enterpriseId: string, input: unknown) {
  await ensureCanvasSharingSchema(); return withCollaborationScope(email, enterpriseId, (tx, scope) => createShareTx(tx, scope, input));
}
export async function getShare(email: string, enterpriseId: string, id: string) {
  await ensureCanvasSharingSchema(); return withCollaborationScope(email, enterpriseId, (tx, scope) => getShareTx(tx, scope, id));
}
export async function listShares(email: string, enterpriseId: string, direction: string, cursor?: string | null) {
  await ensureCanvasSharingSchema(); return withCollaborationScope(email, enterpriseId, (tx, scope) => listSharesTx(tx, scope, direction, cursor));
}
export async function changeShare(email: string, enterpriseId: string, id: string, raw: unknown) {
  const input = shareChangeSchema.parse(raw); await ensureCanvasSharingSchema();
  if (input.action !== "approve") return withCollaborationScope(email, enterpriseId, (tx, scope) => changeShareTx(tx, scope, id, input));
  const prepared = await withCollaborationScope(email, enterpriseId, (tx, scope) => prepareApprovalTx(tx, scope, id, input));
  if (!("snapshot" in prepared)) return prepared;
  const stage = await prepareMediaStaging(id, prepared.snapshot);
  try {
    await copyStagedMedia(stage);
    return await withCollaborationScope(email, enterpriseId, (tx, scope) => changeShareTx(tx, scope, id, input, { prepared, stage }));
  } finally {
    // Checks the journal even when COMMIT/ACK is unknown. Never deletes a committed recipient's object.
    await cleanupStagedMedia(stage.attemptId).catch(() => { console.warn("CANVAS_SHARE_CLEANUP_PENDING"); });
  }
}
export async function getSharePreview(email: string, enterpriseId: string, id: string) {
  await ensureCanvasSharingSchema();
  const media = await withCollaborationScope(email, enterpriseId, (tx, scope) => getSharePreviewTx(tx, scope, id));
  const bytes = await renderSharePreview(media);
  // Long storage reads cannot race a revocation or membership removal into a fresh response.
  await withCollaborationScope(email, enterpriseId, async (tx, scope) => {
    const current = await getSharePreviewTx(tx, scope, id);
    if (fingerprint(current) !== fingerprint(media)) fail("SHARE_PREVIEW_CHANGED", "分享预览已改变");
  }); return bytes;
}
