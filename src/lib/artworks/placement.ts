import type { Pool } from "pg";

/** A generated result may initialize an empty position, never reposition an
 * already attached or manually moved artwork. The decision and write share one
 * row update, so late callbacks cannot win a read-then-write race with dragging.
 * Explicit user moves retain the existing overwrite behavior. */
export async function writeArtworkPosition(
  pool: Pick<Pool, "query">,
  email: string,
  id: string,
  x: number,
  y: number,
  initializeOnly = false,
): Promise<boolean> {
  if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const result = await pool.query(
    `UPDATE app_artworks SET
       canvas_x = CASE WHEN $5 AND (canvas_x IS NOT NULL OR canvas_y IS NOT NULL) THEN canvas_x ELSE $3 END,
       canvas_y = CASE WHEN $5 AND (canvas_x IS NOT NULL OR canvas_y IS NOT NULL) THEN canvas_y ELSE $4 END
     WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id, x, y, initializeOnly],
  );
  // An existing owned position is an idempotent success, not a missing artwork.
  return (result.rowCount ?? 0) > 0;
}
