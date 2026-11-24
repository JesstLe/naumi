import {TeamError} from "../teams/errors";
import {ModelConfigError} from "../model-config/types";
import "server-only";
import {accountCreationPolicySchema} from "../accounts/creation-policy";
import {writeAccountCreationPolicyTx} from "../accounts/creation-policy-store";
import {accountImageModel} from "../model-config/account-image-policy";
import {readPublishedModelSnapshot} from "../model-config/published-repository";
import {modelTrustedOrigins} from "../model-config/environment";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { getPool } from "@/platform/db/pool";
import { hashPassword } from "@/lib/pw";
import { settingsSecret } from "@/lib/settings-secret";
import {ensureBiSchema} from "@/lib/bi/schema";

import {getBillingRuntime} from "@/lib/billing/runtime";
import { expiryFrom } from "@/lib/billing/rules/schema";
import { BillingError } from "@/lib/billing/types";
import {accountIdentifierSchema} from '@/lib/account-identity-schema';
import { USER_POSITIONS } from '@/lib/accounts/positions';
const base = {
    id: z.string().uuid(),
    email: accountIdentifierSchema,
    reason: z.string().trim().min(3).max(500),
};
const version = { expectedVersion: z.number().int().nonnegative() };
const password = z.string().min(8).max(128);
const months = z.number().int().min(1).max(120).optional();
export const userCommandSchema = z.discriminatedUnion("action", [
    z.object({...base,...version,action:z.literal("creation-policy"),policy:accountCreationPolicySchema}).strict(),
    z.object({ ...base, ...version, action: z.literal("position"), position: z.enum(USER_POSITIONS) }).strict(),
    z
        .object({
        ...base,
        action: z.literal("create"),
        name: z.string().trim().min(1).max(80),
        password,
        initialCredits: z.number().int().min(0).max(1000000),
        creationPolicy:accountCreationPolicySchema.optional(),
        months,
    })
        .strict(),
    z
        .object({
        ...base,
        ...version,
        action: z.literal("profile"),
        name: z.string().trim().min(1).max(80),
        phone: z.string().trim().max(40),
        note: z.string().trim().max(2000),
        // Optional for historical callers; omitting keeps the current value.
        position: z.enum(USER_POSITIONS).optional(),
    })
        .strict(),
    z
        .object({
        ...base,
        ...version,
        action: z.literal("ban"),
        banned: z.boolean(),
    })
        .strict(),
    z
        .object({
        ...base,
        ...version,
        action: z.literal("role"),
        role: z.enum(["user", "admin"]),
    })
        .strict(),
    z
        .object({
        ...base,
        ...version,
        action: z.literal("reset-password"),
        password,
    })
        .strict(),
    z
        .object({
        ...base,
        ...version,
        action: z.literal("adjust"),
        delta: z
            .number()
            .int()
            .min(-1000000)
            .max(1000000)
            .refine((n) => n !== 0),
        months,
    })
        .strict(),
]);
export type UserCommand = z.infer<typeof userCommandSchema>;
export class ManagementError extends Error {
    constructor(message: string, public status = 409) {
        super(message);
    }
}
export async function manageBiUser(command: UserCommand, actor: string) {
    await ensureBiSchema();
    const runtime = await getBillingRuntime(), snapshot = await runtime.config.current();
    const creationPolicy=command.action==="creation-policy"?command.policy:command.action==="create"?command.creationPolicy:undefined;
    const fingerprint = createHmac("sha256", settingsSecret())
        .update(JSON.stringify(command))
        .digest("hex");
    const passwordHash = "password" in command ? hashPassword(command.password) : null;
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('naumi-bi-user-management'))");
        const previous = (await client.query("SELECT actor,request_fingerprint FROM app_bi_management_log WHERE id=$1", [command.id])).rows[0];
        if (previous) {
            if (previous.actor !== actor ||
                previous.request_fingerprint !== fingerprint)
                throw new ManagementError("该操作编号已用于不同操作");
            await client.query("COMMIT");
            return { ok: true, replayed: true };
        }
        if(creationPolicy?.image){
            const models=await readPublishedModelSnapshot(client,{trustedOrigins:modelTrustedOrigins()});
            if(!models)throw new ManagementError("模型配置尚未就绪",503);
            accountImageModel(models.config,creationPolicy.image);
        }
        let user = (await client.query("SELECT email,name,phone,note,role,banned,position,management_version,credits_used FROM app_users WHERE email=$1 FOR UPDATE", [command.email])).rows[0];
        const before = user
            ? {
                name: user.name,
                phone: user.phone,
                note: user.note,
                role: user.role,
                banned: user.banned,
                position: user.position,
            }
            : null;
        if (command.action === "create") {
            if (user)
                throw new ManagementError("该邮箱已存在");
            await client.query("INSERT INTO app_users(email,name,plan,credits_total,credits_used,renews_at,password_hash) VALUES($1,$2,'starter',0,0,now()+interval '1 month',$3)", [command.email, command.name, passwordHash]);
            user = { credits_used: 0, management_version: 0 };
        }
        else {
            if (!user)
                throw new ManagementError("用户不存在", 404);
            if (user.management_version !== command.expectedVersion)
                throw new ManagementError("账户已被其他管理员修改，请刷新后重试");
            if (["ban", "role", "reset-password"].includes(command.action) &&
                command.email === actor)
                throw new ManagementError("请在个人安全设置管理自己的账户", 403);
            if (command.action === "ban" && command.banned && user.role === "admin")
                throw new ManagementError("请先调整管理员权限，再封禁账户", 403);
            if (command.action === "role" &&
                user.role === "admin" &&
                !user.banned &&
                command.role === "user") {
                const count = (await client.query("SELECT count(*)::int AS n FROM app_users WHERE role='admin' AND NOT banned")).rows[0].n;
                if (count <= 1)
                    throw new ManagementError("不能撤销最后一个有效管理员", 403);
            }
        }
        const delta = command.action === "adjust"
            ? command.delta
            : command.action === "create"
                ? command.initialCredits
                : 0;
        let expiry: string | null = null;
        let available = 0;
        const ledgerId = delta ? "led-bi-" + command.id : null;
        if (delta) {
            // Only credit changes include balances in the audit. The owner row
            // is already locked in this transaction; do not lock/transfer every
            // live batch before adjustTx performs its own funded-prefix debit.
            const principal = Number((await client.query("SELECT COALESCE(sum(remaining),0) AS amount FROM app_credit_batches WHERE email=$1 AND remaining>0 AND expires_at>now()", [command.email])).rows[0].amount);
            available = Math.max(0, principal - user.credits_used);
            const policy = "months" in command && command.months !== undefined ? { unit: "months" as const, value: command.months } : snapshot.config.credits.admin;
            if (delta > 0)
                expiry = expiryFrom(new Date(), policy).toISOString();
            await runtime.service.adjustTx(client, { id: `bi-${command.id}`, email: command.email, amount: delta, source: "admin", reason: "管理员调整积分", expiry: policy,
                ledgerId: ledgerId!, actor, fingerprint, debitOrder: snapshot.config.credits.debitOrder, ...(expiry ? { expiresAt: expiry } : {}) });
        }
        if (command.action === "position")
            await client.query("UPDATE app_users SET position=$2 WHERE email=$1", [command.email, command.position]);
        if (command.action === "profile")
            await client.query("UPDATE app_users SET name=$2,phone=NULLIF($3,''),note=$4,position=$5 WHERE email=$1", [command.email, command.name, command.phone, command.note, command.position ?? user.position ?? ""]);
        if (command.action === "ban")
            await client.query("UPDATE app_users SET banned=$2,auth_revoked_before=CASE WHEN $2 THEN now() ELSE auth_revoked_before END WHERE email=$1", [command.email, command.banned]);
        if (command.action === "role")
            await client.query("UPDATE app_users SET role=$2 WHERE email=$1", [
                command.email,
                command.role,
            ]);
        if (command.action === "reset-password")
            await client.query("UPDATE app_users SET password_hash=$2,auth_revoked_before=now() WHERE email=$1", [command.email, passwordHash]);
        if(creationPolicy){
            await writeAccountCreationPolicyTx(client,command.email,creationPolicy,actor);
            if(creationPolicy.personalOnly)await client.query(`INSERT INTO app_bi_account_profiles(email,account_type,company,updated_by) VALUES($1,'personal','',$2) ON CONFLICT(email) DO UPDATE SET account_type='personal',company='',updated_by=$2,updated_at=now()`,[command.email,actor]);
        }
        await client.query("UPDATE app_users SET management_version=management_version+1 WHERE email=$1", [command.email]);
        const after = (await client.query("SELECT name,phone,note,role,banned,position,management_version FROM app_users WHERE email=$1", [command.email])).rows[0];
        const changes = {
            ...(creationPolicy?{creationPolicy}:{}),
            before,
            after,
            ...(delta
                ? {
                    delta,
                    availableBefore: available,
                    availableAfter: available + delta,
                    expiresAt: expiry,
                }
                : {}),
            ...(command.action === "reset-password" ? { sessionsRevoked: true } : {}),
        };
        await client.query("INSERT INTO app_bi_management_log(id,actor,email,action,reason,changes,request_fingerprint,ledger_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", [
            command.id,
            actor,
            command.email,
            command.action,
            command.reason,
            JSON.stringify(changes),
            fingerprint,
            ledgerId,
        ]);
        await client.query("INSERT INTO app_bi_access_log(id,actor,action,target_email,section) VALUES($1,$2,$3,$4,'management')", [command.id, actor, "manage-" + command.action, command.email]);
        await client.query("COMMIT");
        return { ok: true, replayed: false, version: after.management_version };
    }
    catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof BillingError || error instanceof TeamError || error instanceof ModelConfigError)
            throw new ManagementError(error.message, error.status);
        throw error;
    }
    finally {
        client.release();
    }
}
