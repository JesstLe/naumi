export {type VideoTaskRow,type VideoResultRow} from "@/lib/video/task-types";
export {createVideoTask,getVideoTask,getVideoTaskByIdempotencyKey,listVideoTasks,deleteFinishedVideoTask,listVideoResults,deleteVideoResult} from "@/lib/video/task-repository";
export {claimVideoTaskPoll,releaseVideoTaskPoll,recordVideoTaskPoll,noteVideoTaskResultObserved,stageVideoTaskResult,listDueVideoTaskRefs,scheduleVideoTaskRetry} from "@/lib/video/task-polling";
export {createVideoTaskWithReservation,markVideoTaskCreated,markVideoTaskCreationUnknown,markVideoTaskAttention,resumeVideoTaskPolling,bindUnknownVideoTaskUpstream,completeVideoTask,failVideoTask,updateVideoTask} from "@/lib/video/task-transitions";
export {type CanvasImageTaskRow} from "@/lib/canvas/image-task-records";
export {createCanvasImageTask,getCanvasImageTask,listCanvasImageTasks,claimNextCanvasImageTask,updateCanvasImageTaskProgress,beginCanvasImageTaskSubmission,saveCanvasImageTaskProviderResult,holdCanvasImageTask,retryCanvasImageTask} from "@/lib/canvas/image-task-repository";
export {createCanvasImageTaskWithReservation,completeCanvasImageTask,failCanvasImageTask} from "@/lib/canvas/image-task-transitions";
export {addReservation,settleReservation,touchReservation,sweepStaleReservations} from "@/lib/billing/reservations";
export {recordImageCostAudit,getImageJobChargedCredits,getCanvasImageTaskChargedCredits,type ImageCostAuditRow,listImageCostAudit} from "@/lib/billing/cost-audit-repository";
export {deductPrincipalFIFO} from "@/lib/billing/wallet-balance";
export {creditMeteringEnabled} from "@/lib/billing/runtime";
export {setArtworkOrigin} from "@/lib/artworks/repository";
import {deductPrincipalFIFO} from "@/lib/billing/wallet-balance";
import {creditMeteringEnabled} from "@/lib/billing/runtime";
export {type ArtworkRecord,type AdminArtwork} from "@/lib/artworks/types";
export {getWorkbenchArtworks,listArtworks,listArtworksByIds,setArtworkDimensions,renameArtwork,deleteArtworksByIds,undeleteArtworksByIds,purgeArtworksByIds,listDeletedArtworks} from "@/lib/artworks/repository";
export {addArtworks,addArtworksTx,ensureTemplateRoot} from "@/lib/artworks/writer";
export {listAllArtworks,getArtworkById,deleteArtwork,importedArtworkIds} from "@/lib/artworks/administration";
export {setArtworkPosition,setArtworkCanvasLayout,setArtworkCanvasSize,setArtworkMarked,type CanvasGroupAssignment,setArtworkCanvasGroups,addArtworkParent,removeArtworkParent} from "@/lib/canvas/artwork-repository";
export {type CanvasTextNodeRecord,listCanvasTextNodes,upsertCanvasTextNode,deleteCanvasTextNodes} from "@/lib/canvas/text-node-repository";
export {getProjectNames,setProjectName,deleteProjectName} from "@/lib/canvas/project-repository";
export {deleteCanvasNodesAtomically} from "@/lib/canvas/node-deletion";
// Transitional same-function exports; callers migrate to the data owner.
export {setUserPassword,getUserPasswordHash,userExists,setUserRole,getUserRole,getOwnerEmail,getLocalOperatorEmail,setUserBanned,setUserNote,bannedEmailsAmong,recordLoginIp,type BannedIpRow,banIp,unbanIp,listBannedIps,isBanned} from "@/lib/accounts/repository";
export {getOrCreateUser,getUser,changeUserPlan} from "@/lib/accounts/session";
export {getCreditOverview,expireDueBatches,refreshBalance} from "@/lib/billing/wallet-balance";
export {totalPaidCents} from "@/lib/payments/history";
export {type UserImageProviderRecord,listUserImageProviderRecords,getUserImageProviderRecord,getUserImageProviderRecordById,countUserImageProviderRecords,upsertUserImageProviderRecord,activateUserImageProviderRecord,deleteUserImageProviderRecord} from "@/lib/user-image-provider/repository";
import {oneMonthFromNowISO} from "@/lib/accounts/session";
import {refreshBalance,expireDueBatches} from "@/lib/billing/wallet-balance";
import {randomUUID} from "node:crypto";
import type {ProductReceipt} from "@/lib/payments";
import {signupGrantTx,administrativeGrantInput} from "@/lib/billing/entitlements";
import {withTransaction as withBillingTransaction} from "@/platform/db/transaction";
import {BillingError} from "@/lib/billing/types";
import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "./persistence/schema";
import {getSetting,setSetting} from "./settings/repository";
export {getSetting,setSetting} from "./settings/repository";
export {getSignupBonus,setSignupBonus} from "./billing/signup";
import {
  type PromptTemplate,
} from "@/lib/mock-data";
import { remoteTemplateImageSource } from "@/lib/template-image-cache";
import type { CompetitorItem } from "@/lib/competitor-types";
import { RETIRED_BUSINESS_PROJECTS, isRetiredBusinessProject } from "./retired-business-projects";

// ---------------------------------------------------------------------------
// Postgres persistence. Active only when DATABASE_URL is set; otherwise the
// app keeps using the client-side localStorage mock. Schema is created on
// first use (CREATE TABLE IF NOT EXISTS) so no separate migration step is
// needed for the MVP — swap for proper migrations before production.
// ---------------------------------------------------------------------------

// Shared transactional infrastructure for durable generation jobs.
export { dbEnabled, getPool, ensureSchema };


/** Lightweight connectivity probe used by /api/health. */
export async function pingDb(): Promise<{ ok: boolean; error?: string }> {
  if (!dbEnabled) return { ok: false, error: "DATABASE_URL 未配置" };
  try {
    await getPool().query("SELECT 1");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "数据库连接失败",
    };
  }
}

// ===========================================================================
// 积分批次(2 年有效 / 新人 30 天) + 消费 FIFO + 过期处理
// ---------------------------------------------------------------------------
// 模型:批次(app_credit_batches)是「本金」的唯一真源;app_users.credits_used
// 当「在途占位」(预扣未结算)。可用余额 = 活批次 remaining 之和;remaining = 该
// 余额减去 credits_used(占位)。消费在「结算」(addLedgerEntry 负数)时才真正按
// FIFO 扣本金。credits_total 列保留为余额镜像(refreshBalance 同步,后台直读用)。
// ===========================================================================

function ledId(prefix = "led"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function twoYearsFromNow(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return d;
}

/** 新建积分批次(充值/赠送/迁移/后台)+ 写 +流水 + 同步余额。 */
export async function addCreditBatch(emailRaw:string,amount:number,opts:{source:"purchase"|"grant"|"migrate"|"admin";reason:string;expiresAt?:Date;orderId?:string|null;ledgerKind?:"purchase"|"grant";id?:string;actor?:string}):Promise<void>{
  await ensureSchema(); if(amount<=0)return;
  const {getBillingRuntime}=await import("@/lib/billing/runtime"), runtime=await getBillingRuntime(),snapshot=await runtime.config.current();
  await withBillingTransaction(getPool(),async tx=>{
    const input=await administrativeGrantInput(tx,{email:emailRaw.toLowerCase(),amount,reason:opts.reason,source:opts.source,actor:opts.actor??"system",id:opts.id,expiresAt:opts.expiresAt?.toISOString(),orderId:opts.orderId??undefined},snapshot);
    await runtime.service.grantTx(tx,input);
  });
}

// ===========================================================================
// 兑换码(app_card_keys):站长批量发码 → 用户兑换 → addCreditBatch grant 加积分
// ===========================================================================

export type CardKeyRow = {
  code: string;
  credits: number;
  status: "unused" | "used" | "disabled";
  batch: string;
  note: string;
  expires_at: Date | null;
  created_at: Date;
  used_by: string | null;
  used_at: Date | null;
  billing_grant?: {configVersion:number;expiry:import("@/lib/billing/types").ExpiryPolicy;actor:string};
};

// 无歧义字符集(去掉 0/O/1/I/L),NOVA-XXXX-XXXX-XXXX。
const CARD_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randCardCode(): string {
  const seg = () =>
    Array.from(
      { length: 4 },
      () => CARD_CHARSET[Math.floor(Math.random() * CARD_CHARSET.length)]
    ).join("");
  return `NOVA-${seg()}-${seg()}-${seg()}`;
}

/** 批量生成兑换码(站长后台)。expiryDays=null → 永久。 */
export async function generateCardKeys(opts: {
  credits: number;
  count: number;
  expiryDays: number | null;
  batch: string;
  note: string;
  actor?: string;
}): Promise<CardKeyRow[]> {
  await ensureSchema();
  const expires =
    opts.expiryDays && opts.expiryDays > 0
      ? new Date(Date.now() + opts.expiryDays * 86400000).toISOString()
      : null;
  if(!Number.isSafeInteger(opts.credits)||opts.credits<=0||opts.credits>2147483647||!Number.isSafeInteger(opts.count)||opts.count<1||opts.count>500||opts.expiryDays!==null&&(!Number.isSafeInteger(opts.expiryDays)||opts.expiryDays<1||opts.expiryDays>36500))throw new BillingError("INVALID_RESULT","兑换码参数无效",400);
  const {getBillingRuntime}=await import("@/lib/billing/runtime"), snapshot=await(await getBillingRuntime()).config.current();
  const receipt={configVersion:snapshot.version,expiry:snapshot.config.credits.redeem,actor:opts.actor??"local-admin"};
  const out: CardKeyRow[] = [];
  for (let i = 0; i < opts.count; i++) {
    // 重试避免 PK 撞码(概率极低)。
    let inserted: CardKeyRow | null = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const code = randCardCode();
      const { rows } = await getPool().query<CardKeyRow>(
        `INSERT INTO app_card_keys (code, credits, batch, note, expires_at,billing_grant)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (code) DO NOTHING
         RETURNING code, credits, status, batch, note, expires_at, created_at, used_by, used_at,billing_grant`,
        [code, opts.credits, opts.batch, opts.note, expires,JSON.stringify(receipt)]
      );
      if (rows[0]) inserted = rows[0];
    }
    if (inserted) out.push(inserted);
  }
  return out;
}

