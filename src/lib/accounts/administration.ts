import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";

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
