import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getPool } from "@/platform/db/pool";
import { ensureBiSchema } from "./schema";

export type ManagementLogEntry = {
  actor: string;
  /** Affected account email, or a typed subject such as `ip:1.2.3.4`. */
  subject: string;
  action: string;
  reason?: string;
  /** Before/after facts only. Never pass passwords, tokens or other secrets. */
  changes: Record<string, unknown>;
};

/** Append one record to the admin management log shown under 系统与审计 → 管理日志. */
export async function appendManagementLog(entry: ManagementLogEntry): Promise<string> {
  await ensureBiSchema();
  const id = `admin-${randomUUID()}`;
  const fingerprint = createHash("sha256").update(JSON.stringify([entry.action, entry.subject, entry.changes])).digest("hex");
  await getPool().query(
    "INSERT INTO app_bi_management_log(id,actor,email,action,reason,changes,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)",
    [id, entry.actor.slice(0, 254), entry.subject.slice(0, 254), entry.action.slice(0, 64), (entry.reason || "").slice(0, 500), JSON.stringify(entry.changes), fingerprint],
  );
  return id;
}

/**
 * Legacy entry points write through their own repositories, so the record is
 * appended after the change succeeds. A logging failure is reported to the
 * server log and does not turn a completed change into an error response.
 */
export async function appendManagementLogAfterChange(entry: ManagementLogEntry): Promise<void> {
  try {
    await appendManagementLog(entry);
  } catch (error) {
    console.error(`[admin-audit] failed to record ${entry.action} for ${entry.subject}:`, error instanceof Error ? error.message : error);
  }
}
