import "server-only";
import {getPool} from "@/platform/db/pool";
import {withTransaction as withBillingTransaction} from "@/platform/db/transaction";
import {ensureSchema} from "@/lib/persistence/schema";
import {signupGrantTx} from "@/lib/billing/entitlements";
import {liveWalletPrincipalSql,refreshBalance} from "@/lib/billing/wallet-balance";
import {invoicesFor} from "@/lib/payments/history";
import type {SessionUser, Invoice} from "@/lib/auth-context";
import type {PlanKey} from "@/lib/mock-data";

// Account session projection and signup orchestration, using the real wallet owner.

// 从现在起算满一个月（滚动月，保留日期）。用于注册占位、管理员授予会员等。
// 付款续费/购买走 fulfillOrder 内的 SQL（支持到期日累加）。
export function oneMonthFromNowISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

type UserRow = {
  email: string;
  name: string;
  plan: string;
  credits_total: number;
  credits_used: number;
  joined_at: Date;
  renews_at: Date;
};

async function toSessionUser(row: UserRow, principal?:number): Promise<SessionUser> {
  // creditsTotal = 活批次余额(顺带跑过期 + 同步镜像);creditsUsed = 在途占位。
  // remaining = creditsTotal - creditsUsed 对所有现有读取点继续成立。
  // Login-only sidecars read the live wallet without unrelated business DDL/expiry writes.
  const creditsTotal = principal ?? (process.env.NAUMI_AUTH_LOGIN_ONLY==='1'
    ? Number((await getPool().query(`SELECT (${liveWalletPrincipalSql('$1')}) AS total`,[row.email])).rows[0].total)
    : await refreshBalance(row.email));
  return {
    name: row.name,
    email: row.email,
    plan: row.plan as PlanKey,
    creditsTotal,
    creditsUsed: row.credits_used,
    joinedAt: new Date(row.joined_at).toISOString(),
    renewsAt: new Date(row.renews_at).toISOString(),
    invoices: await invoicesFor(row.email),
  };
}

export async function getOrCreateUser(emailRaw:string,name?:string):Promise<SessionUser>{
  await ensureSchema(); const email=emailRaw.toLowerCase();
  const {getBillingRuntime}=await import("@/lib/billing/runtime"),snapshot=await(await getBillingRuntime()).config.current();
  const row=await withBillingTransaction(getPool(),async tx=>{
    const inserted=(await tx.query<UserRow&{is_new:boolean}>(`INSERT INTO app_users(email,name,plan,credits_total,credits_used,renews_at)
      VALUES($1,$2,'starter',0,0,$3) ON CONFLICT(email) DO UPDATE SET name=CASE WHEN $2<>'' THEN $2 ELSE app_users.name END RETURNING *, (xmax=0) AS is_new`,[email,name??"",oneMonthFromNowISO()])).rows[0];
    if(inserted.is_new)await signupGrantTx(tx,email,snapshot);
    return (await tx.query<UserRow>("SELECT * FROM app_users WHERE email=$1",[email])).rows[0];
  });
  return toSessionUser(row);
}

export async function getUser(
  emailRaw: string
): Promise<SessionUser | null> {
  await ensureSchema();
  const { rows } = await getPool().query<UserRow>(
    `SELECT * FROM app_users WHERE email = $1`,
    [emailRaw.toLowerCase()]
  );
  return rows[0] ? toSessionUser(rows[0]) : null;
}

/** Admin inspection reads the live wallet without running credit expiry or
 * taking the write lock used by normal balance synchronization. */
export async function readUserSnapshot(emailRaw:string):Promise<SessionUser|null>{
  await ensureSchema();
  const {rows}=await getPool().query<UserRow&{principal:number}>(`SELECT u.email,u.name,u.plan,u.credits_total,u.credits_used,u.joined_at,u.renews_at,
    (${liveWalletPrincipalSql('u.email')}) AS principal FROM app_users u WHERE u.email=$1`,[emailRaw.toLowerCase()]);
  return rows[0]?toSessionUser(rows[0],rows[0].principal):null;
}

// 月度会员已下线:本函数只改 plan 标签(后台仍可设),不再动积分/到期/开账单。
// 积分一律走批次(addCreditBatch / fulfillOrder)。
export async function changeUserPlan(
  emailRaw: string,
  planKey: PlanKey
): Promise<{ user: SessionUser; invoice: Invoice | null }> {
  await ensureSchema();
  const email = emailRaw.toLowerCase();
  const { rows } = await getPool().query<UserRow>(
    `UPDATE app_users SET plan = $2 WHERE email = $1 RETURNING *`,
    [email, planKey]
  );
  if (!rows[0]) throw new Error("用户不存在");
  return { user: await toSessionUser(rows[0]), invoice: null };
}