/** 列出兑换码(最近 500 条,站长后台)。 */
export async function listCardKeys(): Promise<CardKeyRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query<CardKeyRow>(
    `SELECT code, credits, status, batch, note, expires_at, created_at, used_by, used_at,billing_grant
       FROM app_card_keys ORDER BY created_at DESC LIMIT 500`
  );
  return rows;
}

/** 停用 / 恢复(已使用的不可改)。 */
export async function setCardKeyStatus(
  code: string,
  status: "unused" | "disabled"
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_card_keys SET status = $2 WHERE code = $1 AND status <> 'used'`,
    [code, status]
  );
}

/** 兑换:原子领取(unused→used)后用 grant 批次加积分。失败抛中文原因。 */
export async function redeemCardKey(codeRaw:string,emailRaw:string):Promise<{credits:number}>{
  await ensureSchema(); const code=codeRaw.trim().toUpperCase(),email=emailRaw.toLowerCase();
  const {getBillingRuntime}=await import("@/lib/billing/runtime"),runtime=await getBillingRuntime();
  return withBillingTransaction(getPool(),async tx=>{
    const card=(await tx.query<CardKeyRow>("SELECT * FROM app_card_keys WHERE code=$1 FOR UPDATE",[code])).rows[0];
    if(!card)throw new Error("兑换码不存在");
    if(card.status==="used"){
      if(card.used_by===email&&(await tx.query("SELECT state FROM app_billing_operations WHERE id=$1 AND email=$2",[`redeem-${code}`,email])).rows[0]?.state==="settled")return {credits:card.credits};
      throw new Error("兑换码已被使用");
    }
    if(card.status==="disabled")throw new Error("兑换码已停用");
    if(card.expires_at&&card.expires_at<=new Date())throw new Error("兑换码已过期");
    // Legacy issued cards keep their original two-year credit validity.
    const expiry=card.billing_grant?.expiry??{unit:"years" as const,value:2};
    const id=`redeem-${code}`;
    await runtime.service.grantTx(tx,{id,email,amount:card.credits,source:"grant",reason:"兑换码",expiry,ledgerId:`led-${id}`,actor:email,fingerprint:code});
    await tx.query("UPDATE app_card_keys SET status='used',used_by=$2,used_at=now() WHERE code=$1",[code,email]);
    return {credits:card.credits};
  });
}

/** 兑换码统计(站长后台卡片)。 */
export async function cardKeyStats(): Promise<{
  issued: number;
  used: number;
  creditsRedeemed: number;
}> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    issued: string;
    used: string;
    credits_redeemed: string;
  }>(
    `SELECT COUNT(*) AS issued,
            COUNT(*) FILTER (WHERE status = 'used') AS used,
            COALESCE(SUM(credits) FILTER (WHERE status = 'used'), 0) AS credits_redeemed
       FROM app_card_keys`
  );
  const r = rows[0];
  return {
    issued: Number(r?.issued ?? 0),
    used: Number(r?.used ?? 0),
    creditsRedeemed: Number(r?.credits_redeemed ?? 0),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Pro 自托管授权 License。License Key = 爱发电售卖/发货的产品;Pro 实例
// 启动时调 /api/license/activate 绑定 host、校验有效期与设备数上限。
// ─────────────────────────────────────────────────────────────────────

export type LicenseRow = {
  key: string;
  tier: string;
  status: string; // active|revoked
  device_limit: number;
  expires_at: Date | null;
  batch: string;
  note: string;
  bound_email: string | null;
  created_at: Date;
};

// License Key = 5 段,与积分兑换码(4 段)区分。
function randLicenseKey(): string {
  const seg = () =>
    Array.from(
      { length: 4 },
      () => CARD_CHARSET[Math.floor(Math.random() * CARD_CHARSET.length)]
    ).join("");
  return `NOVA-${seg()}-${seg()}-${seg()}-${seg()}`;
}

/** 批量生成 Pro License(站长后台;导出后上传爱发电卡密池发货)。expiryDays=null → 永久。 */
export async function generateLicenses(opts: {
  count: number;
  tier?: string;
  deviceLimit?: number;
  expiryDays: number | null;
  batch: string;
  note: string;
}): Promise<LicenseRow[]> {
  await ensureSchema();
  const tier = opts.tier || "pro";
  const deviceLimit =
    opts.deviceLimit && opts.deviceLimit > 0 ? Math.trunc(opts.deviceLimit) : 3;
  const expires =
    opts.expiryDays && opts.expiryDays > 0
      ? new Date(Date.now() + opts.expiryDays * 86400000).toISOString()
      : null;
  const out: LicenseRow[] = [];
  for (let i = 0; i < opts.count; i++) {
    let inserted: LicenseRow | null = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const key = randLicenseKey();
      const { rows } = await getPool().query<LicenseRow>(
        `INSERT INTO app_licenses (key, tier, device_limit, expires_at, batch, note)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (key) DO NOTHING
         RETURNING key, tier, status, device_limit, expires_at, batch, note, bound_email, created_at`,
        [key, tier, deviceLimit, expires, opts.batch, opts.note]
      );
      if (rows[0]) inserted = rows[0];
    }
    if (inserted) out.push(inserted);
  }
  return out;
}

/** 列出 License(最近 500,含当前已激活设备数)。 */
export async function listLicenses(): Promise<
  (LicenseRow & { activations: number })[]
> {
  await ensureSchema();
  const { rows } = await getPool().query<LicenseRow & { activations: string }>(
    `SELECT l.key, l.tier, l.status, l.device_limit, l.expires_at, l.batch, l.note,
            l.bound_email, l.created_at,
            (SELECT COUNT(*) FROM app_license_activations a
              WHERE a.license_key = l.key AND a.active) AS activations
       FROM app_licenses l ORDER BY l.created_at DESC LIMIT 500`
  );
  return rows.map((r) => ({ ...r, activations: Number(r.activations ?? 0) }));
}

/** License 统计(站长后台卡片)。 */
export async function licenseStats(): Promise<{
  issued: number;
  active: number;
  revoked: number;
  activations: number;
}> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    issued: string;
    active: string;
    revoked: string;
    activations: string;
  }>(
    `SELECT COUNT(*) AS issued,
            COUNT(*) FILTER (WHERE status = 'active') AS active,
            COUNT(*) FILTER (WHERE status = 'revoked') AS revoked,
            (SELECT COUNT(*) FROM app_license_activations WHERE active) AS activations
       FROM app_licenses`
  );
  const r = rows[0];
  return {
    issued: Number(r?.issued ?? 0),
    active: Number(r?.active ?? 0),
    revoked: Number(r?.revoked ?? 0),
    activations: Number(r?.activations ?? 0),
  };
}

/** 启用 / 吊销 License。 */
export async function setLicenseStatus(
  keyRaw: string,
  status: "active" | "revoked"
): Promise<void> {
  await ensureSchema();
  await getPool().query(`UPDATE app_licenses SET status = $2 WHERE key = $1`, [
    keyRaw.trim().toUpperCase(),
    status,
  ]);
}

type LicenseOk = { row: LicenseRow };
async function loadLicense(
  keyRaw: string
): Promise<LicenseOk | { error: string }> {
  const key = keyRaw.trim().toUpperCase();
  if (!key) return { error: "请填写 License Key" };
  const { rows } = await getPool().query<LicenseRow>(
    `SELECT key, tier, status, device_limit, expires_at, batch, note, bound_email, created_at
       FROM app_licenses WHERE key = $1`,
    [key]
  );
  const row = rows[0];
  if (!row) return { error: "License Key 不存在" };
  if (row.status === "revoked") return { error: "License 已被吊销" };
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())
    return { error: "License 已过期" };
  return { row };
}

/** 校验 License(发货弹窗用)。 */
export async function validateLicense(
  keyRaw: string
): Promise<
  | { ok: true; key: string; tier: string; expiresAt: string | null }
  | { ok: false; error: string }
> {
  await ensureSchema();
  const st = await loadLicense(keyRaw);
  if ("error" in st) return { ok: false, error: st.error };
  return {
    ok: true,
    key: st.row.key,
    tier: st.row.tier,
    expiresAt: st.row.expires_at
      ? new Date(st.row.expires_at).toISOString()
      : null,
  };
}

/** 激活(Pro 实例调用):校验 + 绑定 host + 设备数上限。 */
export async function activateLicense(
  keyRaw: string,
  hostRaw: string
): Promise<
  | {
      ok: true;
      tier: string;
      expiresAt: string | null;
      deviceLimit: number;
      activatedDevices: number;
    }
  | { ok: false; error: string }
> {
  await ensureSchema();
  const st = await loadLicense(keyRaw);
  if ("error" in st) return { ok: false, error: st.error };
  const key = st.row.key;
  const host = hostRaw.trim().toLowerCase().slice(0, 200);
  if (!host) return { ok: false, error: "缺少部署标识 host" };

  const { rows: exist } = await getPool().query<{ id: number }>(
    `SELECT id FROM app_license_activations WHERE license_key = $1 AND host = $2`,
    [key, host]
  );
  if (exist[0]) {
    await getPool().query(
      `UPDATE app_license_activations SET active = true, last_seen = now()
        WHERE license_key = $1 AND host = $2`,
      [key, host]
    );
  } else {
    const { rows: cnt } = await getPool().query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM app_license_activations WHERE license_key = $1 AND active`,
      [key]
    );
    if (Number(cnt[0]?.n ?? 0) >= st.row.device_limit) {
      return { ok: false, error: `已达设备数上限(${st.row.device_limit})` };
    }
    await getPool().query(
      `INSERT INTO app_license_activations (license_key, host) VALUES ($1,$2)
       ON CONFLICT (license_key, host) DO UPDATE SET active = true, last_seen = now()`,
      [key, host]
    );
  }
  const { rows: cnt2 } = await getPool().query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM app_license_activations WHERE license_key = $1 AND active`,
    [key]
  );
  return {
    ok: true,
    tier: st.row.tier,
    expiresAt: st.row.expires_at
      ? new Date(st.row.expires_at).toISOString()
      : null,
    deviceLimit: st.row.device_limit,
    activatedDevices: Number(cnt2[0]?.n ?? 0),
  };
}

/** 某 License 的已绑定部署(我的授权页)。 */
export async function licenseActivations(
  keyRaw: string
): Promise<
  { host: string; active: boolean; activatedAt: string; lastSeen: string }[]
> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    host: string;
    active: boolean;
    activated_at: Date;
    last_seen: Date;
  }>(
    `SELECT host, active, activated_at, last_seen FROM app_license_activations
      WHERE license_key = $1 ORDER BY activated_at DESC`,
    [keyRaw.trim().toUpperCase()]
  );
  return rows.map((r) => ({
    host: r.host,
    active: r.active,
    activatedAt: new Date(r.activated_at).toISOString(),
    lastSeen: new Date(r.last_seen).toISOString(),
  }));
}

// --- Admin: user & membership management ---------------------------------

export type AdminUserRow = {
  email: string;
  name: string;
  plan: string;
  role: string;
  creditsTotal: number;
  creditsUsed: number;
  artworks: number;
  banned: boolean;
  lastIp: string | null;
  recent7: number; // 近 7 天已落账消费积分
  note: string; // 管理员备注（仅后台可见）
};

export async function listAllUsers(): Promise<AdminUserRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT u.email, u.name, u.plan, u.role,
            u.credits_total, u.credits_used, u.banned, u.last_ip, u.note,
            COALESCE(a.artworks,0) AS artworks,COALESCE(a.artworks7d,0) AS artworks7d,
            COALESCE(l.consumed7d,0) AS consumed7d
       FROM app_users u
       LEFT JOIN (SELECT email,count(*) AS artworks,count(*) FILTER(WHERE created_at>now()-interval '7 days') AS artworks7d
         FROM app_artworks GROUP BY email) a ON a.email=u.email
       LEFT JOIN (SELECT email,-sum(delta) AS consumed7d FROM app_ledger
         WHERE kind='consume' AND delta<0 AND reason<>'管理员调整积分' AND created_at>now()-interval '7 days' GROUP BY email) l ON l.email=u.email
      ORDER BY artworks7d DESC, u.joined_at ASC`
  );
  return rows.map((r) => ({
    email: r.email,
    name: r.name,
    plan: r.plan,
    role: r.role,
    creditsTotal: r.credits_total,
    creditsUsed: r.credits_used,
    artworks: Number(r.artworks),
    banned: r.banned === true,
    lastIp: r.last_ip ?? null,
    recent7: Number(r.consumed7d),
    note: r.note ?? "",
  }));
}

