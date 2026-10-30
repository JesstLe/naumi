import "server-only";
import type { Pool } from "pg";

const marker = "cutout-artwork-v1";

/** Keep image bytes in the artwork/media owner, not duplicated in a billing row. */
export function cutoutReceiptCheckpoint(payload: unknown) {
  const value = payload as { ok?: unknown; id?: unknown; url?: unknown; creditsUsed?: unknown } | null;
  if (value?.ok !== true || typeof value.id !== "string" || !value.id || typeof value.url !== "string" || !value.url) return null;
  return { receipt: marker, id: value.id };
}

export function isCutoutReceiptCheckpoint(payload: unknown): boolean {
  return !!payload && typeof payload === "object" && (payload as { receipt?: unknown }).receipt === marker;
}

/** Called only after the original operation's owner, request fingerprint and
 * creation scope have been checked, and only for a settled cutout. No supplier,
 * wallet mutation, deleted-artwork restoration or fuzzy historical matching. */
export async function readSettledCutoutReceipt(
  pool: Pick<Pool, "query">,
  operation: { id: string; email: string; chargedCredits: number; checkpoint?: unknown },
) {
  const expectedId = isCutoutReceiptCheckpoint(operation.checkpoint)
    ? (operation.checkpoint as { id?: unknown }).id : null;
  if (expectedId !== null && (typeof expectedId !== "string" || !expectedId)) return null;
  const { rows } = await pool.query<{ id: string; image_url: string }>(
    `SELECT id, image_url FROM app_artworks
       WHERE email=$1 AND deleted_at IS NULL AND status='completed'
         AND creation_provenance->>'ref'=$2
         AND creation_provenance->>'operation'='cutout'
         AND creation_provenance->>'evidence'='server-route'
         AND ($3::text IS NULL OR id=$3)
       ORDER BY id LIMIT 2`,
    [operation.email.toLowerCase(), operation.id, expectedId],
  );
  if (rows.length !== 1 || !rows[0].image_url) return null;
  return { ok: true, id: rows[0].id, url: rows[0].image_url, creditsUsed: operation.chargedCredits };
}
