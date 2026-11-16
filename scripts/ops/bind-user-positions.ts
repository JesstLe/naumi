import { readFile, writeFile } from "node:fs/promises";
import { getPool } from "../../src/platform/db/pool";
import { planPositionBindings, positionPlanSchema } from "../../src/lib/bi/position-binding";
import { manageBiUser } from "../../src/lib/bi/user-management";
import { enterpriseSiteIdentity } from "../../src/lib/site-control/identity";

// Plan first, apply the saved commands second. The plan contains private roster
// data: store it outside Git. Reuse it verbatim after an interrupted application.
async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (enterpriseSiteIdentity()) throw new Error("Dedicated sites must use scoped enterprise member commands");
  const pool = getPool();
  try {
    if (!args.includes("--apply")) {
      const roster = option("--roster"), out = option("--out");
      if (!roster || !out) throw new Error("Use --roster FILE --out PLAN; then --apply --plan PLAN --actor ADMIN");
      // Read only: do not initialize schema or create accounts during planning.
      const users = (await pool.query("SELECT email,name,position,management_version FROM app_users ORDER BY email")).rows;
      const plan = planPositionBindings(JSON.parse(await readFile(roster, "utf8")), users);
      await writeFile(out, JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      console.log(`BIND_USER_POSITIONS=DRY_RUN pending=${plan.changes.length} already=${plan.already.length} unmatched=${plan.unmatched.length} ambiguous=${plan.ambiguous.length} writes=0`);
      if (plan.unmatched.length || plan.ambiguous.length) process.exitCode = 2;
      return;
    }
    const input = option("--plan"), actor = option("--actor");
    if (!input || !actor) throw new Error("Apply requires --plan FILE --actor ADMIN");
    const plan = positionPlanSchema.parse(JSON.parse(await readFile(input, "utf8")));
    if (plan.unmatched.length || plan.ambiguous.length) throw new Error("Resolve unmatched/ambiguous accounts before applying");
    if (new Set(plan.changes.map(c => c.command.email)).size !== plan.changes.length) throw new Error("Duplicate target account in plan");
    let applied = 0, replayed = 0;
    for (const row of plan.changes) {
      const admin = (await pool.query("SELECT email FROM app_users WHERE email=$1 AND role='admin' AND NOT banned AND (account_expires_at IS NULL OR account_expires_at>now())", [actor])).rows[0];
      if (!admin) throw new Error("An active platform administrator is required");
      const result = await manageBiUser(row.command, actor);
      if (result.replayed) replayed++; else applied++;
      console.log(`POSITION_COMMAND=${row.command.id} RESULT=${result.replayed ? "REPLAYED" : "APPLIED"}`);
    }
    // Historical receipts must not masquerade as current-state proof. A later
    // administrator edit wins; report drift without replaying a new write.
    const expected = [...plan.changes.map(row => ({ email: row.command.email, name: row.name, position: row.command.action === "position" ? row.command.position : "" })), ...plan.already];
    const current = (await pool.query("SELECT email,name,position FROM app_users WHERE email=ANY($1::text[])", [expected.map(row => row.email)])).rows;
    const mismatches = expected.filter(row => !current.some(user => user.email === row.email && user.name === row.name && user.position === row.position));
    console.log(`BIND_USER_POSITIONS=${mismatches.length ? "MISMATCH" : "VERIFIED"} applied=${applied} replayed=${replayed} already=${plan.already.length} verified=${expected.length - mismatches.length} mismatches=${mismatches.length}`);
    if (mismatches.length) process.exitCode = 2;
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Position binding failed"); process.exitCode = 1; });