export async function adminStats(): Promise<{
  users: number;
  artworks: number;
  remaining: number;
  used: number;
}> {
  await ensureSchema();
  const a = await getPool().query(
    `SELECT count(*)::int AS users,
            COALESCE(sum(credits_total - credits_used),0)::int AS remaining,
            COALESCE(sum(credits_used),0)::int AS used
       FROM app_users`
  );
  const b = await getPool().query(
    `SELECT count(*)::int AS artworks FROM app_artworks`
  );
  return {
    users: a.rows[0].users,
    remaining: a.rows[0].remaining,
    used: a.rows[0].used,
    artworks: b.rows[0].artworks,
  };
}

export type AdminUsageUserRow = {
  email: string;
  name: string;
  role: string;
  credits: number;
  operations: number;
  balance: number;
  lastUsedAt: string | null;
};

export type AdminUsageSummary = {
  rangeDays: number;
  totals: { credits: number; operations: number; activeUsers: number };
  users: AdminUsageUserRow[];
  daily: { date: string; credits: number; operations: number }[];
};

/** Admin usage overview backed by settled credit ledger entries. */
export async function adminUsageSummary(daysRaw = 30): Promise<AdminUsageSummary> {
  await ensureSchema();
  const rangeDays = Math.min(365, Math.max(1, Math.trunc(Number(daysRaw) || 30)));
  const pool = getPool();
  const usageWhere = `l.kind = 'consume' AND l.delta < 0
    AND l.reason <> '管理员调整积分'
    AND l.created_at >= now() - ($1::text || ' days')::interval`;
  const [users, daily] = await Promise.all([
    pool.query(
      `SELECT u.email, u.name, u.role,
              COALESCE(SUM(-l.delta), 0)::int AS credits,
              COUNT(l.id)::int AS operations,
              MAX(l.created_at) AS last_used_at,
              (u.credits_total - u.credits_used)::int AS balance
         FROM app_users u
         LEFT JOIN app_ledger l ON l.email = u.email AND ${usageWhere}
        GROUP BY u.email, u.name, u.role, u.credits_total, u.credits_used
        ORDER BY credits DESC, last_used_at DESC NULLS LAST, u.joined_at ASC`,
      [rangeDays]
    ),
    pool.query(
      `SELECT to_char(l.created_at::date, 'YYYY-MM-DD') AS date,
              COALESCE(SUM(-l.delta), 0)::int AS credits,
              COUNT(*)::int AS operations
         FROM app_ledger l
        WHERE ${usageWhere}
        GROUP BY l.created_at::date
        ORDER BY l.created_at::date ASC`,
      [rangeDays]
    ),
  ]);
  const mappedUsers = users.rows.map((r) => ({
    email: r.email,
    name: r.name,
    role: r.role,
    credits: Number(r.credits),
    operations: Number(r.operations),
    balance: Number(r.balance),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
  }));
  const mappedDaily = daily.rows.map((r) => ({
    date: r.date,
    credits: Number(r.credits),
    operations: Number(r.operations),
  }));
  return {
    rangeDays,
    totals: {
      credits: mappedUsers.reduce((sum, row) => sum + row.credits, 0),
      operations: mappedUsers.reduce((sum, row) => sum + row.operations, 0),
      activeUsers: mappedUsers.filter((row) => row.operations > 0).length,
    },
    users: mappedUsers,
    daily: mappedDaily,
  };
}

/**
 * 设置「站长邮箱账号」:把内部 operator 账号名下的
 * **全部数据整体迁移**到 newEmail(积分/作品/流水/订单等,凡带 email 列的 app_ 表
 * 动态发现、事务内一并改名),并设 role=admin + 登录密码。
 * 之后站长即可在普通登录框用邮箱+密码登录,与官方站体验一致。
 */
export async function setOwnerAccount(
  oldEmailRaw: string,
  newEmailRaw: string,
  passwordHash: string
): Promise<void> {
  await ensureSchema();
  const oldEmail = oldEmailRaw.toLowerCase();
  const newEmail = newEmailRaw.toLowerCase();
  if (oldEmail === newEmail) throw new Error("新旧邮箱相同");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const dup = await client.query(`SELECT 1 FROM app_users WHERE email = $1`, [
      newEmail,
    ]);
    if (dup.rows.length) {
      throw new Error("该邮箱已被注册,请换一个邮箱");
    }
    // 动态发现所有带 email 列的业务表,整体改名(以后新表加 email 列也自动覆盖)。
    const tables = await client.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'email'
          AND table_name LIKE 'app\\_%'`
    );
    for (const r of tables.rows as { table_name: string }[]) {
      await client.query(
        `UPDATE "${r.table_name}" SET email = $2 WHERE email = $1`,
        [oldEmail, newEmail]
      );
    }
    // operator 从没建过行(极早期实例)→ 直接建一行。
    const has = await client.query(`SELECT 1 FROM app_users WHERE email = $1`, [
      newEmail,
    ]);
    if (!has.rows.length) {
      await client.query(
        `INSERT INTO app_users (email, name, plan, credits_total, credits_used, renews_at)
           VALUES ($1, $2, 'starter', 0, 0, now() + interval '1 month')`,
        [newEmail, newEmail.split("@")[0]]
      );
    }
    await client.query(
      `UPDATE app_users SET role = 'admin', password_hash = $2, name = COALESCE(NULLIF(name,''), $3) WHERE email = $1`,
      [newEmail, passwordHash, "站长"]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// 后台手动调积分:正数 = 新建一个赠送批次(获取),有效期可按月设置(opts.months;
// 0 或负 = 永久,缺省 = 24 个月);负数 = FIFO 扣本金 + 记消耗流水(不动在途占位)。
export async function adjustUserCredits(emailRaw:string,delta:number,reason:string,opts:{months?:number;id?:string;actor?:string}={}):Promise<void>{
  await ensureSchema(); if(delta===0)return;
  if(opts.months!==undefined&&(!Number.isSafeInteger(opts.months)||opts.months>1200))throw new BillingError("INVALID_RESULT","积分有效期无效",400);
  const {getBillingRuntime}=await import("@/lib/billing/runtime"),runtime=await getBillingRuntime(),snapshot=await runtime.config.current();
  await withBillingTransaction(getPool(),async tx=>{
    const input=await administrativeGrantInput(tx,{email:emailRaw.toLowerCase(),amount:delta,reason,actor:opts.actor??"local-admin",id:opts.id,
      expiry:opts.months===undefined?undefined:opts.months<=0?{unit:"years",value:100}:{unit:"months",value:opts.months}},snapshot);
    await runtime.service.adjustTx(tx,input);
  });
}

export type LedgerRow = {
  id: string;
  email: string;
  delta: number;
  reason: string;
  kind: string;
  expiresAt: string | null;
  createdAt: string;
};

function mapLedger(r: {
  id: string;
  email: string;
  delta: number;
  reason: string;
  kind?: string | null;
  expires_at?: Date | null;
  created_at: Date;
}): LedgerRow {
  return {
    id: r.id,
    email: r.email,
    delta: r.delta,
    reason: r.reason,
    kind: r.kind ?? "",
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function listLedger(limit = 20): Promise<LedgerRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, email, delta, reason, kind, expires_at, created_at
       FROM app_ledger ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(mapLedger);
}

/** 结算/审计流水。delta<0 = 消费结算:FIFO 扣本金 + 释放在途占位
 *  (credits_used += delta)+ 记 consume 流水 + 同步余额(这是三个消费路由成功后
 *  调用的扣费入口,签名不变所以路由无需改)。delta>0 走纯审计兜底(目前无调用方)。 */
export async function addLedgerEntry(
  emailRaw: string,
  delta: number,
  reason: string
): Promise<void> {
  const {currentSynchronousBilling,settleSynchronous}=await import("@/lib/billing/synchronous-operation");
  if(delta<=0&&currentSynchronousBilling()){await settleSynchronous(reason);return;}
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  if (delta < 0) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await deductPrincipalFIFO(client, email, -delta);
      await client.query(
        `UPDATE app_users SET credits_used = GREATEST(credits_used + $2, 0) WHERE email = $1`,
        [email, delta]
      );
      await client.query(
        `INSERT INTO app_ledger (id, email, delta, reason, kind) VALUES ($1,$2,$3,$4,'consume')`,
        [ledId(), email, delta, reason]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    await refreshBalance(email).catch(() => {});
    return;
  }
  await getPool().query(
    `INSERT INTO app_ledger (id, email, delta, reason, kind) VALUES ($1,$2,$3,$4,$5)`,
    [ledId(), email, delta, reason, delta > 0 ? "grant" : "consume"]
  );
}

/** Per-user credit ledger — for the admin member detail view. */
export async function listUserLedger(
  emailRaw: string,
  limit = 100
): Promise<LedgerRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, email, delta, reason, kind, expires_at, created_at
       FROM app_ledger WHERE email = $1
      ORDER BY created_at DESC LIMIT $2`,
    [emailRaw.toLowerCase(), limit]
  );
  return rows.map(mapLedger);
}

