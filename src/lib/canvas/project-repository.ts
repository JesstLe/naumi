import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";

// --- 画布项目名(用户给血缘树/套图批次起的自定义名字) -------------------------
export async function getProjectNames(
  emailRaw: string
): Promise<Record<string, string>> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT key, name FROM app_project_names WHERE email = $1`,
    [emailRaw.toLowerCase()]
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.name;
  return out;
}

export async function setProjectName(
  emailRaw: string,
  key: string,
  nameRaw: string
): Promise<void> {
  await ensureSchema();
  const name = nameRaw.trim().slice(0, 60);
  const email = emailRaw.toLowerCase();
  if (!key || !name) return;
  await getPool().query(
    `INSERT INTO app_project_names (email, key, name, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (email, key) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
    [email, key, name]
  );
}

export async function deleteProjectName(
  emailRaw: string,
  key: string
): Promise<void> {
  await ensureSchema();
  if (!key) return;
  await getPool().query(
    `DELETE FROM app_project_names WHERE email = $1 AND key = $2`,
    [emailRaw.toLowerCase(), key]
  );
}
