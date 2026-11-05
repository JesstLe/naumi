import assert from "node:assert/strict";
import { constants, publicEncrypt } from "node:crypto";

async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
  const db = await import("../src/lib/db"), auth = await import("../src/lib/admin-auth");
  const settings = await import("../src/lib/settings");
  const { POST } = await import("../src/app/api/admin/settings/route");
  const { setSettingsAtomically } = await import("../src/lib/settings/repository");
  await db.ensureSchema();
  const pool = db.getPool();
  const oldHash = await db.getSetting(auth.ADMIN_PW_HASH_SETTING);
  const before = async () => (await pool.query("SELECT k,v FROM app_settings ORDER BY k")).rows;
  const billing = await import("../src/lib/billing/runtime");
  try {
    await auth.setAdminPassword("SettingsFixturePassword2026!");
    const session = await auth.authenticateAdminPassword("SettingsFixturePassword2026!");
    assert.ok(session);
    const request = (body: unknown, cookie = `nv_admin=${session}`, origin = "http://fixture.test") => new Request("http://fixture.test/api/admin/settings", { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await POST(request({}, ""))).status, 403);
    assert.equal((await POST(request({}, undefined, "https://evil.test"))).status, 403);
    const snapshot = await before();
    for (const invalid of [null, [], {brandName: "bad", extra: true}, {brandName: "bad", smtpPort: "465"}, {brandName: "bad", creditsMetering: 1}, {brandName: "bad", models: [123]}, {brandName: "bad", encryptedWechatSecret: "invalid"}, {signupBonus: 987, payEnabled: false, encryptedAlipayPrivateKey: "invalid"}]) {
      assert.equal((await POST(request(invalid))).status, 400);
      assert.deepEqual(await before(), snapshot, "invalid request persisted settings (including RSA keys)");
    }
    // Transaction rollback after an earlier successful statement.
    await assert.rejects(setSettingsAtomically([["site_name", "rollback"], [null as unknown as string, "fail"]]));
    assert.deepEqual(await before(), snapshot);
    const pem = await settings.getPublicKeyPem();
    const secret = "fixture-sensitive-secret-123456";
    const encrypt = (plain: string) => publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(plain)).toString("base64");
    const body = { brandName: "Fixture brand", pageAbout: "Fixture about", smtpHost: "mail.example.test", smtpPort: 465, smtpPass: secret, wechatToken: secret, encryptedWechatSecret: encrypt(secret) };
    const result = await POST(request(body));
    assert.equal(result.status, 200, await result.clone().text());
    assert.equal((await result.json()).brandName, body.brandName);
    assert.equal(await db.getSetting("site_name"), body.brandName);
    assert.equal(await db.getSetting("page_about"), body.pageAbout);
    assert.equal(settings.decryptAtRest((await db.getSetting("smtp_pass_enc"))!), secret);
    const logs = (await pool.query("SELECT actor,changes FROM app_bi_management_log WHERE action='settings-update'")).rows;
    assert.equal(logs.length, 1);
    assert.equal(logs[0].actor, await auth.resolveUserEmail(request({})));
    assert.deepEqual(logs[0].changes, { fields: Object.keys(body).sort() });
    assert.ok(!JSON.stringify(logs).includes(secret));
    assert.ok(!JSON.stringify(logs).includes(body.encryptedWechatSecret));
    const current = await billing.billingSnapshot();
    assert.equal((await POST(request({signupBonus: 42, payEnabled: false, creditsMetering: false}))).status, 200);
    const next = await billing.billingSnapshot();
    assert.equal(next.version, current.version + 1);
    assert.equal(next.config.credits.signup.amount, 42);
    assert.equal(next.config.switches.recharge, false);
    assert.equal(next.config.switches.metering, "off");
    let limited = false;
    for (let i = 0; i < 31; i++) {
      const response = await POST(request({ unknown: true }));
      if (response.status === 429) { limited = true; break; }
      assert.equal(response.status, 400);
    }
    assert.ok(limited, "settings writes must be rate limited");
    console.log("ADMIN_SETTINGS_HARDENING=PASS ORIGIN=PASS ANONYMOUS=PASS RATE_LIMIT=PASS INVALID_ZERO_WRITES=PASS TX_ROLLBACK=PASS MULTI_FIELD=PASS BILLING_SINGLE_PUBLICATION=PASS AUDIT_NAMES_ONLY=PASS");
  } finally {
    await db.setSetting(auth.ADMIN_PW_HASH_SETTING, oldHash || "");
    await (await import("../src/platform/db/pool")).closeDatabasePools();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
