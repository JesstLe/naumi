import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { USER_POSITIONS } from "@/lib/accounts/positions";
import { userCommandSchema } from "./user-management";

const assignedPosition = z.enum(USER_POSITIONS).refine(p => p !== "", "名单岗位不能为空");
export const positionRosterSchema = z.array(z.object({ name: z.string().trim().min(1).max(80), position: assignedPosition }).strict()).min(1).max(1000);
export const positionPlanSchema = z.object({
  version: z.literal(1),
  changes: z.array(z.object({ name: z.string(), from: z.enum(USER_POSITIONS), command: userCommandSchema.refine(c => c.action === "position") }).strict()),
  already: z.array(z.object({ name: z.string(), email: z.string(), position: z.enum(USER_POSITIONS) }).strict()),
  unmatched: z.array(z.string()), ambiguous: z.array(z.string()),
}).strict();
export type PositionPlan = z.infer<typeof positionPlanSchema>;
export type PositionCandidate = { email: string; name: string; position: string; management_version: number };

/** Pure matching: exact names only, never guess among duplicate accounts. */
export function planPositionBindings(input: unknown, users: PositionCandidate[]): PositionPlan {
  const roster = positionRosterSchema.parse(input);
  const unique = new Map<string, string>();
  for (const row of roster) {
    if (unique.has(row.name) && unique.get(row.name) !== row.position) throw new Error("同一花名存在不同岗位");
    unique.set(row.name, row.position);
  }
  const plan: PositionPlan = { version: 1, changes: [], already: [], unmatched: [], ambiguous: [] };
  for (const [name, position] of unique) {
    const matches = users.filter(u => u.name === name);
    if (!matches.length) { plan.unmatched.push(name); continue; }
    if (matches.length > 1) { plan.ambiguous.push(name); continue; }
    const user = matches[0];
    if (user.position === position) { plan.already.push({ name, email: user.email, position: USER_POSITIONS.find(p => p === position)! }); continue; }
    const command = userCommandSchema.parse({ id: randomUUID(), action: "position", email: user.email,
      reason: "部门岗位名单绑定", expectedVersion: user.management_version, position });
    if (command.action !== "position") throw new Error("岗位命令类型无效");
    plan.changes.push({ name, from: z.enum(USER_POSITIONS).parse(user.position), command });
  }
  return plan;
}
