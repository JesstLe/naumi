import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import type {ArtworkRecord,AdminArtwork} from "./types";

function rowToAdminArtwork(r: {
  id: string;
  email: string;
  title: string;
  category: string;
  prompt: string;
  status: string;
  image_url: string;
  gradient: string;
  style: string | null;
  ratio: string | null;
  resolution: string | null;
  source_url: string | null;
  batch_id: string | null;
  image_width: number | null;
  image_height: number | null;
  processing_kind?: ArtworkRecord["processingKind"];
  postprocess_status?: ArtworkRecord["postprocessStatus"];
  created_at: Date;
}): AdminArtwork {
  return {
    id: r.id,
    email: r.email,
    title: r.title,
    category: r.category,
    prompt: r.prompt,
    status: r.status,
    image: r.image_url,
    gradient: r.gradient,
    style: r.style ?? null,
    ratio: r.ratio ?? null,
    resolution: r.resolution ?? null,
    source: r.source_url ?? null,
    batchId: r.batch_id ?? null,
    width: r.image_width ?? null,
    height: r.image_height ?? null,
    processingKind: r.processing_kind ?? null,
    postprocessStatus: r.postprocess_status ?? null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

const ADMIN_ARTWORK_COLS = `id, email, title, category, prompt, status,
  image_url, gradient, style, ratio, resolution, source_url, batch_id, image_width, image_height, processing_kind, postprocess_status,
  created_at`;

/** Admin: every user's artworks, newest first, with owner email + total. */
export async function listAllArtworks(
  limit = 24,
  offset = 0
): Promise<{ artworks: AdminArtwork[]; total: number }> {
  await ensureSchema();
  const lim = Math.min(Math.max(Math.trunc(limit) || 24, 1), 100);
  const off = Math.max(Math.trunc(offset) || 0, 0);
  const [rowsRes, cntRes] = await Promise.all([
    getPool().query(
      `SELECT ${ADMIN_ARTWORK_COLS} FROM app_artworks
        ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [lim, off]
    ),
    getPool().query(`SELECT count(*)::int AS n FROM app_artworks`),
  ]);
  return {
    artworks: rowsRes.rows.map(rowToAdminArtwork),
    total: cntRes.rows[0].n,
  };
}

/** Admin: a single artwork by id (used when importing into the template lib). */
export async function getArtworkById(id: string): Promise<AdminArtwork | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT ${ADMIN_ARTWORK_COLS} FROM app_artworks WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToAdminArtwork(rows[0]) : null;
}

/** Admin delete retains the original template-reference check before media cleanup. */
export async function deleteArtwork(id: string): Promise<boolean> {
  await ensureSchema();
  // Get the image_url before deleting (need it for R2 cleanup).
  const got = await getPool().query(
    `SELECT image_url FROM app_artworks WHERE id = $1`,
    [id]
  );
  const imageUrl = (got.rows[0]?.image_url as string | undefined) || "";

  const r = await getPool().query(`DELETE FROM app_artworks WHERE id = $1`, [
    id,
  ]);
  if ((r.rowCount ?? 0) === 0) return false;

  // Garbage-collect the R2 object if nothing else uses it.
  if (imageUrl) {
    const used = await getPool().query(
      `SELECT 1 FROM app_templates WHERE image = $1 LIMIT 1`,
      [imageUrl]
    );
    if ((used.rowCount ?? 0) === 0) {
      // Fire-and-forget; failure isn't critical and shouldn't block the response.
      const { deleteImageByUrl } = await import("@/lib/storage");
      void deleteImageByUrl(imageUrl).catch(() => { console.warn("STORAGE_CLEANUP_PENDING operation=delete-template-media"); });
    }
  }
  return true;
}

/** Given artwork ids, returns the subset already imported into the template
 *  library (template id convention: `tpl-art-<artworkId>`). */
export async function importedArtworkIds(ids: string[]): Promise<string[]> {
  await ensureSchema();
  if (ids.length === 0) return [];
  const tplIds = ids.map((id) => `tpl-art-${id}`);
  const { rows } = await getPool().query(
    `SELECT id FROM app_templates WHERE id = ANY($1)`,
    [tplIds]
  );
  return rows.map((r) => (r.id as string).replace(/^tpl-art-/, ""));
}
