// Isolated PostgreSQL + real Next API/Chrome. --real opts into configured providers.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import pg from "pg";
import { chromium, request, expect } from "@playwright/test";

const out = path.resolve("output/replicate-release"); await mkdir(out, { recursive: true });
if (process.argv.includes("--baseline")) {
  const old = execFileSync("git", ["show", "1ac61c0:src/components/replicate/replicate-client.tsx"], { encoding: "utf8" });
  const server = execFileSync("git", ["show", "1ac61c0:src/app/api/replicate/route.ts"], { encoding: "utf8" });
  assert(old.includes("await res.json()")); assert(server.includes("maxRetries: 1")); assert(server.includes("timeout: 240_000"));
  await assert.rejects(new Response("<html><body>504 Gateway Time-out</body></html>", { status: 504 }).json(), SyntaxError);
  const result = "BASELINE_RESULT=PASS HTML_JSON_CRASH=1 RETRIES=1 MAX_WAIT_EXCEEDS_PROXY=1";
  await writeFile(path.join(out, "baseline.log"), result + "\n"); console.log(result); process.exit(0);
}
const real = process.argv.includes("--real");
const container = `naumi-replicate-${Date.now()}`, password = randomUUID(), email = "replicate-smoke@local.test";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [], logs = [], calls = [], errors = [];
const pass = text => { checks.push(text); console.log(`PASS ${text}`); };
let pool, app, api, browser, page, provider;
let imageMode = "ok", visionMode = "ok";
const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#476d92" } }).png().toBuffer();
const sample = real ? await readFile("public/demos/suite-before.webp") : png;
const reference = real ? await readFile("public/demos/replicate-after.webp") : png;
const upload = (name, buffer = sample) => ({ name, mimeType: real ? "image/webp" : "image/png", buffer });
let env = {};
if (real) for (const line of (await readFile(".env", "utf8")).split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
try {
  execFileSync("docker", ["run", "-d", "--name", container, "-e", "POSTGRES_USER=fixture", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=fixture", "-p", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data", "postgres:16-alpine"], { stdio: "pipe" });
  const mapping = execFileSync("docker", ["port", container, "5432"], { encoding: "utf8" }).trim();
  const database = `postgres://fixture:${password}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool = new pg.Pool({ connectionString: database });
  for (let i = 0; i < 50; i++) { try { await pool.query("select 1"); break; } catch { await sleep(300); } }
  provider = createServer(async (req, res) => {
    try {
      if (req.url === "/image.png") { res.setHeader("content-type", "image/png"); res.end(png); return; }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      res.setHeader("content-type", "application/json");
      if (req.url === "/v1/chat/completions") {
        calls.push({ kind: "vision", body: JSON.parse(bytes) });
        if (visionMode === "fail") { res.statusCode = 502; res.end('{"error":{"message":"vision unavailable"}}'); return; }
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ prompt: "米白背景，产品居中，柔和侧光与精细材质，右侧安排标题和三个卖点，层级清晰。", regions: [{ label: "产品", kind: "product", x: .2, y: .2, width: .4, height: .5, instruction: "保留产品外观", color: "#476d92" }] }) } }] })); return;
      }
      if (req.url === "/v1/images/edits") {
        const fd = await new Request("http://fixture/", { method: "POST", headers: { "content-type": req.headers["content-type"] }, body: bytes }).formData();
        const images = [...fd.entries()].filter(([k]) => k === "image" || k.startsWith("image["));
        calls.push({ kind: "image", prompt: String(fd.get("prompt")), images: images.length, types: images.map(([, f]) => f.type), mode: imageMode });
        if (imageMode === "524") { res.statusCode = 524; res.end('{"error":{"message":"upstream timed out"}}'); return; }
        if (imageMode === "slow") { res.write('{"data":'); await sleep(2500); res.end("[]}"); return; }
        res.end(JSON.stringify({ data: [imageMode === "url" ? { url: `http://127.0.0.1:${provider.address().port}/image.png` } : { b64_json: png.toString("base64") }] })); return;
      }
      res.statusCode = 404; res.end("{}");
    } catch { res.statusCode = 500; res.end("{}"); }
  });
  await new Promise(r => provider.listen(0, "127.0.0.1", r));
  const mock = `http://127.0.0.1:${provider.address().port}/v1`;
  const probe = createServer(); await new Promise(r => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port; await new Promise(r => probe.close(r));
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], { env: {
    ...process.env, DATABASE_URL: database, SETTINGS_SECRET: randomUUID(), NAUMI_EDITION: "cloud", NAUMI_MULTI_USER: "1", NAUMI_PUBLIC_COMMERCE: "0",
    STORAGE_DRIVER: "local", MEDIA_DIR: path.join(out, real ? "real-media" : "media"), NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SMTP_HOST: "",
    OPENAI_API_KEY: real ? env.OPENAI_API_KEY : "fixture", OPENAI_BASE_URL: real ? env.OPENAI_BASE_URL : mock,
    AGENT_API_KEY: real ? env.AGENT_API_KEY : "fixture", AGENT_BASE_URL: real ? env.AGENT_BASE_URL : mock, AGENT_VISION_MODEL: real ? env.AGENT_VISION_MODEL : "fixture-vision",
    IMAGE_EDIT_TIMEOUT_MS: real ? "240000" : "1200", NEXT_TELEMETRY_DISABLED: "1",
    REFERENCE_VISION_SOURCE: real ? "image" : "agent", REFERENCE_VISION_MODEL: real ? "gpt-5.6-luna" : "fixture-vision",
  }, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", b => logs.push(b.toString())); app.stderr.on("data", b => logs.push(b.toString()));
  let ready = false; for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await sleep(500); } assert(ready);
  api = await request.newContext({ baseURL: base, timeout: 300000 });
  assert.equal((await api.post("/api/replicate/analyze", { multipart: { ref: upload("reference.webp", reference) } })).status(), 401);
  assert.equal((await api.post("/api/auth/register", { data: { email, password, name: "复刻验收" } })).status(), 200);
  assert.equal((await api.post("/api/replicate/analyze", { multipart: { ref: upload("bad.png", Buffer.from("invalid")) } })).status(), 400);
  pass("analysis authentication and actual image validation");
  const account = async () => (await (await api.get(`/api/account?email=${email}`)).json());
  const balance = async () => (await pool.query("select credits_total,credits_used from app_users where email=$1", [email])).rows[0];
  const originalBalance = await balance();
  let res = await api.post("/api/replicate/analyze", { multipart: { ref: upload("reference.webp", reference) } });
  assert.equal(res.status(), 200, await res.text()); const analysis = await res.json(); assert(analysis.prompt.length > 10); assert(analysis.regions.length > 0);
  assert.deepEqual(await balance(), originalBalance);
  await writeFile(path.join(out, real ? "REAL_ANALYSIS.json" : "ANALYSIS.json"), JSON.stringify(analysis, null, 2));
  pass("shared reverse analysis returns editable prompt and regions without image-credit charge");
  const multipart = { image: upload("product.webp"), ref: upload("reference.webp", reference), reversePrompt: analysis.prompt + " USER_EDIT_SENTINEL", degree: "high", platform: "taobao", lang: "zh", text: "保留商品外观" };
  if (!real) {
    for (const mode of ["524", "slow"]) {
      imageMode = mode; const before = await balance(); const previous = calls.filter(c => c.kind === "image").length; const start = Date.now();
      res = await api.post("/api/replicate", { multipart });
      assert.equal(res.status(), 504, await res.text()); assert((await res.json()).error.includes("超时"));
      assert.equal(calls.filter(c => c.kind === "image").length - previous, 1);
      assert.deepEqual(await balance(), before); assert.equal((await account()).artworks.length, 0);
      assert(Date.now() - start < 15000);
    }
    pass("upstream 524 and hanging response body: bounded JSON timeout, one attempt, full credit release, no artwork");
    imageMode = "524";
    const before = await balance(), n = calls.filter(c => c.kind === "image").length;
    res = await api.post("/api/retouch", { multipart: { image: upload("product.png") } });
    assert.equal(res.status(), 504); assert.equal(calls.filter(c => c.kind === "image").length - n, 1); assert.deepEqual(await balance(), before);
    pass("retouch uses the same no-retry timeout and refund path");
    imageMode = "url";
  }
  res = await api.post("/api/replicate", { multipart }); assert.equal(res.status(), 200, await res.text());
  const generated = await res.json(); assert(generated.url.startsWith("/media/"));
  const art = (await account()).artworks[0]; assert(art.prompt.includes("USER_EDIT_SENTINEL")); assert(art.prompt.includes("最后一张"));
  const imgResponse = await api.get(generated.url); assert.equal(imgResponse.status(), 200);
  assert((await sharp(await imgResponse.body()).metadata()).width > 0);
  await writeFile(path.join(out, real ? "REAL_RESULT.png" : "RESULT.png"), await imgResponse.body());
  if (!real) { assert(calls.at(-1).prompt.includes("USER_EDIT_SENTINEL")); assert.equal(calls.at(-1).images, 2); }
  assert.equal((await balance()).credits_total, originalBalance.credits_total - 6); assert.equal((await balance()).credits_used, 0);
  pass("product plus reference generation, edited prompt forwarded/persisted, valid stored output and exact six-credit settlement");
  imageMode = "ok";
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ storageState: await api.storageState(), viewport: { width: 1440, height: 1050 } });
  page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/replicate`); await page.getByRole("heading", { name: "爆款复刻", exact: true }).waitFor();
  await page.waitForFunction(mail => localStorage.getItem("naumi:last-email") === mail, email);
  const inputs = page.locator('input[type="file"]'); await inputs.nth(0).setInputFiles(upload("product.webp")); await inputs.nth(1).setInputFiles(upload("reference.webp", reference));
  const prompt = page.getByLabel("逆向提示词", { exact: true });
  if (real) {
    await prompt.fill(analysis.prompt);
    await page.screenshot({ path: path.join(out, "REAL_DESKTOP.png"), fullPage: true });
    pass("real analysis and generated result captured; browser renders reusable prompt editor");
  } else {
    await page.getByRole("button", { name: "反推参考图", exact: true }).click();
    await expect(prompt).toHaveValue(analysis.prompt, { timeout: 30000 });
    await prompt.fill(analysis.prompt + " BROWSER_EDIT_SENTINEL");
    const count = calls.filter(c => c.kind === "vision").length;
    await page.getByRole("button", { name: /一键复刻生成/ }).click();
    await expect(page.locator('img[alt="复刻结果"]')).toBeVisible({ timeout: 30000 });
    assert.equal(calls.filter(c => c.kind === "vision").length, count); assert(calls.at(-1).prompt.includes("BROWSER_EDIT_SENTINEL"));
    pass("browser reverse, manual edit and generate reuse the prompt without redundant analysis");
    await inputs.nth(1).setInputFiles(upload("replacement.png")); await expect(prompt).toHaveValue("");
    visionMode = "fail"; const countBefore = calls.filter(c => c.kind === "image").length;
    await page.getByRole("button", { name: /一键复刻生成/ }).click();
    await expect(page.getByRole("button", { name: /一键复刻生成/ })).toBeEnabled({ timeout: 30000 });
    assert.equal(calls.filter(c => c.kind === "image").length, countBefore);
    pass("reference replacement clears old prompt; analysis failure never submits generation");
    visionMode = "ok";
    await page.getByRole("button", { name: /一键复刻生成/ }).click();
    await expect(page.locator('img[alt="复刻结果"]')).toBeVisible({ timeout: 30000 });
    await expect(prompt).toHaveValue(analysis.prompt);
    pass("blank prompt automatically runs reverse analysis then image generation as separate requests");
    for (const status of [504, 413, 502]) {
      await page.route("**/api/replicate", route => route.fulfill({ status, contentType: "text/html", body: `<html><body>${status} gateway</body></html>` }));
      await page.getByRole("button", { name: /一键复刻生成/ }).click();
      await expect(page.getByRole("button", { name: /一键复刻生成/ })).toBeEnabled();
      const text = await page.locator("body").innerText(); assert(!text.includes("Unexpected token")); assert(!text.includes("<html>"));
      assert(text.includes(status === 504 ? "请求等待超时" : status === 413 ? "总大小超出" : "暂时繁忙"));
      await page.unroute("**/api/replicate");
    }
    pass("HTML 504/413/502 errors produce actionable text rather than raw JSON parser errors");
    await page.screenshot({ path: path.join(out, "DESKTOP.png"), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, real ? "REAL_MOBILE.png" : "MOBILE.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); assert.deepEqual(errors, []);
  pass("390px layout without horizontal overflow; no browser runtime errors");
  console.log(`${real ? "REAL" : "MODIFIED"}_RESULT=PASS checks=${checks.length}`);
} catch (error) {
  checks.push(`FAIL ${error.stack}`);
  if (page) { await page.screenshot({ path: path.join(out, "FAILURE.png"), fullPage: true }).catch(() => {}); await writeFile(path.join(out, "FAILURE.txt"), await page.locator("body").innerText().catch(() => "")); }
  throw error;
} finally {
  await writeFile(path.join(out, real ? "real-test.log" : "test.log"), checks.join("\n") + "\n");
  await writeFile(path.join(out, real ? "real-next.log" : "next.log"), logs.join(""));
  await browser?.close(); await api?.dispose(); await pool?.end();
  if (app?.pid) { if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "pipe" }); } catch {} } else app.kill("SIGTERM"); }
  provider?.closeAllConnections(); provider?.close();
  try { execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); } catch {}
}
