import "server-only";
import { getPool } from "@/platform/db/pool";
import { ensureSchema } from "@/lib/persistence/schema";

export class AccountChangeError extends Error {
  constructor(message: string, readonly status = 403) {
    super(message);
    this.name = "AccountChangeError";
  }
}

export type AccountChange =
  | { kind: "role"; role: "admin" | "user" }
  | { kind: "ban"; banned: boolean }
  | { kind: "delete" }
  | { kind: "reset-password" };

/**
 * Account-safety rule for admin entry points: an operator cannot change their
 * own access from the admin console, an active administrator must be demoted
 * before being banned or deleted, and the last active administrator cannot be
 * demoted. The BI user manager enforces the same rule inside its own
 * transaction; legacy entry points call this before their write.
 */
export function accountChangeViolation(input: {
  actor: string;
  target: string;
  change: AccountChange;
  targetRole: string | null;
  targetBanned: boolean;
  activeAdmins: number;
}): string | null {
  if (input.actor.trim().toLowerCase() === input.target.trim().toLowerCase()) return "请在个人安全设置管理自己的账户";
  if (input.targetRole !== "admin" || input.targetBanned) return null;
  if (input.change.kind === "ban" && input.change.banned) return "请先调整管理员权限，再封禁账户";
  if (input.change.kind === "delete") return "请先调整管理员权限，再删除账户";
  if (input.change.kind === "role" && input.change.role !== "admin" && input.activeAdmins <= 1) return "不能撤销最后一个有效管理员";
  return null;
}

export async function assertAccountChangeAllowed(actor: string, target: string, change: AccountChange): Promise<void> {
  await ensureSchema();
  const email = target.trim().toLowerCase();
  const pool = getPool();
  const row = (await pool.query("SELECT role,banned FROM app_users WHERE email=$1", [email])).rows[0] as { role?: string; banned?: boolean } | undefined;
  const demotingActiveAdmin = change.kind === "role" && change.role !== "admin" && row?.role === "admin" && !row.banned;
  const activeAdmins = demotingActiveAdmin
    ? Number((await pool.query("SELECT count(*)::int AS n FROM app_users WHERE role='admin' AND NOT banned")).rows[0].n)
    : 0;
  const violation = accountChangeViolation({ actor, target: email, change, targetRole: row?.role ?? null, targetBanned: !!row?.banned, activeAdmins });
  if (violation) throw new AccountChangeError(violation);
}
