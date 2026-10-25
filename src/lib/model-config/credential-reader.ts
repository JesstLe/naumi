import "server-only";
import type {Pool} from "pg";
import {decryptAtRest} from "../settings";
import {ModelConfigError} from "./types";

/** Reads only frozen credential references; it never discovers or changes keys.
 * Management supplies readiness, while already-published execution stays read-only. */
export function createCredentialReader(pool:Pool,ensureReady?:()=>Promise<void>){return {async read(id: string, providerId: string) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ModelConfigError("CREDENTIAL_UNAVAILABLE", "供应商凭据不可用", 503);
      if(ensureReady)await ensureReady();
      const row = (await pool.query("SELECT key_enc FROM app_model_credentials WHERE id=$1 AND provider_id=$2", [id, providerId])).rows[0];
      const value = row && decryptAtRest(row.key_enc);
      if (!value) throw new ModelConfigError("CREDENTIAL_UNAVAILABLE", "供应商凭据不可用", 503);
      return value;
    }};}
export type CredentialReader=ReturnType<typeof createCredentialReader>;
