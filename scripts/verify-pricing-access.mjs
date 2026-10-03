import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Exercise the built server, including RSC responses and publicly downloadable chunks.
const secret = "fixture-settings-0123456789abcdef0123456789abcdef0123456789";
const base = process.env.NAUMI_PRICING_TEST_URL || "http://127.0.0.1:3099";
assert.equal(new URL(base).hostname, "127.0.0.1", "Only run against the local fixture");
const server = process.env.NAUMI_PRICING_TEST_URL ? null : spawn(process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3099"], {
    env: { ...process.env, SETTINGS_SECRET: secret, VIDEO_WORKER_SECRET: `${secret}-worker`,
      OPENAI_API_KEY: "local-fixture-key", VIDEO_WORKER_DISABLED: "1", NAUMI_BETA_PREVIEW: "1", NAUMI_PUBLIC_COMMERCE: "0" },
    stdio: "ignore",
  });
const session = (exp) => `${exp}.${createHmac("sha256", secret).update(`admin:${exp}`).digest("hex")}`;
const sensitive = ["1.9761942000464", "26.52", "4499元/60000积分", "汇率6.7351"];
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${base}/plans`); ready = true; break; } catch { await new Promise(r => setTimeout(r, 200)); }
  }
  assert.ok(ready, "Built server starts");
  for (const cookie of ["", "nv_admin=forged", "nv_user=forged", `nv_admin=${session(Date.now() - 1000)}`]) {
    for (const route of ["/plans", "/admin/pricing"]) {
      for (const rsc of [false, true]) {
        const res = await fetch(`${base}${route}`, { headers: { cookie, ...(rsc ? { RSC: "1" } : {}) } });
        const body = await res.text();
        // App Router can send its not-found boundary in a 200 streamed RSC response.
        assert.ok(res.status === 404 || (rsc && res.status === 200 && body.includes("NEXT_NOT_FOUND")), `${route} rejects invalid sessions (RSC=${rsc}, status=${res.status})`);
        for (const marker of sensitive) assert.ok(!body.includes(marker), "Denied responses contain no research quote");
      }
    }
  }
  const cookie = `nv_admin=${session(Date.now() + 60000)}`;
  const allowed = await fetch(`${base}/admin/pricing`, { headers: { cookie } });
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get("cache-control") || "", /no-store/);
  const body = await allowed.text();
  assert.ok(body.includes("1.9761942000464"), "Authorized report includes calculator data");
  assert.ok(body.includes("内部报价"));
  assert.equal((await fetch(`${base}/plans`, { headers: { cookie } })).status, 404, "No public pricing route, even for admins");
  // An authorized response must never warm a shared cache for anonymous visitors.
  const deniedAgain = await fetch(`${base}/admin/pricing`);
  assert.equal(deniedAgain.status, 404);
  assert.ok(!(await deniedAgain.text()).includes("1.9761942000464"));
  async function checkChunks(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await checkChunks(file);
      else if (entry.name.endsWith(".js")) {
        const source = await readFile(file, "utf8");
        for (const marker of sensitive) assert.ok(!source.includes(marker), `Public chunk ${entry.name} must not contain private quote data`);
      }
    }
  }
  await checkChunks(".next/static");
  console.log("PRICING_ACCESS=PASS: HTML/RSC denied; signed admin allowed; cache and public chunks contain no private quotes");
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(resolve => server.once("exit", resolve));
    server.kill();
    await stopped;
  }
}