/** 用户端「积分明细」:按类别(all/purchase/consume/grant/refund/expire)筛选,
 *  默认仅 30 天内。先跑过期确保过期流水已生成。 */
export async function listUserLedgerFiltered(
  emailRaw: string,
  opts: { kind?: string; sinceDays?: number; limit?: number } = {}
): Promise<LedgerRow[]> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  await expireDueBatches(email);
  const limit = Math.min(opts.limit ?? 200, 500);
  const days = String(opts.sinceDays ?? 30);
  const params: unknown[] = [email, days, limit];
  let kindClause = "";
  if (opts.kind && opts.kind !== "all") {
    params.push(opts.kind);
    kindClause = ` AND kind = $4`;
  }
  const { rows } = await getPool().query(
    `SELECT id, email, delta, reason, kind, expires_at, created_at
       FROM app_ledger
      WHERE email = $1
        AND created_at >= now() - ($2 || ' days')::interval
        ${kindClause}
      ORDER BY created_at DESC LIMIT $3`,
    params
  );
  return rows.map(mapLedger);
}

// --- Admin: ban / delete / login-IP --------------------------------------

export async function deleteUser(emailRaw: string): Promise<void> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // app_invoices cascades via FK; artworks/ledger have no FK -> clean up.
    await client.query(`DELETE FROM app_artworks WHERE email = $1`, [email]);
    await client.query(`DELETE FROM app_ledger WHERE email = $1`, [email]);
    await client.query(`DELETE FROM app_users WHERE email = $1`, [email]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// --- Orders / payments ----------------------------------------------------

export type OrderRow = {
  id: string;
  email: string;
  kind: string; // 'plan' | 'pack'
  itemId: string;
  title: string;
  credits: number;
  amount: number; // 分 (RMB cents)
  status: string; // pending|paid|failed|expired
  provider: string;
  providerTxn: string | null;
  createdAt: string;
  paidAt: string | null;
  billingQuote?: ProductReceipt;
};

type OrderDbRow = {
  id: string;
  email: string;
  kind: string;
  item_id: string;
  title: string;
  credits: number;
  amount: number;
  status: string;
  provider: string;
  provider_txn: string | null;
  created_at: Date;
  paid_at: Date | null;
  billing_quote?: ProductReceipt|null;
};

function rowToOrder(r: OrderDbRow): OrderRow {
  return {
    id: r.id,
    email: r.email,
    kind: r.kind,
    itemId: r.item_id,
    title: r.title,
    credits: r.credits,
    amount: r.amount,
    status: r.status,
    provider: r.provider,
    providerTxn: r.provider_txn ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    billingQuote:r.billing_quote??undefined,
  };
}

export async function createOrder(o: {
  email: string;
  kind: string;
  itemId: string;
  title: string;
  credits: number;
  amount: number;
  billingQuote?: ProductReceipt;
}): Promise<OrderRow> {
  await ensureSchema();
  const id = `ord-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { rows } = await getPool().query<OrderDbRow>(
    `INSERT INTO app_orders
       (id, email, kind, item_id, title, credits, amount, status,billing_quote)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8::jsonb) RETURNING *`,
    [id, o.email.toLowerCase(), o.kind, o.itemId, o.title, o.credits, o.amount,o.billingQuote?JSON.stringify(o.billingQuote):null]
  );
  return rowToOrder(rows[0]);
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query<OrderDbRow>(
    `SELECT * FROM app_orders WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToOrder(rows[0]) : null;
}

/** Marks an order paid and grants the entitlement, atomically + idempotently.
 *  Re-calling on an already-paid order is a no-op (no double credit). */
