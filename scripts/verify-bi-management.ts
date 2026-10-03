import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
async function main() {
  if (
    process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" ||
    new URL(process.env.DATABASE_URL || "http://invalid").hostname !==
      "127.0.0.1"
  )
    throw new Error("Requires isolated local PostgreSQL");
  process.env.SETTINGS_SECRET =
    "fixture-settings-0123456789abcdef0123456789abcdef0123456789";
  process.env.NAUMI_MULTI_USER = "1";
  const db = await import("../src/lib/db");
  const bi = await import("../src/lib/bi/repository");
  const m = await import("../src/lib/bi/user-management");
  const api = await import("../src/app/api/admin/bi/users/route");
  const native = await import("../src/lib/native-auth");
  const pw = await import("../src/lib/pw");
  await bi.ensureBiSchema();
  const pool = db.getPool();
  const prefix = "bi-manager-" + randomUUID();
  const email = prefix + "@example.test",
    admin = prefix + "-admin@example.test",
    actor = prefix + "-operator";
  const req = (cookie: string, body: unknown, origin?: string) =>
    new Request("http://fixture.test/api/admin/bi/users", {
      method: "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify(body),
    });
  const command = (action: string, values: Record<string, unknown> = {}) =>
    m.userCommandSchema.parse({
      id: randomUUID(),
      email,
      action,
      reason: "Isolated acceptance",
      ...values,
    });
  const cookie = (e: string, now = Date.now()) =>
    "nv_user=" + native.signUserSession(e, now);
  let oldAdmins: { email: string; role: string }[] = [];
  try {
    await db.getOrCreateUser(admin, "Fixture admin");
    await db.setUserRole(admin, "admin");
    const create = command("create", {
      name: "Created fixture",
      password: "fixture-only-password-123",
      initialCredits: 250,
      months: 2,
    });
    assert.equal((await api.POST(req("", create))).status, 404);
    assert.equal(
      (await api.POST(req(cookie(admin), create, "https://evil.test"))).status,
      403,
    );
    assert.equal(
      (await api.POST(req(cookie(admin), { ...create, initialCredits: 0.5 })))
        .status,
      400,
    );
    assert.equal((await api.POST(req(cookie(admin), create))).status, 200);
    assert.equal(
      (
        await api.POST(
          req(
            cookie(email),
            command("adjust", { expectedVersion: 1, delta: 50, months: 24 }),
          ),
        )
      ).status,
      404,
    );
    assert.equal((await m.manageBiUser(create, admin)).replayed, true);
    await assert.rejects(
      m.manageBiUser(
        m.userCommandSchema.parse({ ...create, name: "Duplicate payload" }),
        admin,
      ),
      /不同操作/,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT credits_total,management_version,password_hash FROM app_users WHERE email=$1",
          [email],
        )
      ).rows[0].credits_total,
      250,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM app_credit_batches WHERE email=$1",
          [email],
        )
      ).rows[0].n,
      1,
      "Explicit initial grant does not add signup credits",
    );
    await pool.query("UPDATE app_users SET credits_used=20 WHERE email=$1", [
      email,
    ]);
    const adjust = command("adjust", {
      expectedVersion: 1,
      delta: 50,
      months: 3,
    });
    const results = await Promise.all([
      m.manageBiUser(adjust, admin),
      m.manageBiUser(adjust, admin),
    ]);
    assert.equal(results.filter((x) => x.replayed).length, 1);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM app_ledger WHERE id=$1",
          ["led-bi-" + adjust.id],
        )
      ).rows[0].n,
      1,
    );
    const deduct = command("adjust", {
      expectedVersion: 2,
      delta: -40,
      months: 24,
    });
    await m.manageBiUser(deduct, admin);
    assert.equal(
      (
        await pool.query(
          "SELECT remaining FROM app_credit_batches WHERE id=$1",
          ["bat-bi-" + create.id],
        )
      ).rows[0].remaining,
      210,
      "Deductions use the earliest expiry first",
    );
    const balances = (
      await pool.query(
        "SELECT credits_total,credits_used,management_version FROM app_users WHERE email=$1",
        [email],
      )
    ).rows[0];
    assert.deepEqual(balances, {
      credits_total: 260,
      credits_used: 20,
      management_version: 3,
    });
    await assert.rejects(
      m.manageBiUser(
        command("adjust", { expectedVersion: 3, delta: -241, months: 24 }),
        admin,
      ),
      /预留积分/,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT management_version FROM app_users WHERE email=$1",
          [email],
        )
      ).rows[0].management_version,
      3,
    );
    await assert.rejects(
      m.manageBiUser(
        command("profile", {
          expectedVersion: 2,
          name: "Stale",
          phone: "",
          note: "",
        }),
        admin,
      ),
      /刷新/,
    );
    const fail = command("adjust", {
      expectedVersion: 3,
      delta: 5,
      months: 24,
    });
    await pool.query(
      "ALTER TABLE app_bi_access_log RENAME TO app_bi_access_log_failure_fixture",
    );
    try {
      await assert.rejects(m.manageBiUser(fail, admin));
    } finally {
      await pool.query(
        "ALTER TABLE app_bi_access_log_failure_fixture RENAME TO app_bi_access_log",
      );
    }
    assert.equal(
      (
        await pool.query("SELECT credits_total FROM app_users WHERE email=$1", [
          email,
        ])
      ).rows[0].credits_total,
      260,
      "Audit failure rolls the balance back",
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM app_ledger WHERE id=$1",
          ["led-bi-" + fail.id],
        )
      ).rows[0].n,
      0,
      "Audit failure rolls the ledger back",
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM app_bi_management_log WHERE id=$1",
          [fail.id],
        )
      ).rows[0].n,
      0,
    );
    const firstCookie = cookie(email);
    await m.manageBiUser(
      command("ban", { expectedVersion: 3, banned: true }),
      admin,
    );
    assert.equal(
      await native.activeNativeUserEmail(req(firstCookie, {})),
      null,
    );
    await m.manageBiUser(
      command("ban", { expectedVersion: 4, banned: false }),
      admin,
    );
    assert.equal(
      await native.activeNativeUserEmail(req(firstCookie, {})),
      null,
      "Unban does not revive a revoked session",
    );
    const secondCookie = cookie(email, Date.now() + 2);
    assert.equal(
      await native.activeNativeUserEmail(req(secondCookie, {})),
      email,
    );
    const reset = command("reset-password", {
      expectedVersion: 5,
      password: "fixture-reset-password-456",
    });
    await m.manageBiUser(reset, admin);
    assert.equal(
      await native.activeNativeUserEmail(req(secondCookie, {})),
      null,
    );
    const hash = (
      await pool.query("SELECT password_hash FROM app_users WHERE email=$1", [
        email,
      ])
    ).rows[0].password_hash;
    assert.ok(pw.verifyPassword("fixture-reset-password-456", hash));
    assert.equal(
      await native.activeNativeUserEmail(
        req(cookie(email, Date.now() + 5), {}),
      ),
      email,
    );
    await m.manageBiUser(
      command("profile", {
        expectedVersion: 6,
        name: "Updated fixture",
        phone: "fixture-phone",
        note: "operator note",
      }),
      admin,
    );
    oldAdmins = (
      await pool.query(
        "SELECT email,role FROM app_users WHERE role='admin' AND email<>$1",
        [admin],
      )
    ).rows;
    await pool.query(
      "UPDATE app_users SET role='user' WHERE role='admin' AND email<>$1",
      [admin],
    );
    await assert.rejects(
      m.manageBiUser(
        m.userCommandSchema.parse({
          id: randomUUID(),
          email: admin,
          action: "role",
          role: "user",
          expectedVersion: 0,
          reason: "Last admin check",
        }),
        actor,
      ),
      /最后一个/,
    );
    await assert.rejects(
      m.manageBiUser(
        m.userCommandSchema.parse({
          id: randomUUID(),
          email: admin,
          action: "ban",
          banned: true,
          expectedVersion: 0,
          reason: "Admin ban check",
        }),
        actor,
      ),
      /管理员权限/,
    );
    await assert.rejects(
      m.manageBiUser(
        m.userCommandSchema.parse({
          id: randomUUID(),
          email: admin,
          action: "role",
          role: "user",
          expectedVersion: 0,
          reason: "Self guard check",
        }),
        admin,
      ),
      /自己的账户/,
    );
    await m.manageBiUser(
      command("role", { expectedVersion: 7, role: "admin" }),
      actor,
    );
    await m.manageBiUser(
      command("role", { expectedVersion: 8, role: "user" }),
      actor,
    );
    const audit = (
      await pool.query(
        "SELECT changes,request_fingerprint FROM app_bi_management_log WHERE email=$1",
        [email],
      )
    ).rows;
    const json = JSON.stringify(audit);
    assert.ok(!json.includes("fixture-only-password"));
    assert.ok(!json.includes("fixture-reset-password"));
    assert.ok(!json.includes("password_hash"));
    assert.ok(audit.some((r) => r.changes.delta === -40));
    const q = (await import("../src/lib/bi/contracts")).parseBiQuery(
      new URLSearchParams({ q: prefix, section: "overview" }),
    );
    const overview = (await bi.queryBi(q)).overview!;
    assert.equal(
      overview.consumed,
      0,
      "Admin adjustments do not inflate generation consumption",
    );
    assert.equal(
      overview.available,
      260 -
        20 +
        Number(
          (
            await pool.query(
              "SELECT COALESCE(sum(remaining),0)::int AS n FROM app_credit_batches WHERE email=$1 AND expires_at>now()",
              [admin],
            )
          ).rows[0].n,
        ),
    );
    const logs = await bi.queryBi({ ...q, section: "management" });
    assert.ok(logs.total >= 9);
    assert.ok(!JSON.stringify(logs).includes("request_fingerprint"));
    const daily = overview.daily.find(
      (d) =>
        d.date ===
        new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
    );
    assert.ok(daily);
    assert.equal(daily.receivedCents, 0);
    assert.equal(daily.mockCents, 0);
    console.log(
      "BI_MANAGEMENT=PASS: all user actions, admin/CSRF boundaries, atomic balances and audit, reserved-credit protection, replay and concurrent duplicates, optimistic conflicts, old-session revocation, password redaction, last-admin/self guards, financial units",
    );
  } finally {
    for (const a of oldAdmins)
      await pool.query("UPDATE app_users SET role=$2 WHERE email=$1", [
        a.email,
        a.role,
      ]);
    for (const table of [
      "app_bi_management_log",
      "app_bi_access_log",
      "app_ledger",
      "app_credit_batches",
    ])
      await pool.query(
        `DELETE FROM ${table} WHERE ${table === "app_bi_access_log" ? "actor" : "email"} IN ($1,$2,$3)`,
        [email, admin, actor],
      );
    await pool.query("DELETE FROM app_users WHERE email IN ($1,$2)", [
      email,
      admin,
    ]);
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
