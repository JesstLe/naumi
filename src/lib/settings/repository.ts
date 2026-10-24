import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "../persistence/schema";
import type {PoolClient} from "pg";

/** Raw persisted strings, not effective/decrypted configuration. Null means
 * absent; empty/false-like strings and database errors are preserved. */
export async function getSetting(k: string, tx?: PoolClient): Promise<string | null> {
  // A caller-owned transaction starts after schema initialization.
  if (!tx) await ensureSchema();
  const { rows } = await (tx ?? getPool()).query(
    `SELECT v FROM app_settings WHERE k = $1`,
    [k]
  );
  return rows[0] ? (rows[0].v as string) : null;
}

export async function setSetting(k: string, v: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_settings (k, v, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`,
    [k, v]
  );
}