export async function fulfillOrder(
  orderId: string,
  provider: string,
  providerTxn?: string | null,
  amountFen?:number
): Promise<{ ok: boolean; alreadyPaid: boolean; order?: OrderRow; error?: string }> {
  await ensureSchema();
  const {getBillingRuntime}=await import("@/lib/billing/runtime"),runtime=await getBillingRuntime(),snapshot=await runtime.config.current();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<OrderDbRow>(
      `SELECT * FROM app_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const o = rows[0];
    if (!o) {
      await client.query("ROLLBACK");
      return { ok: false, alreadyPaid: false, error: "订单不存在" };
    }
    if(amountFen!==undefined&&(!Number.isSafeInteger(amountFen)||amountFen!==o.amount)){
      await client.query("ROLLBACK"); return {ok:false,alreadyPaid:false,error:"金额不匹配"};
    }
    if (o.status === "paid") {
      await client.query("COMMIT");
      return { ok: true, alreadyPaid: true, order: rowToOrder(o) };
    }
    // Pro 授权直售订单:不发积分,标记已付后在事务外幂等生成 License Key
    // (ensureProLicenseForOrder,按 batch=orderId 去重)。积分订单走原批次逻辑。
    if (o.kind !== "pro") {
      // Guest recipients get a wallet atomically with the same signup policy as registration.
      const inserted=await client.query("INSERT INTO app_users(email,name,plan,credits_total,credits_used,renews_at) VALUES($1,'','starter',0,0,$2) ON CONFLICT(email) DO NOTHING",[o.email,oneMonthFromNowISO()]);
      if(inserted.rowCount)await signupGrantTx(client,o.email,snapshot);
      const expiry=o.billing_quote?.product.expiry??{unit:"years" as const,value:2};
      if(o.credits>0)await runtime.service.grantTx(client,{id:`order-${o.id}`,email:o.email,amount:o.credits,source:"purchase",reason:`购买${o.title||"积分"}`,expiry,orderId:o.id,ledgerId:`led-order-${o.id}`,actor:provider,fingerprint:o.id});
    }
    await client.query(
      `UPDATE app_orders SET status='paid', provider=$2, provider_txn=$3,
          paid_at=now() WHERE id=$1`,
      [orderId, provider, providerTxn ?? null]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  const updated = await getOrder(orderId);
  // Pro 直售:付款落定后幂等生成授权(失败不影响订单已付;轮询接口会懒补)。
  if (updated?.kind === "pro") {
    await ensureProLicenseForOrder(updated.id, updated.email).catch(() => null);
  }
  return { ok: true, alreadyPaid: false, order: updated ?? undefined };
}

// Pro 直售订单 → License Key(幂等:batch=orderId 唯一)。付款回调与订单轮询
// 都会调它,先查后建;生成后绑定买家邮箱,可溯源可吊销。有效期 365 天。
export async function ensureProLicenseForOrder(
  orderId: string,
  emailRaw: string
): Promise<string | null> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  const { rows } = await getPool().query<{ key: string }>(
    `SELECT key FROM app_licenses WHERE batch = $1 LIMIT 1`,
    [orderId]
  );
  if (rows[0]) return rows[0].key;
  const [lic] = await generateLicenses({
    count: 1,
    tier: "pro",
    expiryDays: 365,
    batch: orderId,
    note: `官网直售 ${email}`,
  });
  if (!lic) return null;
  await getPool().query(
    `UPDATE app_licenses SET bound_email = $2 WHERE key = $1`,
    [lic.key, email]
  );
  return lic.key;
}

/** 原子预扣占位:credits_used += n,门槛 = 活批次余额 - 已占位 >= n。
 *  本金不在此刻扣,真正扣减发生在结算(addLedgerEntry 负数)。余额不足返回 false。 */
export async function reserveCredits(
  emailRaw: string,
  n: number
): Promise<boolean> {
  const {currentSynchronousBilling}=await import("@/lib/billing/synchronous-operation");
  if(currentSynchronousBilling()?.operation)return true;
  // 是否计费:①Supabase 多用户(官方云)②原生多用户 ③站长手动开的「积分计费」开关
  //(单用户也可开来给自己/他人做用量控制)。三者任一为真则扣分,否则放行(不扣)。
  // 动态 import 避免静态循环。
  const email = emailRaw.toLowerCase();
  const { supabaseEnabled } = await import("@/lib/auth-mode");
  const { multiUserEnabled, creditsMeteringOn } = await import(
    "@/lib/native-auth"
  );
  const meterOn = await creditMeteringEnabled();
  if (!meterOn) return true; // 未开计费 → 放行,不扣积分
  await ensureSchema();
  if (n <= 0) return true;
  await expireDueBatches(email);
  const { rowCount } = await getPool().query(
    `UPDATE app_users u
        SET credits_used = credits_used + $2
      WHERE u.email = $1
        AND (SELECT COALESCE(SUM(remaining),0) FROM app_credit_batches b
              WHERE b.email = u.email AND b.expires_at > now() AND b.remaining > 0)
            - u.credits_used >= $2`,
    [email, n]
  );
  return (rowCount ?? 0) > 0;
}

export async function refundCredits(
  emailRaw: string,
  n: number
): Promise<void> {
  const {currentSynchronousBilling}=await import("@/lib/billing/synchronous-operation");
  const context=currentSynchronousBilling();
  if(context?.operation){
    const {createBillingService,withBillingTransaction}=await import("@/lib/billing/service");
    await withBillingTransaction(getPool(),tx=>createBillingService().settleTx(tx,context.operation!,{state:context.upstream==="rejected"||context.upstream==="unobserved"||context.feature==="tool.printfile"?"failed":"unknown",items:[]}));return;
  }
  // 与 reserveCredits 放行口径一致:未计费的场景无需退款。
  const { supabaseEnabled } = await import("@/lib/auth-mode");
  const { multiUserEnabled, creditsMeteringOn } = await import(
    "@/lib/native-auth"
  );
  const meterOn = await creditMeteringEnabled();
  if (!meterOn) return;
  await ensureSchema();
  await getPool().query(
    `UPDATE app_users
        SET credits_used = GREATEST(credits_used - $2, 0)
      WHERE email = $1`,
    [emailRaw.toLowerCase(), n]
  );
}

// --- Templates ------------------------------------------------------------

type TemplateRow = {
  id: string;
  title: string;
  category: string;
  industry: string;
  description: string;
  prompt: string;
  tags: string[];
  image: string;
  gradient: string;
  popular: boolean;
  homepageFeatured?: boolean;
  sourceImage?: string; // 白底原图(作品转模板带进来的);爬来的库模板为空
};

// SQL 列名 → JS key (DB 用 snake_case, JS 用 camelCase 透出去)
type TemplateRowRaw = Omit<TemplateRow, "homepageFeatured" | "sourceImage"> & {
  homepage_featured?: boolean;
  source_image?: string;
};

export type TemplateImageCacheCandidate = {
  id: string;
  image: string;
  source: string;
};

export type TemplateImageCacheStats = {
  total: number;
  cached: number;
  remaining: number;
  failed: number;
};

export type TemplateImageCacheState = {
  image: string;
  imageSource: string;
};

function rowToTemplate(r: TemplateRowRaw): TemplateRow {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    industry: r.industry,
    description: r.description,
    prompt: r.prompt,
    tags: r.tags ?? [],
    image: r.image,
    gradient: r.gradient,
    popular: r.popular === true,
    homepageFeatured: r.homepage_featured === true,
    sourceImage: r.source_image ?? "",
  };
}

export async function listTemplates(): Promise<TemplateRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query<TemplateRow>(
    `SELECT id, title, category, industry, description, prompt, tags,
            image, gradient, popular, homepage_featured, source_image
       FROM app_templates
      ORDER BY sort_index DESC, id ASC`
  );
  return rows.map(rowToTemplate);
}

/** 返回尚未处理的远程模板封面；失败项默认留待下次人工重试。 */
export async function listTemplateImageCacheCandidates(
  limit = 12
): Promise<TemplateImageCacheCandidate[]> {
  await ensureSchema();
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const { rows } = await getPool().query<{ id: string; image: string }>(
    `SELECT id, image
       FROM app_templates
      WHERE (image ~* '^https?://' OR image LIKE '/api/tpl-image?%')
        AND image_cached_at IS NULL
        AND image_cache_error = ''
      ORDER BY sort_index DESC, id ASC
      LIMIT $1`,
    [safeLimit]
  );
  return rows.flatMap((row) => {
    const source = remoteTemplateImageSource(row.image);
    return source ? [{ ...row, source }] : [];
  });
}

export async function getTemplateImageCacheState(
  id: string
): Promise<TemplateImageCacheState | null> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    image: string;
    image_source: string;
  }>(
    `SELECT image, image_source FROM app_templates WHERE id = $1`,
    [id]
  );
  return rows[0]
    ? { image: rows[0].image, imageSource: rows[0].image_source || "" }
    : null;
}

/** 懒缓存/批量缓存成功后，仅在图片仍为预期值时回写，避免覆盖管理员并发编辑。 */
export async function setTemplateImageCacheSuccess(
  id: string,
  expectedImage: string,
  source: string,
  cachedUrl: string
): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE app_templates
        SET image = $4,
            image_source = $3,
            image_cached_at = now(),
            image_cache_error = '',
            image_cache_attempted_at = now(),
            updated_at = now()
      WHERE id = $1 AND image = $2`,
    [id, expectedImage, source, cachedUrl]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setTemplateImageCacheFailure(
  id: string,
  expectedImage: string,
  source: string,
  error: string
): Promise<boolean> {
  await ensureSchema();
  const message = error.trim().slice(0, 500) || "模板图片缓存失败";
  const result = await getPool().query(
    `UPDATE app_templates
        SET image_source = CASE WHEN image_source = '' THEN $3 ELSE image_source END,
            image_cache_error = $4,
            image_cache_attempted_at = now()
      WHERE id = $1 AND image = $2`,
    [id, expectedImage, source, message]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function resetTemplateImageCacheFailures(): Promise<number> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE app_templates
        SET image_cache_error = '', image_cache_attempted_at = NULL
      WHERE image_cache_error <> ''
        AND image_cached_at IS NULL
        AND (image ~* '^https?://' OR image LIKE '/api/tpl-image?%')`
  );
  return result.rowCount ?? 0;
}

export async function getTemplateImageCacheStats(): Promise<TemplateImageCacheStats> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    total: string;
    cached: string;
    remaining: string;
    failed: string;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (
              WHERE image_cached_at IS NOT NULL OR image LIKE '/media/%'
            )::int AS cached,
            count(*) FILTER (
              WHERE image_cached_at IS NULL
                AND image_cache_error = ''
                AND (image ~* '^https?://' OR image LIKE '/api/tpl-image?%')
            )::int AS remaining,
            count(*) FILTER (
              WHERE image_cached_at IS NULL
                AND image_cache_error <> ''
                AND (image ~* '^https?://' OR image LIKE '/api/tpl-image?%')
            )::int AS failed
       FROM app_templates`
  );
  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    cached: Number(row?.cached ?? 0),
    remaining: Number(row?.remaining ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}

/** Paged + filterable template list (server-side). Used by /api/templates. */
export async function listTemplatesPaged(opts: {
  category?: string;
  q?: string;
  ids?: string[];
  page?: number;
  pageSize?: number;
}): Promise<{ items: TemplateRow[]; total: number }> {
  await ensureSchema();
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.ids && opts.ids.length > 0) {
    params.push(opts.ids);
    where.push(`id = ANY($${params.length})`);
  }
  if (opts.category) {
    params.push(opts.category);
    where.push(`category = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(lower(title) LIKE $${i} OR lower(industry) LIKE $${i} OR lower(id) LIKE $${i} OR EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE lower(t) LIKE $${i}))`
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize || 24));
  const offset = (page - 1) * pageSize;
  const totalRes = await getPool().query<{ n: string }>(
    `SELECT count(*)::int AS n FROM app_templates ${whereSql}`,
    params
  );
  const total = Number(totalRes.rows[0]?.n ?? 0);
  // 省 egress:列表浏览不取 prompt 长文本(16k 模板每页拉一堆全文 → 流量大头);
  // 只有按 ids 精确取详情(预览弹层 / 生成页做同款)才 SELECT prompt。
  const detail = !!(opts.ids && opts.ids.length > 0);
  const promptCol = detail ? "prompt" : "'' AS prompt";
  // source_image(白底原图)同样只在详情(ids,做同款/预览)取,列表浏览不取省流量。
  const sourceCol = detail ? "source_image" : "'' AS source_image";
  const itemsRes = await getPool().query<TemplateRow>(
    `SELECT id, title, category, industry, description, ${promptCol}, tags,
            image, gradient, popular, homepage_featured, ${sourceCol}
       FROM app_templates ${whereSql}
      ORDER BY sort_index DESC, id ASC
      LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );
  return { items: itemsRes.rows.map(rowToTemplate), total };
}

// --- User favorites (collections of templates) -----------------------------

/** Return the user's favorite template IDs, newest-favorited first. */
export async function listUserFavs(email: string): Promise<string[]> {
  await ensureSchema();
  const { rows } = await getPool().query<{ template_id: string }>(
    `SELECT template_id FROM app_user_favs
      WHERE email = $1
      ORDER BY created_at DESC`,
    [email]
  );
  return rows.map((r) => r.template_id);
}

/** Idempotent — re-favoriting an id is a no-op (ON CONFLICT DO NOTHING). */
export async function addUserFav(
  email: string,
  templateId: string
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_user_favs (email, template_id)
     VALUES ($1, $2)
     ON CONFLICT (email, template_id) DO NOTHING`,
    [email, templateId]
  );
}

export async function removeUserFav(
  email: string,
  templateId: string
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `DELETE FROM app_user_favs WHERE email = $1 AND template_id = $2`,
    [email, templateId]
  );
}

/** Templates an admin has manually flagged with the 上首页 toggle — these
 *  are guaranteed to show on the homepage regardless of auto-pool eligibility
 *  (no dim data / unusual aspect / weird tags etc.). */
export async function listHomepageFeaturedTemplates(): Promise<TemplateRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query<TemplateRow>(
    `SELECT id, title, category, industry, description, prompt, tags,
            image, gradient, popular, homepage_featured
       FROM app_templates
      WHERE homepage_featured = true`
  );
  return rows.map(rowToTemplate);
}

/** Toggle the 上首页 flag on a template (admin action). */
export async function setTemplateHomepageFeatured(
  id: string,
  featured: boolean
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_templates SET homepage_featured = $2 WHERE id = $1`,
    [id, featured]
  );
}

/** Fetch all templates in a given set of categories — used by the homepage
 *  picker (SSR). Returns the same shape as listTemplatesPaged but without
 *  pagination or text search. */
export async function listTemplatesInCategories(
  categories: string[]
): Promise<TemplateRow[]> {
  await ensureSchema();
  if (categories.length === 0) return [];
  const { rows } = await getPool().query<TemplateRow>(
    `SELECT id, title, category, industry, description, prompt, tags,
            image, gradient, popular, homepage_featured
       FROM app_templates
      WHERE category = ANY($1)`,
    [categories]
  );
  return rows.map(rowToTemplate);
}

/** {category, count} pairs for the templates filter sidebar. */
export async function listTemplateCategories(): Promise<
  { name: string; count: number }[]
> {
  await ensureSchema();
  const { rows } = await getPool().query<{ name: string; count: string }>(
    `SELECT category AS name, count(*)::int AS count
       FROM app_templates
      WHERE category <> ''
      GROUP BY category
      ORDER BY count(*) DESC, category ASC`
  );
  return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
}

export async function getTemplate(
  id: string
): Promise<TemplateRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query<TemplateRow>(
    `SELECT id, title, category, industry, description, prompt, tags,
            image, gradient, popular, homepage_featured
       FROM app_templates WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}

