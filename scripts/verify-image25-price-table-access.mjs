import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";

// Disposable loopback-only signed admin fixture; no production credentials/DB.
const secret = "image25-price-table-local-fixture-secret-20261008";
const base = "http://127.0.0.1:3308";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3308"], {
  env: { ...process.env, SETTINGS_SECRET: secret, VIDEO_WORKER_SECRET: secret + "-worker", DATABASE_URL: "", OPENAI_API_KEY: "", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: "ignore", windowsHide: true,
});
const session = exp => `${exp}.${createHmac("sha256", secret).update(`admin:${exp}`).digest("hex")}`;
const cookie = `nv_admin=${session(Date.now() + 3600000)}`;
let proxy;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(ready, "built server ready");
  for (const value of ["", "nv_user=forged", "nv_admin=forged", `nv_admin=${session(Date.now() - 10000)}`]) {
    const response = await fetch(base + "/api/admin/billing/image25-prices", { headers: { cookie: value } });
    assert.equal(response.status, 404);
    const page = await fetch(base + "/admin/billing/price-table", { headers: { cookie: value }, redirect: "manual" });
    assert.equal(page.status, 404);
    assert.ok(!(await page.text()).includes("0.031608"));
  }
  const allowed = await fetch(base + "/api/admin/billing/image25-prices", { headers: { cookie } });
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get("cache-control") || "", /private.*no-store/);
  const data = await allowed.json();
  assert.equal(data.rows.length, 45);
  assert.equal(data.rows[0].prices.medium.gold.saleUsd, "0.031608");
  assert.equal(data.rows[30].prices.medium.gold.saleUsd, "0.106776");
  assert.equal(data.conversion, null);
  assert.equal(data.liveBillingChanged, false);
  assert.equal((await fetch(base + "/api/admin/billing/image25-prices")).status, 404);
  assert.equal((await fetch(base + "/api/admin/billing/image25-prices", { method: "POST", headers: { cookie }, body: "{}" })).status, 405);
  assert.equal((await fetch(base + "/admin/billing/price-table", { headers: { cookie } })).status, 200);
  const result = "PRICE_TABLE_ACCESS=PASS ANONYMOUS_USER_FORGED_EXPIRED=404 ADMIN=200 NO_STORE=PASS WRITE_METHOD=405 USD_MATRIX=PASS MISSING_FX=NULL LIVE_BILLING_UNCHANGED=PASS PAID_CALLS=0";
  console.log(result);
  await mkdir("output/image25-price-table-20261008", { recursive: true });
  await writeFile("output/image25-price-table-20261008/access-test.txt", result + "\n");
  if (process.argv.includes("--browser")) {
    // Loopback UI harness injects only its own test cookie to the test server.
    // Direct app/API access above still exercises the actual auth boundaries.
    proxy = createServer((req, res) => {
      if (req.url === "/__fixture_stop") { res.end("closed"); setTimeout(() => proxy.close(), 100); return; }
      const upstream = request(base + req.url, { method: req.method, headers: { ...req.headers, host: "127.0.0.1:3308", cookie } }, incoming => {
        res.writeHead(incoming.statusCode || 502, incoming.headers); incoming.pipe(res);
      });
      upstream.on("error", () => { res.writeHead(502); res.end("local fixture upstream unavailable"); });
      req.pipe(upstream);
    });
    await new Promise(resolve => proxy.listen(3310, "127.0.0.1", resolve));
    console.log("LOCAL_BROWSER_FIXTURE=http://127.0.0.1:3310/admin/billing/price-table");
    await new Promise(resolve => proxy.once("close", resolve));
  }
} finally { if (child.exitCode === null) child.kill(); }
