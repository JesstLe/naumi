import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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
  const positionEmails = Array.from({ length: 4 }, (_, i) => `${prefix}-position-${i}@example.test`);
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
    // Position binding: set, preserve-on-omit, reject unknown, filter, clear.
    await m.manageBiUser(
      command("profile", {
        expectedVersion: 9,
        name: "Updated fixture",
        phone: "fixture-phone",
        note: "operator note",
        position: "电商设计-资深",
      }),
      admin,
    );
    assert.equal(
      (
        await pool.query("SELECT position FROM app_users WHERE email=$1", [
          email,
        ])
      ).rows[0].position,
      "电商设计-资深",
    );
    await m.manageBiUser(
      command("profile", {
        expectedVersion: 10,
        name: "Updated fixture",
        phone: "",
        note: "",
      }),
      admin,
    );
    assert.equal(
      (
        await pool.query("SELECT position FROM app_users WHERE email=$1", [
          email,
        ])
      ).rows[0].position,
      "电商设计-资深",
      "Profile without position keeps the current value",
    );
    assert.throws(() =>
      m.userCommandSchema.parse({
        id: randomUUID(),
        email,
        action: "profile",
        reason: "Isolated acceptance",
        expectedVersion: 11,
        name: "Updated fixture",
        phone: "",
        note: "",
        position: "自由职业",
      }),
    );
    const biContracts = await import("../src/lib/bi/contracts");
    const usersQuery = (position: string) =>
      biContracts.parseBiQuery(
        new URLSearchParams({
          q: prefix,
          section: "users",
          ...(position ? { position } : {}),
        }),
      );
    const unfiltered = await bi.queryBi(usersQuery(""));
    assert.ok(
      unfiltered.rows.some(
        (r) => r.email === email && r.position === "电商设计-资深",
      ),
    );
    const senior = await bi.queryBi(usersQuery("电商设计-资深"));
    assert.ok(
      senior.total >= 1 &&
        senior.rows.every((r) => r.position === "电商设计-资深"),
    );
    const packaging = await bi.queryBi(usersQuery("包装设计"));
    assert.equal(
      packaging.total,
      0,
      "Position filter excludes other groups",
    );
    await m.manageBiUser(
      command("profile", {
        expectedVersion: 11,
        name: "Updated fixture",
        phone: "",
        note: "",
        position: "",
      }),
      admin,
    );
    assert.equal(
      (
        await pool.query("SELECT position FROM app_users WHERE email=$1", [
          email,
        ])
      ).rows[0].position,
      "",
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
    const { planPositionBindings } = await import("../src/lib/bi/position-binding");
    const { USER_POSITIONS } = await import("../src/lib/bi/positions");
    const roster = positionEmails.map((_, i) => ({ name: `${prefix}-花名-${i}`, position: USER_POSITIONS[1 + i % 3] }));
    for (const [i, target] of positionEmails.entries()) await db.getOrCreateUser(target, roster[i].name);
    const candidates = (await pool.query("SELECT email,name,position,management_version FROM app_users WHERE email=ANY($1::text[])", [positionEmails])).rows;
    const plan = planPositionBindings([...roster, roster[0]], candidates);
    assert.equal(plan.changes.length, 4, "Duplicate roster names deduplicate");
    assert.equal(planPositionBindings(roster, candidates.slice(1)).unmatched.length, 1);
    assert.equal(planPositionBindings(roster, [...candidates, { ...candidates[0], email: "duplicate@example.test" }]).ambiguous.length, 1);
    assert.throws(() => planPositionBindings([...roster, { ...roster[0], position: USER_POSITIONS[2] }], candidates), /不同岗位/);
    const fortyEight = Array.from({ length: 48 }, (_, i) => ({ name: `验收-${i}`, position: USER_POSITIONS[i < 13 ? 1 : i < 41 ? 2 : 3] }));
    assert.equal(planPositionBindings(fortyEight, fortyEight.map((r, i) => ({ ...r, email: `fixture-${i}@example.test`, position: "", management_version: 0 }))).changes.length, 48);
    const out = resolve(process.env.POSITION_EVIDENCE_ROOT || "output/user-position-20261116", prefix);
    await mkdir(out, { recursive: true });
    const rosterPath = resolve(out, "roster.json"), planPath = resolve(out, "plan.json");
    await writeFile(rosterPath, JSON.stringify(roster));
    const cli = (...args: string[]) => execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/ops/bind-user-positions.ts", ...args], { encoding: "utf8", windowsHide: true });
    const beforeRows = (await pool.query("SELECT to_jsonb(u)-'position'-'management_version' AS value FROM app_users u WHERE email=ANY($1::text[]) ORDER BY email", [positionEmails])).rows;
    const dry = cli("--roster", rosterPath, "--out", planPath);
    assert.match(dry, /DRY_RUN pending=4 already=0 unmatched=0 ambiguous=0 writes=0/);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM app_users WHERE email=ANY($1::text[]) AND position<>''", [positionEmails])).rows[0].n, 0);
    const applied = cli("--apply", "--plan", planPath, "--actor", admin);
    assert.match(applied, /applied=4 replayed=0/);
    const replay = cli("--apply", "--plan", planPath, "--actor", admin);
    assert.match(replay, /applied=0 replayed=4/);
    const savedPlan = JSON.parse(await readFile(planPath, "utf8"));
    for (const row of savedPlan.changes) {
      const log = (await pool.query("SELECT changes FROM app_bi_management_log WHERE id=$1", [row.command.id])).rows[0];
      assert.equal(log.changes.before.position, "");
      assert.equal(log.changes.after.position, row.command.position);
    }
    assert.deepEqual((await pool.query("SELECT to_jsonb(u)-'position'-'management_version' AS value FROM app_users u WHERE email=ANY($1::text[]) ORDER BY email", [positionEmails])).rows, beforeRows, "Bulk binding preserves every unrelated user field");
    const contracts = await import("../src/lib/bi/contracts");
    const queries = (position: string, page = 1) => contracts.parseBiQuery(new URLSearchParams({ section: "users", q: `${prefix}-position`, position, size: "1", page: String(page) }));
    for (const position of USER_POSITIONS.slice(1)) {
      const result = await bi.queryBi(queries(position));
      assert.equal(result.total, position === USER_POSITIONS[1] ? 2 : 1);
      assert.ok(result.rows.every(r => r.position === position));
    }
    const page1 = await bi.queryBi(queries(USER_POSITIONS[1], 1)), page2 = await bi.queryBi(queries(USER_POSITIONS[1], 2));
    assert.notEqual(page1.rows[0].email, page2.rows[0].email);
    assert.equal((await bi.queryBi(queries("unassigned"))).total, 0);
    assert.throws(() => queries("invalid"), /岗位筛选无效/);
    const target = positionEmails[0];
    const update = m.userCommandSchema.parse({ id: randomUUID(), action: "position", email: target, expectedVersion: 1, position: "", reason: "岗位并发与清空验证" });
    await m.manageBiUser(update, admin);
    await assert.rejects(m.manageBiUser({ ...update, id: randomUUID() }, admin), /其他管理员/);
    assert.equal((await bi.queryBi(queries("unassigned"))).total, 1);
    assert.throws(() => cli("--apply", "--plan", planPath, "--actor", admin), (error: unknown) => {
      const result = error as { status: number; stdout: string };
      return result.status === 2 && /MISMATCH applied=0 replayed=4 already=0 verified=3 mismatches=1/.test(result.stdout);
    }, "An old receipt must not claim the current roster still matches");
    assert.equal((await pool.query("SELECT position FROM app_users WHERE email=$1", [target])).rows[0].position, "", "Replaying an old plan preserves the newer administrator edit");
    const apiPosition = { ...update, id: randomUUID(), expectedVersion: 2 };
    assert.equal((await api.POST(req(cookie(target), apiPosition))).status, 404);
    assert.equal((await api.POST(req(cookie(admin), apiPosition, "https://evil.test"))).status, 403);
    assert.equal((await api.POST(req(cookie(admin), { ...apiPosition, position: "invalid" }))).status, 400);
    assert.equal((await api.POST(req(cookie(admin), apiPosition))).status, 200);
    assert.equal((await api.POST(req(cookie(admin), apiPosition))).status, 200);
    await writeFile(resolve(out, "CLI.log"), dry + applied + replay);
    console.log("POSITION_BINDING=PASS: exact matching, 48-person 13/28/7 roster, duplicate/missing/ambiguous handling, dry-run, audited apply, stable-ID replay, unrelated fields preserved, three filters, unassigned, pagination, CAS, current-state drift and API boundaries");
    console.log(
      "BI_MANAGEMENT=PASS: all user actions, admin/CSRF boundaries, atomic balances and audit, reserved-credit protection, replay and concurrent duplicates, optimistic conflicts, old-session revocation, password redaction, last-admin/self guards, financial units, position binding and position filter",
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
      "app_billing_operations",
      "app_ledger",
      "app_credit_batches",
    ])
      await pool.query(
        `DELETE FROM ${table} WHERE ${table === "app_bi_access_log" ? "actor" : "email"}=ANY($1::text[])`,
        [[email, admin, actor, ...positionEmails]],
      );
    await pool.query("DELETE FROM app_users WHERE email=ANY($1::text[])", [[email, admin, ...positionEmails]]);
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