export async function updateTemplate(
  id: string,
  patch: Partial<TemplateRow>
): Promise<TemplateRow | null> {
  await ensureSchema();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const cols: Record<string, unknown> = {
    title: patch.title,
    category: patch.category,
    industry: patch.industry,
    description: patch.description,
    prompt: patch.prompt,
    tags: patch.tags,
    image: patch.image,
    gradient: patch.gradient,
    popular: patch.popular,
    homepage_featured: patch.homepageFeatured,
  };
  for (const [k, v] of Object.entries(cols)) {
    if (v !== undefined) {
      sets.push(`${k} = $${i++}`);
      vals.push(v);
    }
  }
  if (patch.image !== undefined) {
    sets.push(`image_source = ''`);
    sets.push(`image_cached_at = NULL`);
    sets.push(`image_cache_error = ''`);
    sets.push(`image_cache_attempted_at = NULL`);
  }
  if (sets.length === 0) return getTemplate(id);
  sets.push(`updated_at = now()`);
  vals.push(id);
  const { rows } = await getPool().query<TemplateRow>(
    `UPDATE app_templates SET ${sets.join(", ")}
      WHERE id = $${i} RETURNING *`,
    vals
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}

/** Creates a template, placing it on top (highest sort_index). Idempotent on
 *  id: if the id already exists, the existing row is returned unchanged so
 *  importing the same artwork twice never duplicates. */
export async function createTemplate(
  t: Omit<PromptTemplate, "id"> & { id?: string }
): Promise<{ template: TemplateRow; created: boolean }> {
  await ensureSchema();
  const id =
    t.id && t.id.trim()
      ? t.id.trim()
      : `tpl-imp-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const mx = await getPool().query(
    `SELECT COALESCE(MAX(sort_index), 0)::int AS m FROM app_templates`
  );
  const sort = mx.rows[0].m + 1;
  // 重新导入(同 id 冲突)时刷新内容 + 回填白底原图,让「重新导入」名副其实
  //(也给早先导入、还没存原图的旧模板补上 source_image)。created 用 xmax=0 判定。
  const { rows } = await getPool().query<TemplateRow & { created: boolean }>(
    `INSERT INTO app_templates
       (id, title, category, industry, description, prompt, tags,
        image, gradient, popular, sort_index, source_image)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        prompt = EXCLUDED.prompt,
        image = EXCLUDED.image,
        gradient = EXCLUDED.gradient,
        source_image = EXCLUDED.source_image
     RETURNING *, (xmax = 0) AS created`,
    [
      id,
      t.title,
      t.category,
      t.industry ?? "",
      t.description ?? "",
      t.prompt,
      t.tags ?? [],
      t.image ?? "",
      t.gradient ?? "from-emerald-100 to-teal-100",
      t.popular === true,
      sort,
      t.sourceImage ?? "",
    ]
  );
  if (rows[0]) return { template: rowToTemplate(rows[0]), created: rows[0].created };
  throw new Error("模板创建失败");
}

/** Seeds the templates table from the bundled static list if it's empty.
 *  Idempotent thanks to ON CONFLICT DO NOTHING. */
// Sync the bundled template list (templates-data.ts) into this instance's DB.
// `templates-data.ts` is the single source of truth for bulk templates: each
// deploy runs this once, inserting any NEW templates (by id). Existing rows are
// left untouched (ON CONFLICT DO NOTHING) so admin-panel edits/additions are
// never clobbered. Because both the 海外 and 国内 instances share this code and
// both redeploy on a template change, a scraped batch lands on both sites
// automatically — no separate DB-to-DB sync needed.
export async function syncTemplatesFromCode(
  seed: PromptTemplate[]
): Promise<{ inserted: number; total: number; skipped?: boolean }> {
  await ensureSchema();

  // Fast-path: if the DB already has at least as many rows as the seed,
  // every seed id is either already inserted or has been deleted on purpose
  // — either way, running 6000+ no-op INSERTs over the pooler is the wrong
  // thing to do (it was making the first /api/templates request after every
  // pm2 restart block 30-60s). Skip entirely. Cold starts and template-batch
  // additions fall through to the batched insert below.
  const cnt = await getPool().query<{ n: string }>(
    `SELECT count(*)::int AS n FROM app_templates`
  );
  const have = Number(cnt.rows[0]?.n ?? 0);
  if (have >= seed.length) {
    return { inserted: 0, total: seed.length, skipped: true };
  }

  // Cold path: batched multi-row INSERT (≈500 rows per statement, ~13 round
  // trips for 6500 templates vs 6500 individual statements).
  const COLS = 11;
  const BATCH = 500;
  const client = await getPool().connect();
  let inserted = 0;
  try {
    await client.query("BEGIN");
    for (let start = 0; start < seed.length; start += BATCH) {
      const slice = seed.slice(start, start + BATCH);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      slice.forEach((t, j) => {
        const base = j * COLS;
        placeholders.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${
            base + 6
          },$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`
        );
        values.push(
          t.id,
          t.title,
          t.category,
          t.industry ?? "",
          t.description ?? "",
          t.prompt,
          t.tags ?? [],
          t.image ?? "",
          t.gradient ?? "from-emerald-100 to-teal-100",
          t.popular === true,
          seed.length - (start + j) // newest (index 0) gets the highest sort_index
        );
      });
      const r = await client.query(
        `INSERT INTO app_templates
           (id, title, category, industry, description, prompt, tags,
            image, gradient, popular, sort_index)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (id) DO NOTHING`,
        values
      );
      inserted += r.rowCount ?? 0;
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { inserted, total: seed.length };
}

/**
 * 导入一批模板(买家实例「同步官方模板库」用):ON CONFLICT DO NOTHING,
 * 不覆盖站长本地改动。sort_index 按官方全库位置倒排(offset 越小 = 越新 = 越大),
 * 与官方站展示顺序一致。
 */
export async function importTemplates(
  items: Array<{
    id: string;
    title: string;
    category: string;
    industry?: string;
    description?: string;
    prompt?: string;
    tags?: string[];
    image?: string;
    gradient?: string;
    popular?: boolean;
  }>,
  totalCount: number,
  offset: number
): Promise<number> {
  await ensureSchema();
  if (items.length === 0) return 0;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  const COLS = 11;
  items.forEach((t, j) => {
    const base = j * COLS;
    placeholders.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${
        base + 6
      },$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`
    );
    values.push(
      t.id,
      t.title,
      t.category ?? "",
      t.industry ?? "",
      t.description ?? "",
      t.prompt ?? "",
      t.tags ?? [],
      t.image ?? "",
      t.gradient ?? "from-emerald-100 to-teal-100",
      t.popular === true,
      Math.max(0, totalCount - (offset + j))
    );
  });
  const r = await getPool().query(
    `INSERT INTO app_templates
       (id, title, category, industry, description, prompt, tags,
        image, gradient, popular, sort_index)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (id) DO NOTHING`,
    values
  );
  return r.rowCount ?? 0;
}

// --- Phone binding (a phone bound to an account is stored on app_users.phone;
//     phone-OTP login resolves a bound phone to that account's email) ---------

/** The account email that has this phone bound, or null. */
export async function findEmailByBoundPhone(
  phone: string
): Promise<string | null> {
  await ensureSchema();
  const r = await getPool().query(
    `SELECT email FROM app_users WHERE phone = $1 LIMIT 1`,
    [phone]
  );
  return r.rows[0]?.email ?? null;
}

/** Whether this Supabase auth email already exists (e.g. a synthetic phone account). */
export async function authEmailExists(email: string): Promise<boolean> {
  await ensureSchema();
  const r = await getPool().query(
    `SELECT 1 FROM auth.users WHERE email = $1 LIMIT 1`,
    [email]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Bind a phone to an existing account (by email). Returns false if no row. */
export async function bindPhoneToEmail(
  email: string,
  phone: string
): Promise<boolean> {
  await ensureSchema();
  const r = await getPool().query(
    `UPDATE app_users SET phone = $2 WHERE email = $1`,
    [email, phone]
  );
  return (r.rowCount ?? 0) > 0;
}

// ── genchat 对话会话(多会话持久化) ──
export type GenchatSessionMeta = { id: string; title: string; updatedAt: string };

export async function listGenchatSessions(
  email: string
): Promise<GenchatSessionMeta[]> {
  if (!dbEnabled) return [];
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, title, updated_at FROM app_genchat_sessions
     WHERE email = $1 ORDER BY updated_at DESC LIMIT 50`,
    [email.toLowerCase()]
  );
  return rows.map((r) => ({
    id: r.id as string,
    title: (r.title as string) || "",
    updatedAt: new Date(r.updated_at as string).toISOString(),
  }));
}

export async function getGenchatSession(
  email: string,
  id: string
): Promise<{ id: string; title: string; turns: unknown } | null> {
  if (!dbEnabled) return null;
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, title, turns FROM app_genchat_sessions WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, title: rows[0].title || "", turns: rows[0].turns };
}

