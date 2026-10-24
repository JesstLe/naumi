import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";

// Historical account-owned provider records. New BYOK execution remains retired.
// Preserve stored bytes and the existing save/activation contract; no credential migration.

export type UserImageProviderRecord = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  enabled: boolean;
  protocol: "openai-images" | "chat-completions";
  baseUrlEnc: string;
  apiKeyEnc: string;
  models: string[];
  defaultModel: string;
  updatedAt: string;
};

function providerRowToRecord(row: Record<string, unknown>): UserImageProviderRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name || "未命名供应商"),
    isActive: !!row.is_active,
    enabled: !!row.enabled,
    protocol:
      row.protocol === "chat-completions" ? "chat-completions" : "openai-images",
    baseUrlEnc: String(row.base_url_enc || ""),
    apiKeyEnc: String(row.api_key_enc || ""),
    models: Array.isArray(row.models) ? row.models.map(String) : [],
    defaultModel: String(row.default_model || ""),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

const PROVIDER_COLUMNS = `id, email, name, is_active, enabled, protocol, base_url_enc,
                          api_key_enc, models, default_model, updated_at`;

export async function listUserImageProviderRecords(
  emailRaw: string
): Promise<UserImageProviderRecord[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT ${PROVIDER_COLUMNS}
       FROM app_user_image_providers
      WHERE email = $1
      ORDER BY is_active DESC, updated_at DESC`,
    [emailRaw.toLowerCase()]
  );
  return rows.map((row) => providerRowToRecord(row as Record<string, unknown>));
}

export async function getUserImageProviderRecord(
  emailRaw: string
): Promise<UserImageProviderRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT ${PROVIDER_COLUMNS}
       FROM app_user_image_providers
      WHERE email = $1 AND is_active
      ORDER BY updated_at DESC
      LIMIT 1`,
    [emailRaw.toLowerCase()]
  );
  const row = rows[0];
  return row ? providerRowToRecord(row as Record<string, unknown>) : null;
}

export async function getUserImageProviderRecordById(
  emailRaw: string,
  id: string
): Promise<UserImageProviderRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT ${PROVIDER_COLUMNS}
       FROM app_user_image_providers
      WHERE email = $1 AND id = $2`,
    [emailRaw.toLowerCase(), id]
  );
  const row = rows[0];
  return row ? providerRowToRecord(row as Record<string, unknown>) : null;
}

export async function countUserImageProviderRecords(emailRaw: string): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT count(*)::int AS n FROM app_user_image_providers WHERE email = $1`,
    [emailRaw.toLowerCase()]
  );
  return Number(rows[0]?.n ?? 0);
}

export async function upsertUserImageProviderRecord(
  record: Omit<UserImageProviderRecord, "email" | "updatedAt"> & { email: string }
): Promise<UserImageProviderRecord> {
  await ensureSchema();
  const id = record.id || `prov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await getPool().query(
    `INSERT INTO app_user_image_providers
       (id, email, name, is_active, enabled, protocol, base_url_enc, api_key_enc,
        models, default_model, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       is_active = EXCLUDED.is_active,
       enabled = EXCLUDED.enabled,
       protocol = EXCLUDED.protocol,
       base_url_enc = EXCLUDED.base_url_enc,
       api_key_enc = EXCLUDED.api_key_enc,
       models = EXCLUDED.models,
       default_model = EXCLUDED.default_model,
       updated_at = now()
     RETURNING ${PROVIDER_COLUMNS}`,
    [
      id,
      record.email.toLowerCase(),
      record.name,
      record.isActive,
      record.enabled,
      record.protocol,
      record.baseUrlEnc,
      record.apiKeyEnc,
      JSON.stringify(record.models),
      record.defaultModel,
    ]
  );
  return providerRowToRecord(rows[0] as Record<string, unknown>);
}

/** 激活一个供应商(事务内取消同用户其他激活;同用户仅一个生效,目录只合并激活方)。 */
export async function activateUserImageProviderRecord(
  emailRaw: string,
  id: string
): Promise<boolean> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE app_user_image_providers SET is_active = true, enabled = true, updated_at = now()
        WHERE email = $1 AND id = $2 RETURNING id`,
      [emailRaw.toLowerCase(), id]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      `UPDATE app_user_image_providers SET is_active = false, enabled = false, updated_at = now()
        WHERE email = $1 AND id <> $2`,
      [emailRaw.toLowerCase(), id]
    );
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteUserImageProviderRecord(
  emailRaw: string,
  id?: string
): Promise<boolean> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  if (id) {
    const result = await getPool().query(
      `DELETE FROM app_user_image_providers WHERE email = $1 AND id = $2`,
      [email, id]
    );
    return (result.rowCount ?? 0) > 0;
  }
  const result = await getPool().query(
    `DELETE FROM app_user_image_providers WHERE email = $1`,
    [email]
  );
  return (result.rowCount ?? 0) > 0;
}
