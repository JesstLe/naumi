import {assertAccountCanJoinEnterprise} from "../../accounts/creation-policy-store";
import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "@/lib/pw";
import { loginIdentifierToEmail } from "@/lib/account-identity";
import { getPool } from "@/platform/db/pool";
import { TeamError } from "@/lib/teams/errors";
import { requireTeamGrant, type TeamActor } from "@/lib/teams/grants";
import { enterpriseIdentityTransaction } from "../server";
import { ensureIdentitySchema } from "./schema";
import {
  organizationSchema,
  assertGrantForOrganization,
  PRODUCT_ROLES,
} from "./contracts";
import {
  deploymentPolicy,
  assertEnterpriseAllowed,
} from "../integration/policy";

export const centralAccountSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      id: z.string().uuid(),
      enterpriseId: z.string().uuid(),
      username: z
        .string()
        .trim()
        .regex(/^[\p{L}\p{N}_-]{2,40}$/u),
      name: z.string().trim().min(1).max(80),
      organization: organizationSchema,
      roles: z
        .array(z.enum(PRODUCT_ROLES))
        .max(8)
        .refine((v) => new Set(v).size === v.length),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("status"),
      id: z.string().uuid(),
      enterpriseId: z.string().uuid(),
      email: z.string().min(1).max(254),
      expectedUserVersion: z.number().int().nonnegative(),
      enabled: z.boolean(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("invite"),
      id: z.string().uuid(),
      enterpriseId: z.string().uuid(),
      email: z.string().min(1).max(254),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
]);
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function identityIssuer() {
  const raw = process.env.NAUMI_IDENTITY_ISSUER;
  if (!raw) throw new TeamError("统一登录地址尚未配置", 503);
  const u = new URL(raw);
  if (
    (u.protocol !== "https:" &&
      !(u.protocol === "http:" && u.hostname === "127.0.0.1")) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new TeamError("统一登录地址无效", 503);
  return u.toString().replace(/\/$/, "");
}
export async function centralAccountCommand(
  actor: TeamActor,
  input: z.infer<typeof centralAccountSchema>,
) {
  if (process.env.NAUMI_IDENTITY_AUTHORITY_ENABLED !== "1")
    throw new TeamError("统一账号管理尚未启用", 503);
  const c = centralAccountSchema.parse(input);
  assertEnterpriseAllowed(deploymentPolicy(), c.enterpriseId);
  await ensureIdentitySchema();
  const origin = new URL(identityIssuer()).origin;
  return enterpriseIdentityTransaction(actor, c.enterpriseId, async (tx, s) => {
    if (actor.admin || actor.consoleAdmin)
      throw new TeamError("请使用企业管理账号", 403);
    const hash = digest(JSON.stringify(c)),
      receipt = (
        await tx.query("SELECT * FROM app_identity_receipts WHERE id=$1", [
          c.id,
        ])
      ).rows[0];
    if (receipt) {
      if (
        receipt.actor !== actor.email ||
        receipt.enterprise_id !== c.enterpriseId ||
        receipt.fingerprint !== hash
      )
        throw new TeamError("操作编号冲突", 409);
      return { ...receipt.result, replayed: true, inviteUrl: null };
    }
    const email =
      c.action === "create" ? loginIdentifierToEmail(c.username) : c.email;
    const native = (
      await tx.query(
        "SELECT role,management_version FROM app_users WHERE email=$1 FOR UPDATE",
        [email],
      )
    ).rows[0];
    if (
      email === s.team.owner_email ||
      email === actor.email ||
      native?.role === "admin"
    )
      throw new TeamError("特权账号请使用本人安全设置", 403);
    const legacy = (
      await tx.query(
        "SELECT r.manage_members,r.view_records FROM app_enterprise_members m JOIN app_enterprise_roles r ON r.id=m.role_id AND r.enterprise_id=m.enterprise_id WHERE m.enterprise_id=$1 AND m.email=$2",
        [c.enterpriseId, email],
      )
    ).rows[0];
    if (
      actor.email !== s.team.owner_email &&
      (legacy?.manage_members || legacy?.view_records)
    )
      throw new TeamError("原有管理账号由最高系统管理员维护", 403);
    if (c.action === "status") {
      if (!native || !s.nodes.some((n) => n.email === email))
        throw new TeamError("成员不属于本企业", 404);
      const org = (
        await tx.query(
          "SELECT o.organization,i.subject_id FROM app_identity_subjects i JOIN app_identity_organizations o ON o.subject_id=i.subject_id WHERE i.account_email=$1 AND o.enterprise_id=$2",
          [email, c.enterpriseId],
        )
      ).rows[0];
      if (!org) throw new TeamError("请先配置组织身份", 409);
      if (
        actor.email !== s.team.owner_email &&
        ["administrator", "design_director", "system_admin"].includes(
          org.organization.title,
        )
      )
        throw new TeamError("管理账号由最高系统管理员维护", 403);
      if (native.management_version !== c.expectedUserVersion)
        throw new TeamError("账号资料已更新，请刷新", 409);
      await tx.query(
        "UPDATE app_users SET banned=$2,management_version=management_version+1,auth_revoked_before=clock_timestamp() WHERE email=$1",
        [email, !c.enabled],
      );
      await tx.query(
        "UPDATE app_identity_invites SET consumed_at=now() WHERE email=$1 AND consumed_at IS NULL",
        [email],
      );
      await tx.query(
        "INSERT INTO app_identity_outbox(event_id,enterprise_id,subject_id,event_type) VALUES($1,$2,$3,'account-status')",
        [randomUUID(), c.enterpriseId, org.subject_id],
      );
      const result = {
        email,
        enabled: c.enabled,
        version: c.expectedUserVersion + 1,
      };
      await tx.query(
        "INSERT INTO app_identity_receipts(id,enterprise_id,actor,fingerprint,result,changes,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          c.id,
          c.enterpriseId,
          actor.email,
          hash,
          JSON.stringify(result),
          JSON.stringify({ banned: !c.enabled, sessionsRevoked: true }),
          c.reason,
        ],
      );
      return { ...result, replayed: false };
    }
    let userVersion = native?.management_version ?? 0,
      mode: "new" | "reset" = "reset",
      subjectId: string | undefined;
    if (c.action === "create") {
      if (native) throw new TeamError("登录账号已存在，未合并或覆盖", 409);
      if (
        actor.email !== s.team.owner_email &&
        ["system_admin", "administrator", "design_director"].includes(
          c.organization.title,
        )
      )
        throw new TeamError("该职务由最高系统管理员设置", 403);
      if (c.organization.title === "system_admin")
        throw new TeamError("最高系统管理员须为企业负责人", 400);
      try {
        assertGrantForOrganization(c.organization, c.roles);
      } catch {
        throw new TeamError("产品角色与职务不匹配", 400);
      }
      if (!c.roles.length) throw new TeamError("请选择产品角色", 400);
      if (
        s.entitlement.seatLimit !== null &&
        s.nodes.filter((n) => n.membership_status !== "suspended").length + 2 >
          s.entitlement.seatLimit
      )
        throw new TeamError("企业席位已用满", 409);
      // Pending activation is deliberately disabled and has no shared/default password.
      await tx.query(
        "INSERT INTO app_users(email,name,plan,credits_total,credits_used,renews_at,banned,password_hash) VALUES($1,$2,'starter',0,0,now()+interval '1 month',true,NULL)",
        [email, c.name],
      );
      await assertAccountCanJoinEnterprise(tx,email);
      await tx.query(
        "INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')",
        [c.enterpriseId, email, s.team.owner_email],
      );
      subjectId = randomUUID();
      await tx.query(
        "INSERT INTO app_identity_subjects(subject_id,account_email) VALUES($1,$2)",
        [subjectId, email],
      );
      await tx.query(
        "INSERT INTO app_identity_organizations(enterprise_id,subject_id,organization) VALUES($1,$2,$3)",
        [c.enterpriseId, subjectId, JSON.stringify(c.organization)],
      );
      await tx.query(
        "INSERT INTO app_identity_product_grants(enterprise_id,subject_id,product_id,enabled,roles) VALUES($1,$2,'design-ops',true,$3)",
        [c.enterpriseId, subjectId, JSON.stringify(c.roles)],
      );
      mode = "new";
    } else {
      if (!native || !s.nodes.some((n) => n.email === email))
        throw new TeamError("成员不属于本企业", 404);
      const org = (
        await tx.query(
          "SELECT o.organization FROM app_identity_subjects i JOIN app_identity_organizations o ON o.subject_id=i.subject_id WHERE i.account_email=$1 AND o.enterprise_id=$2",
          [email, c.enterpriseId],
        )
      ).rows[0]?.organization;
      if (
        actor.email !== s.team.owner_email &&
        org &&
        ["administrator", "design_director", "system_admin"].includes(org.title)
      )
        throw new TeamError("该管理身份由负责人维护", 403);
      const pending = (
        await tx.query(
          "SELECT 1 FROM app_identity_invites WHERE enterprise_id=$1 AND email=$2 AND activation_mode='new' AND consumed_at IS NULL",
          [c.enterpriseId, email],
        )
      ).rowCount;
      mode = pending ? "new" : "reset";
      subjectId = (
        await tx.query(
          "SELECT subject_id FROM app_identity_subjects WHERE account_email=$1",
          [email],
        )
      ).rows[0]?.subject_id;
      if (!subjectId) throw new TeamError("请先配置成员组织身份", 409);
    }
    await tx.query(
      "UPDATE app_identity_invites SET consumed_at=now() WHERE email=$1 AND consumed_at IS NULL",
      [email],
    );
    const token = randomBytes(32).toString("base64url"),
      inviteId = randomUUID();
    await tx.query(
      "INSERT INTO app_identity_invites(id,enterprise_id,email,token_hash,activation_mode,expected_user_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '72 hours')",
      [inviteId, c.enterpriseId, email, digest(token), mode, userVersion],
    );
    const eventId = randomUUID();
    await tx.query(
      "INSERT INTO app_identity_outbox(event_id,enterprise_id,subject_id,product_id,event_type) VALUES($1,$2,$3,'design-ops','account-invitation')",
      [eventId, c.enterpriseId, subjectId],
    );
    const result = { email, subjectId, inviteId, inviteIssued: true };
    await tx.query(
      "INSERT INTO app_identity_receipts(id,enterprise_id,actor,fingerprint,result,changes,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        c.id,
        c.enterpriseId,
        actor.email,
        hash,
        JSON.stringify(result),
        JSON.stringify({ action: c.action, mode }),
        c.reason,
      ],
    );
    return {
      ...result,
      inviteUrl: `${origin}/identity/activate#token=${token}`,
      replayed: false,
    };
  });
}
export async function redeemCentralInvite(token: string, password: string) {
  if (process.env.NAUMI_IDENTITY_AUTHORITY_ENABLED !== "1")
    throw new TeamError("统一账号管理尚未启用", 503);
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    password.length < 10 ||
    password.length > 128 ||
    Buffer.byteLength(password, "utf8") > 256
  )
    throw new TeamError("链接无效或密码不符合要求", 400);
  await ensureIdentitySchema();
  const encrypted = hashPassword(password),
    tx = await getPool().connect();
  try {
    await tx.query("BEGIN");
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))",
    );
    const invite = (
      await tx.query(
        "SELECT * FROM app_identity_invites WHERE token_hash=$1 FOR UPDATE",
        [digest(token)],
      )
    ).rows[0];
    if (
      !invite ||
      invite.consumed_at ||
      new Date(invite.expires_at).getTime() <= Date.now()
    )
      throw new TeamError("链接已失效，请联系管理员重新邀请", 410);
    assertEnterpriseAllowed(deploymentPolicy(), invite.enterprise_id);
    const u = (
      await tx.query(
        "SELECT management_version,auth_revoked_before FROM app_users WHERE email=$1 FOR UPDATE",
        [invite.email],
      )
    ).rows[0];
    const m = (
      await tx.query(
        "SELECT membership_status,membership_expires_at FROM app_enterprise_members WHERE enterprise_id=$1 AND email=$2 FOR SHARE",
        [invite.enterprise_id, invite.email],
      )
    ).rows[0];
    if (
      !u ||
      !m ||
      m.membership_status !== "active" ||
      (m.membership_expires_at &&
        Date.parse(m.membership_expires_at) <= Date.now()) ||
      u.management_version !== invite.expected_user_version ||
      (u.auth_revoked_before &&
        new Date(u.auth_revoked_before).getTime() >=
          new Date(invite.created_at).getTime())
    )
      throw new TeamError("账号状态已变化，请联系管理员", 409);
    const team = (
      await tx.query(
        "SELECT t.owner_email,t.enabled,s.enabled enterprise_enabled,t.authorized_until FROM app_account_teams t JOIN app_enterprise_settings s ON s.team_id=t.id WHERE t.id=$1",
        [invite.enterprise_id],
      )
    ).rows[0];
    if (
      !team?.enabled ||
      !team.enterprise_enabled ||
      (team.authorized_until && Date.parse(team.authorized_until) <= Date.now())
    )
      throw new TeamError("企业已停用或到期", 403);
    await requireTeamGrant(tx, { email: team.owner_email, admin: false });
    await tx.query(
      "UPDATE app_users SET password_hash=$2,banned=CASE WHEN $3='new' THEN false ELSE banned END,management_version=management_version+1,auth_revoked_before=clock_timestamp() WHERE email=$1",
      [invite.email, encrypted, invite.activation_mode],
    );
    await tx.query(
      "UPDATE app_identity_invites SET consumed_at=clock_timestamp() WHERE id=$1",
      [invite.id],
    );
    const subject = (
      await tx.query(
        "SELECT subject_id FROM app_identity_subjects WHERE account_email=$1",
        [invite.email],
      )
    ).rows[0];
    await tx.query(
      "INSERT INTO app_identity_outbox(event_id,enterprise_id,subject_id,event_type) VALUES($1,$2,$3,'account-activated')",
      [randomUUID(), invite.enterprise_id, subject.subject_id],
    );
    await tx.query(
      "INSERT INTO app_identity_receipts(id,enterprise_id,actor,fingerprint,result,changes,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        invite.enterprise_id,
        invite.email,
        digest(token),
        JSON.stringify({ activated: true }),
        JSON.stringify({ passwordChanged: true, sessionsRevoked: true }),
        "成员通过一次性邀请设置密码",
      ],
    );
    await tx.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await tx.query("ROLLBACK");
    throw e;
  } finally {
    tx.release();
  }
}
