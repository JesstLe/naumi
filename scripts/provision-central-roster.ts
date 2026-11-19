/** Preparation/apply tool. No production writes unless --apply is explicitly supplied. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { z } from "zod";
import {
  identityDirectory,
  mutateIdentity,
} from "../src/lib/enterprise/identity/service";
import { centralAccountCommand } from "../src/lib/enterprise/identity/accounts";
import { getPool } from "../src/platform/db/pool";
import {
  organizationSchema,
  DESIGN_GROUPS,
  type Organization,
  PRODUCT_ROLES,
} from "../src/lib/enterprise/identity/contracts";
import { existingRosterIdentityMatches } from "./lib/central-roster-identity";
import { loginIdentifierToEmail } from "../src/lib/account-identity";
const planSchema = z.object({
  enterpriseId: z.string().uuid(),
  ownerEmail: z.string(),
  members: z
    .array(
      z.object({
        name: z.string(),
        email: z.string(),
        title: z.enum([
          "system_admin",
          "administrator",
          "design_director",
          "design_supervisor",
          "designer",
          "operations",
        ]),
        homeGroup: z.enum([
          "ecommerce-senior",
          "ecommerce-production",
          "packaging",
          "ui",
          "operations",
          "management",
        ]),
        create: z.boolean(),
      }),
    )
    .length(202),
});
const eligibilitySchema = z.object({
  schemaVersion: z.literal(1),
  members: z.array(
    z.object({
      email: z.string(),
      name: z.string(),
      memberId: z.string().uuid(),
      grade: z.number().int().min(1).max(10),
      skills: z.array(z.string()),
      dailyCapacity: z.number(),
      roles: z.array(z.string()),
      active: z.boolean(),
    }),
  ),
});
function operationId(key: string) {
  const h = createHash("sha256")
    .update("naumi-central-roster-v1:" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
async function main() {
  const args = process.argv.slice(2),
    apply = args.includes("--apply");
  const option = (key: string) => {
    const i = args.indexOf(key);
    if (i < 0 || !args[i + 1]) throw Error("MISSING_" + key);
    return args[i + 1];
  };
  const plan = planSchema.parse(
      JSON.parse(await readFile(option("--plan"), "utf8")),
    ),
    eligibility = eligibilitySchema.parse(
      JSON.parse(await readFile(option("--eligibility"), "utf8")),
    );
  if (
    new Set(plan.members.map((m) => m.email)).size !== 202 ||
    plan.ownerEmail !== loginIdentifierToEmail("北方") ||
    plan.members
      .filter((m) => m.create)
      .map((m) => m.name)
      .sort()
      .join(",") !== "曲飞,舒隽"
  )
    throw Error("APPROVED_ROSTER_MISMATCH");
  const actor = { email: plan.ownerEmail, admin: false },
    dir = await identityDirectory(actor, plan.enterpriseId),
    initial = new Map<string, Record<string, any>>(
      dir.members.map((m) => [m.email, m] as [string, Record<string, any>]),
    );
  for (const m of plan.members.filter(
    (m) => m.create && initial.has(m.email),
  )) {
    const prior = (
      await getPool().query(
        "SELECT result FROM app_identity_receipts WHERE id=$1 AND enterprise_id=$2 AND actor=$3",
        [operationId(m.email + ":create"), plan.enterpriseId, plan.ownerEmail],
      )
    ).rows[0];
    const existing = initial.get(m.email);
    if (
      !prior ||
      prior.result.email !== m.email ||
      prior.result.subjectId !== existing?.subject_id ||
      existing?.name !== m.name
    )
      throw Error("NEW_IDENTITY_COLLISION:" + m.name);
  }
  const changes = plan.members.map((m) => {
    if (m.email !== loginIdentifierToEmail(m.name))
      throw Error("IDENTITY_PROVENANCE_CONFLICT");
    const current = initial.get(m.email),
      e = eligibility.members.find((e) => e.email === m.email);
    if (
      !m.create &&
      !existingRosterIdentityMatches(m, current as {email: string; name: string} | undefined, e)
    )
      throw Error("EXISTING_PERSON_IDENTITY_MISMATCH:" + m.name);
    if (m.create && current && !current.organization)
      throw Error("NEW_IDENTITY_COLLISION:" + m.name);
    const manager =
      m.title === "design_director" || m.title === "design_supervisor";
    const organization: Organization = organizationSchema.parse({
      title: m.title,
      homeGroup: m.homeGroup,
      managedGroups: manager ? [...DESIGN_GROUPS] : [],
      reviewGroups:
        current?.organization?.reviewGroups ??
        (manager &&
        e?.roles.includes("reviewer") &&
        DESIGN_GROUPS.includes(m.homeGroup as (typeof DESIGN_GROUPS)[number])
          ? [m.homeGroup]
          : []),
      canTakeDesignTasks:
        current?.organization?.canTakeDesignTasks ??
        (m.title === "designer" ||
          (manager && !!e?.roles.includes("designer"))),
      grade: current?.organization?.grade ?? e?.grade ?? 1,
      skills:
        current?.organization?.skills ??
        e?.skills ??
        (m.homeGroup === "ui" ? ["UI设计"] : []),
      dailyCapacity:
        current?.organization?.dailyCapacity ?? e?.dailyCapacity ?? 6,
    });
    const roles = [
      ...(m.title === "system_admin" || m.title === "administrator"
        ? ["admin"]
        : m.title === "design_director"
          ? ["director", "design_admin"]
          : m.title === "design_supervisor"
            ? ["design_admin"]
            : m.title === "designer"
              ? ["designer"]
              : ["operations"]),
      ...(manager && organization.reviewGroups.length ? ["reviewer"] : []),
      ...(manager && organization.canTakeDesignTasks ? ["designer"] : []),
    ];
    return { m, current, organization, roles };
  });
  const receipt: {
    email: string;
    action: string;
    inviteUrl?: string | null;
  }[] = [];
  if (!apply) {
    console.log(
      JSON.stringify({
        status: "PREPARATION_ONLY",
        cohort: changes.length,
        create: changes.filter((c) => !c.current).map((c) => c.m.name),
        untouchedOthers:
          dir.members.length -
          plan.members.filter((m) => initial.has(m.email)).length,
      }),
    );
    return;
  }
  const output = option("--private-receipt");
  await mkdir(dirname(output), { recursive: true });
  // Reserve the private receipt before any mutation; never print one-use invitations.
  await writeFile(output, JSON.stringify(receipt), { mode: 0o600, flag: "wx" });
  for (const c of changes) {
    if (!c.current) {
      const result = await centralAccountCommand(actor, {
        action: "create",
        id: operationId(c.m.email + ":create"),
        enterpriseId: plan.enterpriseId,
        username: c.m.name,
        name: c.m.name,
        organization: c.organization,
        roles: c.roles as (typeof PRODUCT_ROLES)[number][],
        reason: "批准的中央组织名册首次建号",
      });
      receipt.push({
        email: c.m.email,
        action: "created",
        ...("inviteUrl" in result ? { inviteUrl: result.inviteUrl } : {}),
      });
    } else if (
      !same(c.current.organization, c.organization) ||
      !same(c.current.roles, c.roles) ||
      !c.current.enabled
    ) {
      await mutateIdentity(actor, {
        action: "organization",
        id: operationId(
          c.m.email +
            ":organization:" +
            c.current.organization_version +
            ":" +
            c.current.grant_version,
        ),
        enterpriseId: plan.enterpriseId,
        email: c.m.email,
        expectedVersion: c.current.organization_version ?? 0,
        organization: c.organization,
        productConfiguration: {
          expectedVersion: c.current.grant_version ?? 0,
          enabled: true,
          roles: c.roles as (typeof PRODUCT_ROLES)[number][],
        },
        reason: "批准的中央组织名册与跨产品授权同步",
      });
      receipt.push({ email: c.m.email, action: "configured" });
    } else receipt.push({ email: c.m.email, action: "unchanged" });
    await writeFile(output, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  }
  const readback = await identityDirectory(actor, plan.enterpriseId);
  for (const c of changes) {
    const actual = readback.members.find((m) => m.email === c.m.email);
    if (
      !actual ||
      !same(actual.organization, c.organization) ||
      !same(actual.roles, c.roles) ||
      !actual.enabled
    )
      throw Error("ROSTER_READBACK_MISMATCH");
  }
  console.log(
    JSON.stringify({
      status: "APPLIED_AND_READ_BACK",
      cohort: changes.length,
      newAccounts: receipt.filter((r) => r.action === "created").length,
      privateReceipt: output,
    }),
  );
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "ROSTER_FAILED");
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
