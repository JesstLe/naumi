import "server-only";
import type { Pool } from "pg";
import { createHash } from "node:crypto";

// These handlers synchronously create one artwork before calling the common
// settlement function. Async tools and non-image responses keep their owners.
const operations: Record<string, string> = {
  "tool.dewatermark": "dewatermark", "tool.avatar": "avatar",
  "tool.extract": "extract", "tool.style": "style", "tool.upscale": "upscale",
  "tool.recolor": "recolor", "tool.replicate": "replicate", "tool.printfile":"printfile",
};
const marker = "tool-image-artwork-v1";
type Identity = { id: string; email: string; feature: string };
type Checkpoint = { receipt: typeof marker; feature: string; id: string; imageSha256: string };
type Artwork = { id: string; image_sha256: string; image_url?: string };

export function hasToolImageReceipt(feature: string): boolean {
  return Object.hasOwn(operations, feature);
}
export function isToolImageReceiptCheckpoint(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as { receipt?: unknown }).receipt === marker;
}

/** The caller already checked the original owner, request fingerprint and frozen
 * creation scope. Only exact server-route provenance counts; titles, timestamps,
 * source URLs and neighboring artworks never supply missing identity evidence. */
async function artwork(pool: Pick<Pool, "query">, operation: Identity, includeImage: boolean) {
  if (!hasToolImageReceipt(operation.feature)) return null;
  const result = await pool.query<Artwork>(
    `SELECT id, encode(sha256(convert_to(image_url,'UTF8')),'hex') AS image_sha256${includeImage ? ", image_url" : ""}
       FROM app_artworks
      WHERE email=$1 AND deleted_at IS NULL AND status='completed'
        AND image_url IS NOT NULL AND image_url<>''
        AND creation_provenance->>'ref'=$2
        AND creation_provenance->>'operation'=$3
        AND creation_provenance->>'evidence'='server-route'
      ORDER BY id LIMIT 2`,
    [operation.email.toLowerCase(), operation.id, operations[operation.feature]],
  );
  return result.rows.length === 1 ? result.rows[0] : null;
}

/** Small durable pointer, never another base64 copy in the billing row. */
export async function toolImageReceiptCheckpoint(
  pool: Pick<Pool, "query">, operation: Identity, expectedId?: string,
): Promise<Checkpoint | null> {
  const row = await artwork(pool, operation, false);
  if (!row || expectedId !== undefined && row.id !== expectedId) return null;
  return { receipt: marker, feature: operation.feature, id: row.id, imageSha256: row.image_sha256 };
}

/** Read-only recovery of a settled operation. This does not settle an UNKNOWN,
 * contact a supplier, recreate a deleted artwork, or infer a refund. */
export async function readSettledToolImageReceipt(
  pool: Pick<Pool, "query">,
  operation: Identity & { chargedCredits: number; checkpoint?: unknown },
) {
  if (!Number.isSafeInteger(operation.chargedCredits) || operation.chargedCredits < 0) return null;
  const saved = isToolImageReceiptCheckpoint(operation.checkpoint) ? operation.checkpoint as Partial<Checkpoint> : null;
  if (saved && (saved.feature !== operation.feature || typeof saved.id !== "string" || !saved.id ||
      typeof saved.imageSha256 !== "string" || !/^[a-f0-9]{64}$/.test(saved.imageSha256))) return null;
  const row = await artwork(pool, operation, true);
  if (!row?.image_url || saved && (row.id !== saved.id || row.image_sha256 !== saved.imageSha256)) return null;
  const old = operation.checkpoint as { ok?: unknown; id?: unknown; url?: unknown } | null;
  if (!saved && old?.ok === true && typeof old.url === "string" &&
      (createHash("sha256").update(old.url).digest("hex") !== row.image_sha256 ||
       typeof old.id === "string" && old.id !== row.id)) return null;
  // Both response shapes exist among these legacy tool clients.
  return { ok: true, id: row.id, url: row.image_url, creditsUsed: operation.chargedCredits, cost: operation.chargedCredits };
}
