export {listTemplates,listTemplatesPaged,listHomepageFeaturedTemplates,setTemplateHomepageFeatured,listTemplatesInCategories,listTemplateCategories,getTemplate,updateTemplate,createTemplate,listUserFavs,addUserFav,removeUserFav} from "@/lib/templates/repository";
export {type TemplateImageCacheCandidate,type TemplateImageCacheStats,type TemplateImageCacheState,listTemplateImageCacheCandidates,getTemplateImageCacheState,setTemplateImageCacheSuccess,setTemplateImageCacheFailure,resetTemplateImageCacheFailures,getTemplateImageCacheStats} from "@/lib/templates/cache-repository";
export {syncTemplatesFromCode,importTemplates} from "@/lib/templates/import";
export {type GenchatSessionMeta,listGenchatSessions,getGenchatSession,saveGenchatSession,deleteGenchatSession} from "@/lib/genchat/repository";
export {type AgentSessionRow,saveAgentSession,getAgentSession,listAgentSessions,renameAgentSession,deleteAgentSession} from "@/lib/agent/session-repository";
export {type ProjectRow,seedProjects,listProjects,upsertProject,deleteProject} from "@/lib/projects/repository";
export {listCompetitorItems,getCompetitorItem,insertCompetitorItem,saveCompetitorItem,claimCompetitorItem,releaseCompetitorItem,deleteCompetitorItem} from "@/lib/competitor/repository";
export {finishCompetitorGeneration} from "@/lib/competitor/completion";
export {type ComfyEndpointRow,listComfyEndpoints,getActiveComfyEndpoint,saveComfyEndpoint,deleteComfyEndpoint,type ComfyWorkflowRow,listComfyWorkflows,getComfyWorkflow,saveComfyWorkflow,deleteComfyWorkflow,publishComfyWorkflow,type MarketWorkflowRow,listPublicComfyWorkflows,copyComfyWorkflow} from "@/lib/comfyui/repository";
export {findEmailByBoundPhone,authEmailExists,bindPhoneToEmail} from "@/lib/accounts/repository";
export {type LedgerRow,listLedger,addLedgerEntry,listUserLedger,listUserLedgerFiltered} from "@/lib/billing/legacy-ledger";
export {addCreditBatch,adjustUserCredits} from "@/lib/billing/grants";
import {expireDueBatches} from "@/lib/billing/wallet-balance";
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
import {randomUUID} from "node:crypto";
import type {ProductReceipt} from "@/lib/payments";
import {signupGrantTx} from "@/lib/billing/entitlements";
import {withTransaction as withBillingTransaction} from "@/platform/db/transaction";
import {BillingError} from "@/lib/billing/types";
import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "./persistence/schema";
import {getSetting,setSetting} from "./settings/repository";
export {getSetting,setSetting} from "./settings/repository";
export {getSignupBonus,setSignupBonus} from "./billing/signup";

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