export async function saveGenchatSession(
  email: string,
  id: string,
  title: string,
  turns: unknown
): Promise<void> {
  if (!dbEnabled) return;
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_genchat_sessions (id, email, title, turns, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title, turns = EXCLUDED.turns, updated_at = now()`,
    [id, email.toLowerCase(), title.slice(0, 120), JSON.stringify(turns ?? [])]
  );
}

// ── Agent 任务会话 ──────────────────────────────────────────────────────────
export type AgentSessionRow = {
  id: string;
  email: string;
  title: string;
  messages: unknown;
  steps: unknown;
  created_at: string;
  updated_at: string;
};

// ── 业务项目注册表 ──────────────────────────────────────────────────────────
export type ProjectRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  color: string;
  category: string;
  agent_tool: boolean;
  run_type: "web" | "script" | "external";
  visible: boolean;
  sort_index: number;
};

// 默认业务项目种子(仅表空时播种一次;后台可增删改)。
// 已有数据只对明确含 Unicode 替换字符(U+FFFD)的默认项目做定向修复，
// 避免历史终端编码错误长期把乱码返回给导航，同时不覆盖正常的后台自定义内容。
const DEFAULT_PROJECTS = [
  { slug: "naumi", name: "Naumi 工具台", description: "AI 生图/套图/A+/精修/换色 美工工作站", url: "/", icon: "Sparkles", color: "#4F46E5", category: "美工", agent_tool: true, sort_index: 1 },
  { slug: "sycm", name: "生意参谋助手", description: "品牌星图选词 → 生意参谋核对 → 淘宝前十比对", url: "", icon: "TrendingUp", color: "#2E7CF6", category: "运营", agent_tool: true, sort_index: 2 },
  { slug: "rag", name: "经营知识库", description: "高管/经理助理 RAG 问答(规划中)", url: "", icon: "BookOpen", color: "#6D5BF6", category: "管理", agent_tool: false, sort_index: 6 },
] as const;

async function repairCorruptedDefaultProjects(): Promise<void> {
  for (const d of DEFAULT_PROJECTS) {
    await getPool().query(
      `UPDATE app_projects
          SET name = $2,
              description = $3,
              icon = $4,
              color = $5,
              category = $6
        WHERE slug = $1
          AND (position(chr(65533) in name) > 0
            OR position(chr(65533) in description) > 0
            OR position(chr(65533) in category) > 0)`,
      [d.slug, d.name, d.description, d.icon, d.color, d.category],
    );
  }
}

let projectsSeeded = false;
export async function seedProjects(): Promise<void> {
  if (projectsSeeded) return;
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT 1 FROM app_projects LIMIT 1`
  );
  if ((rows.length ?? 0) > 0) {
    await repairCorruptedDefaultProjects();
    projectsSeeded = true;
    return;
  }
  for (const d of DEFAULT_PROJECTS) {
    await getPool().query(
      `INSERT INTO app_projects (slug, name, description, url, icon, color, category, agent_tool, visible, sort_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) ON CONFLICT (slug) DO NOTHING`,
      [d.slug, d.name, d.description, d.url, d.icon, d.color, d.category, d.agent_tool, d.sort_index]
    );
  }
  projectsSeeded = true;
}

export async function listProjects(onlyVisible = true): Promise<ProjectRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT * FROM app_projects
      WHERE NOT (lower(trim(slug)) = ANY($1::text[])) ${onlyVisible ? "AND visible = true" : ""}
      ORDER BY sort_index ASC, id ASC`,
    [RETIRED_BUSINESS_PROJECTS],
  );
  return rows as ProjectRow[];
}

export async function upsertProject(p: {
  slug: string; name: string; description?: string; url?: string;
  icon?: string; color?: string; category?: string;
  agent_tool?: boolean; run_type?: string; visible?: boolean; sort_index?: number;
}): Promise<void> {
  if (isRetiredBusinessProject(p.slug)) throw new Error("该业务项目已废弃");
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_projects
       (slug, name, description, url, icon, color, category, agent_tool, run_type, visible, sort_index)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       url = EXCLUDED.url,
       icon = EXCLUDED.icon,
       color = EXCLUDED.color,
       category = EXCLUDED.category,
       agent_tool = EXCLUDED.agent_tool,
       run_type = EXCLUDED.run_type,
       visible = EXCLUDED.visible,
       sort_index = EXCLUDED.sort_index`,
    [p.slug, p.name, p.description ?? "", p.url ?? "", p.icon ?? "Box",
     p.color ?? "#4F46E5", p.category ?? "业务系统",
     p.agent_tool ?? false, p.run_type ?? "web", p.visible ?? true, p.sort_index ?? 0],
  );
}

export async function deleteProject(slug: string): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM app_projects WHERE slug = $1`, [slug]);
}

export async function saveAgentSession(
  email: string,
  id: string,
  title: string,
  messages: unknown,
  steps: unknown
): Promise<void> {
  await ensureSchema();
  await migrateAgentSessions();
  await getPool().query(
    `INSERT INTO app_agent_sessions (id, email, title, messages, steps, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (email, id) DO UPDATE SET
       title = EXCLUDED.title,
       messages = EXCLUDED.messages,
       steps = EXCLUDED.steps,
       updated_at = now()`,
    [id, email.toLowerCase(), title.slice(0, 120), JSON.stringify(messages ?? []), JSON.stringify(steps ?? [])]
  );
}

// 旧库迁移:若表存在但主键不是 (email,id),原地重建(数据保留)。
let agentSessionMigrated = false;
async function migrateAgentSessions(): Promise<void> {
  if (agentSessionMigrated) return;
  const { rows: pkRows } = await getPool().query(
    `SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'app_agent_sessions'
        AND constraint_type = 'PRIMARY KEY'
        AND constraint_name = 'app_agent_sessions_pkey'`
  );
  if (pkRows.length > 0) {
    const { rows: cols } = await getPool().query(
      `SELECT column_name FROM information_schema.key_column_usage
        WHERE table_name = 'app_agent_sessions'
          AND constraint_name = 'app_agent_sessions_pkey'
        ORDER BY ordinal_position`
    );
    const pk = cols.map((c: { column_name: string }) => c.column_name);
    if (pk.length === 2 && pk[0] === "email" && pk[1] === "id") {
      agentSessionMigrated = true;
      return;
    }
  }
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS app_agent_sessions_new (
       id         text NOT NULL,
       email      text NOT NULL,
       title      text NOT NULL DEFAULT '',
       messages   jsonb NOT NULL DEFAULT '[]',
       steps      jsonb NOT NULL DEFAULT '[]',
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (email, id)
     )`
  );
  await getPool().query(
    `INSERT INTO app_agent_sessions_new
       SELECT * FROM app_agent_sessions ON CONFLICT DO NOTHING`
  );
  await getPool().query(`DROP TABLE app_agent_sessions`);
  await getPool().query(
    `ALTER TABLE app_agent_sessions_new RENAME TO app_agent_sessions`
  );
  await getPool().query(
    `CREATE INDEX IF NOT EXISTS app_agent_email_idx
       ON app_agent_sessions (email, updated_at DESC)`
  );
  agentSessionMigrated = true;
}

export async function getAgentSession(
  email: string,
  id: string
): Promise<AgentSessionRow | null> {
  await ensureSchema();
  await migrateAgentSessions();
  const { rows } = await getPool().query(
    `SELECT id, email, title, messages, steps, created_at, updated_at
       FROM app_agent_sessions WHERE id = $1 AND email = $2`,
    [id, email.toLowerCase()]
  );
  return (rows[0] as AgentSessionRow) ?? null;
}

export async function listAgentSessions(
  email: string,
  limit = 20,
  excludeCanvas = false
): Promise<AgentSessionRow[]> {
  await ensureSchema();
  await migrateAgentSessions();
  const { rows } = await getPool().query(
    `SELECT id, email, title, messages, steps, created_at, updated_at
       FROM app_agent_sessions WHERE email = $1 AND ($3::boolean=false OR id NOT LIKE 'cv-%')
      ORDER BY updated_at DESC LIMIT $2`,
    [email.toLowerCase(), limit, excludeCanvas]
  );
  return rows as AgentSessionRow[];
}

export async function renameAgentSession(
  email: string,
  id: string,
  title: string
): Promise<boolean> {
  await ensureSchema();
  await migrateAgentSessions();
  const result = await getPool().query(
    `UPDATE app_agent_sessions
        SET title = $3, updated_at = now()
      WHERE id = $1 AND email = $2`,
    [id, email.toLowerCase(), title.slice(0, 120)]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAgentSession(email: string, id: string): Promise<void> {
  await ensureSchema();
  await migrateAgentSessions();
  await getPool().query(
    `DELETE FROM app_agent_sessions WHERE id = $1 AND email = $2`,
    [id, email.toLowerCase()]
  );
}

export async function deleteGenchatSession(
  email: string,
  id: string
): Promise<void> {
  if (!dbEnabled) return;
  await ensureSchema();
  await getPool().query(
    `DELETE FROM app_genchat_sessions WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
}

// Competitor workspace: owner-scoped optimistic writes and expiring model leases.
let competitorSchema: Promise<void> | null = null;
async function ensureCompetitorSchema() {
  await ensureSchema();
  if (!competitorSchema) competitorSchema = getPool().query(`
    CREATE TABLE IF NOT EXISTS app_competitor_items (
      id uuid PRIMARY KEY, email text NOT NULL, batch_id uuid NOT NULL,
      path text NOT NULL, state jsonb NOT NULL, revision integer NOT NULL DEFAULT 0,
      job_id uuid, busy_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(email, batch_id, path)
    );
    CREATE INDEX IF NOT EXISTS app_competitor_owner_idx ON app_competitor_items(email, created_at);
  `).then(() => {}).catch(e => { competitorSchema = null; throw e; });
  await competitorSchema;
}
function competitorRow(r: Record<string, any>): CompetitorItem {
  return { ...r.state, id: r.id, batchId: r.batch_id, path: r.path,
    revision: r.revision, busy: !!r.busy_until && new Date(r.busy_until).getTime() > Date.now(),
    createdAt: new Date(r.created_at).toISOString() };
}
export async function listCompetitorItems(email: string) {
  await ensureCompetitorSchema();
  const { rows } = await getPool().query("SELECT * FROM app_competitor_items WHERE email=$1 ORDER BY created_at DESC LIMIT 500", [email]);
  return rows.map(competitorRow);
}
export async function getCompetitorItem(email: string, id: string) {
  await ensureCompetitorSchema();
  const { rows } = await getPool().query("SELECT * FROM app_competitor_items WHERE email=$1 AND id=$2", [email, id]);
  return rows[0] ? competitorRow(rows[0]) : null;
}
export async function insertCompetitorItem(email: string, item: CompetitorItem) {
  await ensureCompetitorSchema();
  const { rows } = await getPool().query(`INSERT INTO app_competitor_items (id,email,batch_id,path,state)
    VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT(email,batch_id,path) DO UPDATE SET path=EXCLUDED.path RETURNING *`,
    [item.id, email, item.batchId, item.path, JSON.stringify(item)]);
  return competitorRow(rows[0]);
}
export async function saveCompetitorItem(email: string, item: CompetitorItem, jobId?: string) {
  await ensureCompetitorSchema();
  const { rows } = await getPool().query(`UPDATE app_competitor_items SET state=$4::jsonb,
    revision=revision+1, job_id=NULL, busy_until=NULL WHERE email=$1 AND id=$2 AND
    ${jobId ? "job_id=$3::uuid" : "revision=$3::integer AND (busy_until IS NULL OR busy_until < now())"} RETURNING *`,
    [email, item.id, jobId || item.revision, JSON.stringify(item)]);
  return rows[0] ? competitorRow(rows[0]) : null;
}
export async function claimCompetitorItem(email: string, id: string, revision: number, jobId: string) {
  await ensureCompetitorSchema();
  const { rows } = await getPool().query(`UPDATE app_competitor_items SET job_id=$4,
    busy_until=now()+interval '6 minutes',revision=revision+1 WHERE email=$1 AND id=$2 AND revision=$3
    AND (busy_until IS NULL OR busy_until < now()) RETURNING *`, [email, id, revision, jobId]);
  return rows[0] ? competitorRow(rows[0]) : null;
}
export async function releaseCompetitorItem(email: string, id: string, jobId: string) {
  await getPool().query("UPDATE app_competitor_items SET job_id=NULL,busy_until=NULL WHERE email=$1 AND id=$2 AND job_id=$3", [email,id,jobId]);
}
export async function deleteCompetitorItem(email: string, id: string) {
  await ensureCompetitorSchema();
  const result = await getPool().query("DELETE FROM app_competitor_items WHERE email=$1 AND id=$2 AND (busy_until IS NULL OR busy_until < now())", [email,id]);
  return (result.rowCount || 0) > 0;
}

/** Version, principal deduction, ledger and reservation complete in one transaction. */
export async function finishCompetitorGeneration(email: string, item: CompetitorItem, jobId: string, cost: number) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`UPDATE app_competitor_items SET state=$4::jsonb,
      revision=revision+1,job_id=NULL,busy_until=NULL WHERE email=$1 AND id=$2 AND job_id=$3 RETURNING *`,
      [email, item.id, jobId, JSON.stringify(item)]);
    if (!rows[0]) throw new Error("Generation lease lost");
    const {currentSynchronousBilling,settleSynchronous}=await import("@/lib/billing/synchronous-operation");
    if(currentSynchronousBilling())await settleSynchronous("竞品工作台生成",undefined,client);
    else if (cost > 0) {
      await deductPrincipalFIFO(client, email, cost);
      await client.query("UPDATE app_users SET credits_used=GREATEST(credits_used-$2,0) WHERE email=$1", [email,cost]);
      await client.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,$3,$4,'consume')", [ledId(),email,-cost,"竞品工作台生成"]);
    }
    await client.query("DELETE FROM app_gen_reservations WHERE job_id=$1", [jobId]);
    await client.query("COMMIT");
    await refreshBalance(email).catch(() => {});
    return competitorRow(rows[0]);
  } catch(e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}

// ── ComfyUI 端点与工作流(BYOC:用户自备算力端点) ─────────────────────────────

export type ComfyEndpointRow = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  isActive: boolean;
};

export async function listComfyEndpoints(email: string): Promise<ComfyEndpointRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, base_url, api_key, is_active
       FROM app_comfyui_endpoints
      WHERE email = $1
      ORDER BY is_active DESC, updated_at DESC`,
    [email.toLowerCase()]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    baseUrl: String(r.base_url),
    apiKey: String(r.api_key),
    isActive: Boolean(r.is_active),
  }));
}

