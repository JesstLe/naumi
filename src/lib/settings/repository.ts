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

/** Batched raw read; absent/empty values and failures are preserved. No cache. */
export async function getSettings(keys: readonly string[]): Promise<Record<string, string | null>> {
  const values: Record<string, string | null> = Object.create(null);
  const uniqueKeys = Array.from(new Set(keys));
  if (!uniqueKeys.length) return values;
  for (const key of uniqueKeys) values[key] = null;
  await ensureSchema();
  const { rows } = await getPool().query<{ k: string; v: string }>(
    `SELECT k, v FROM app_settings WHERE k = ANY($1::text[])`,
    [uniqueKeys]
  );
  for (const row of rows) values[row.k] = row.v;
  return values;
}

/** Commit a fully prepared settings plan on one connection; no partial field writes. */
export async function setSettingsAtomically(entries: readonly (readonly [string, string])[]): Promise<void> {
  if (!entries.length) return;
  await ensureSchema();
  const tx = await getPool().connect();
  try {
    await tx.query("BEGIN");
    for (const [key, value] of entries) {
      await tx.query(`INSERT INTO app_settings(k,v,updated_at) VALUES($1,$2,now())
        ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v,updated_at=now()`, [key,value]);
    }
    await tx.query("COMMIT");
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally { tx.release(); }
}
