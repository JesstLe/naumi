import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { decryptAtRest, decryptFromClient, encryptAtRest } from "../settings";
import { ensureModelSchema } from "./schema";
import { ModelConfigError } from "./types";

export function createCredentialStore(pool: Pool) {
  const importPlain = async (input: { providerId: string; plain: string; actor: string }, tx?: PoolClient) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(input.providerId) || !input.actor || input.actor.length > 254 || !input.plain.trim() || input.plain.length > 16384)
      throw new ModelConfigError("INVALID_CREDENTIAL", "供应商凭据无效");
    await ensureModelSchema(pool);
    const id = randomUUID();
    await (tx || pool).query("INSERT INTO app_model_credentials(id,provider_id,key_enc,created_by) VALUES($1,$2,$3,$4)", [id, input.providerId, encryptAtRest(input.plain), input.actor]);
    return { id, providerId: input.providerId, configured: true as const };
  };
  return {
    importPlain,
    async saveEncrypted(input: { providerId: string; ciphertext: string; actor: string }) {
      if (typeof input.ciphertext !== "string" || input.ciphertext.length > 32768) throw new ModelConfigError("INVALID_CREDENTIAL", "凭据密文无效");
      let plain: string;
      try { plain = await decryptFromClient(input.ciphertext); } catch { throw new ModelConfigError("INVALID_CREDENTIAL", "凭据密文无法验证"); }
      return importPlain({ providerId: input.providerId, plain, actor: input.actor });
    },
    async read(id: string, providerId: string) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ModelConfigError("CREDENTIAL_UNAVAILABLE", "供应商凭据不可用", 503);
      await ensureModelSchema(pool);
      const row = (await pool.query("SELECT key_enc FROM app_model_credentials WHERE id=$1 AND provider_id=$2", [id, providerId])).rows[0];
      const value = row && decryptAtRest(row.key_enc);
      if (!value) throw new ModelConfigError("CREDENTIAL_UNAVAILABLE", "供应商凭据不可用", 503);
      return value;
    },
  };
}