export async function getActiveComfyEndpoint(email: string): Promise<ComfyEndpointRow | null> {
  const list = await listComfyEndpoints(email);
  return list.find((e) => e.isActive) ?? null;
}

/** 保存端点;activate=true 时取消其他端点的激活态(一人同时仅一个活动端点)。 */
export async function saveComfyEndpoint(
  email: string,
  input: { id?: string; name?: string; baseUrl: string; apiKey?: string; activate?: boolean }
): Promise<ComfyEndpointRow[]> {
  await ensureSchema();
  const lower = email.toLowerCase();
  const id = input.id?.trim() || crypto.randomUUID();
  const existing = input.id
    ? (await listComfyEndpoints(email)).find((e) => e.id === input.id)
    : null;
  if (input.id && !existing) throw new Error("端点不存在");
  const { rows: countRows } = await getPool().query(
    `SELECT count(*)::int AS n FROM app_comfyui_endpoints WHERE email = $1`,
    [lower]
  );
  if (!existing && Number(countRows[0]?.n ?? 0) >= 4) {
    throw new Error("最多保存 4 个端点，请先删除不用的");
  }
  const apiKey = input.apiKey?.trim() ?? existing?.apiKey ?? "";
  await getPool().query(
    `INSERT INTO app_comfyui_endpoints (id, email, name, base_url, api_key, is_active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       base_url = EXCLUDED.base_url,
       api_key = EXCLUDED.api_key,
       is_active = EXCLUDED.is_active,
       updated_at = now()`,
    [
      id,
      lower,
      (input.name?.trim() || existing?.name || "ComfyUI").slice(0, 40),
      input.baseUrl.trim().slice(0, 300),
      apiKey.slice(0, 300),
      Boolean(input.activate ?? existing?.isActive ?? false),
    ]
  );
  if (input.activate) {
    await getPool().query(
      `UPDATE app_comfyui_endpoints SET is_active = false
        WHERE email = $1 AND id <> $2`,
      [lower, id]
    );
  }
  return listComfyEndpoints(email);
}

export async function deleteComfyEndpoint(email: string, id: string): Promise<ComfyEndpointRow[]> {
  await ensureSchema();
  await getPool().query(
    `DELETE FROM app_comfyui_endpoints WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
  return listComfyEndpoints(email);
}

export type ComfyWorkflowRow = {
  id: string;
  name: string;
  inputs: unknown;
  required: unknown;
  note: string;
  isPublic: boolean;
  author: string;
  updatedAt: string;
};

export async function listComfyWorkflows(email: string): Promise<ComfyWorkflowRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, inputs, required, note, is_public, author, updated_at
       FROM app_comfyui_workflows
      WHERE email = $1
      ORDER BY updated_at DESC`,
    [email.toLowerCase()]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    inputs: r.inputs,
    required: r.required,
    note: String(r.note ?? ""),
    isPublic: Boolean(r.is_public),
    author: String(r.author ?? ""),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  }));
}

export async function getComfyWorkflow(
  email: string,
  id: string
): Promise<(ComfyWorkflowRow & { apiJson: Record<string, unknown> }) | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, api_json, inputs, required, note, is_public, author, updated_at
       FROM app_comfyui_workflows
      WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    name: String(r.name),
    apiJson: (r.api_json ?? {}) as Record<string, unknown>,
    inputs: r.inputs,
    required: r.required,
    note: String(r.note ?? ""),
    isPublic: Boolean(r.is_public),
    author: String(r.author ?? ""),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}

export async function saveComfyWorkflow(
  email: string,
  input: { id?: string; name: string; apiJson: unknown; inputs: unknown; required: unknown; note?: string }
): Promise<ComfyWorkflowRow[]> {
  await ensureSchema();
  const lower = email.toLowerCase();
  const id = input.id?.trim() || crypto.randomUUID();
  const existing = input.id ? await getComfyWorkflow(email, input.id) : null;
  if (input.id && !existing) throw new Error("工作流不存在");
  const { rows: countRows } = await getPool().query(
    `SELECT count(*)::int AS n FROM app_comfyui_workflows WHERE email = $1`,
    [lower]
  );
  if (!existing && Number(countRows[0]?.n ?? 0) >= 30) {
    throw new Error("最多保存 30 个工作流，请先删除不用的");
  }
  await getPool().query(
    `INSERT INTO app_comfyui_workflows (id, email, name, api_json, inputs, required, note, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       api_json = EXCLUDED.api_json,
       inputs = EXCLUDED.inputs,
       required = EXCLUDED.required,
       note = EXCLUDED.note,
       updated_at = now()`,
    [
      id,
      lower,
      input.name.trim().slice(0, 60) || "未命名工作流",
      JSON.stringify(input.apiJson ?? {}),
      JSON.stringify(input.inputs ?? []),
      JSON.stringify(input.required ?? []),
      (input.note ?? "").slice(0, 500),
    ]
  );
  return listComfyWorkflows(email);
}

export async function deleteComfyWorkflow(email: string, id: string): Promise<ComfyWorkflowRow[]> {
  await ensureSchema();
  await getPool().query(
    `DELETE FROM app_comfyui_workflows WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
  return listComfyWorkflows(email);
}

/** 发布/取消发布到公开市场;发布时记录展示名(邮箱本地部分)。 */
export async function publishComfyWorkflow(
  email: string,
  id: string,
  isPublic: boolean
): Promise<void> {
  await ensureSchema();
  const lower = email.toLowerCase();
  await getPool().query(
    `UPDATE app_comfyui_workflows
        SET is_public = $3,
            author = CASE WHEN $3 THEN $4 ELSE '' END,
            updated_at = now()
      WHERE email = $1 AND id = $2`,
    [lower, id, isPublic, lower.split("@")[0].slice(0, 24)]
  );
}

export type MarketWorkflowRow = {
  id: string;
  name: string;
  author: string;
  inputs: unknown;
  required: unknown;
  note: string;
  updatedAt: string;
};

/** 公开市场列表(不含自己的)。 */
export async function listPublicComfyWorkflows(email: string): Promise<MarketWorkflowRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, author, inputs, required, note, updated_at
       FROM app_comfyui_workflows
      WHERE is_public AND email <> $1
      ORDER BY updated_at DESC
      LIMIT 50`,
    [email.toLowerCase()]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    author: String(r.author ?? ""),
    inputs: r.inputs,
    required: r.required,
    note: String(r.note ?? ""),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  }));
}

/** 从市场复制公开工作流到自己的库(深拷贝 api_json/inputs/required)。 */
export async function copyComfyWorkflow(email: string, id: string): Promise<string> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT name, author, api_json, inputs, required
       FROM app_comfyui_workflows
      WHERE id = $1 AND is_public`,
    [id]
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) throw new Error("工作流不存在或未公开");
  const newId = crypto.randomUUID();
  await getPool().query(
    `INSERT INTO app_comfyui_workflows (id, email, name, api_json, inputs, required, note, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
    [
      newId,
      email.toLowerCase(),
      `${String(r.name).slice(0, 50)}（市场导入）`,
      JSON.stringify(r.api_json ?? {}),
      JSON.stringify(r.inputs ?? []),
      JSON.stringify(r.required ?? []),
      `来自市场 · @${String(r.author ?? "")}`.slice(0, 500),
    ]
  );
  return newId;
}
