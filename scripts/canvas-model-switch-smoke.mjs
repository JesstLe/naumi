// Isolated production-shaped acceptance for per-generation image model switching.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import pg from "pg";
import { chromium, request, expect } from "@playwright/test";

const output = path.resolve("output/canvas-model-switch-smoke");
await mkdir(output, { recursive: true });
const container = `naumi-model-switch-${Date.now()}`;
const password = randomUUID();
const email = "canvas-model-switch@local.test";
const generated = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#5678b4" } }).png().toBuffer();
const source = await sharp({ create: { width: 480, height: 480, channels: 4, background: "#d6a268" } }).png().toBuffer();
const providerModels = [];
const report = [];
const appLog = [];
const pass = (message) => { report.push(`PASS ${message}`); console.log(report.at(-1)); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let app, fixture, pool, api, browser, page;

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

try {
  execFileSync("docker", ["run", "-d", "--name", container, "-e", "POSTGRES_USER=fixture", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=fixture", "-p", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data", "postgres:16-alpine"], { stdio: "pipe" });
  const mapping = execFileSync("docker", ["port", container, "5432"], { encoding: "utf8" }).trim();
  const database = `postgres://fixture:${password}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool = new pg.Pool({ connectionString: database });
  for (let i = 0; i < 60; i++) { try { await pool.query("select 1"); break; } catch { await sleep(300); } }

  fixture = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const model = body.match(/name="model"\r\n\r\n([^\r\n]+)/)?.[1];
    if (model) providerModels.push(model);
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/images/edits" || req.url === "/v1/images/generations") {
      res.end(JSON.stringify({ data: [{ b64_json: generated.toString("base64") }] }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const provider = `http://127.0.0.1:${fixture.address().port}/v1`;
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: {
      ...process.env,
      DATABASE_URL: database,
      SETTINGS_SECRET: randomUUID(),
      ADMIN_EMAIL: email,
      NAUMI_EDITION: "cloud",
      NAUMI_MULTI_USER: "1",
      NAUMI_PUBLIC_COMMERCE: "0",
      MEDIA_DIR: path.join(output, "media"),
      STORAGE_DRIVER: "local",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SMTP_HOST: "",
      OPENAI_API_KEY: "fixture",
      OPENAI_BASE_URL: provider,
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      OPENAI_IMAGE_MODELS: "gpt-image-2,gpt-image-1.5",
      NEW_API_IMAGE_BASE_URL: "",
      NEW_API_IMAGE_API_KEY: "",
      NEW_API_IMAGE_MODELS: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => appLog.push(chunk.toString()));
  app.stderr.on("data", (chunk) => appLog.push(chunk.toString()));
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await sleep(500); }
  assert(ready);

  api = await request.newContext({ baseURL: base, timeout: 120_000 });
  const registration = await api.post("/api/auth/register", { data: { email, password, name: "模型切换验收" } });
  assert.equal(registration.status(), 200, await registration.text());
  const config = await (await api.get("/api/config")).json();
  assert.equal(config.defaultImageModel, "gpt-image-2");
  assert.deepEqual(config.imageModels.map((item) => item.id).slice(0, 2), ["gpt-image-2", "gpt-image-1.5"]);
  pass("runtime config exposes the default and allowed image model catalog");

  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ storageState: await api.storageState(), viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: "naumi_locale", value: "zh", url: base }]);
  page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/canvas`);
  await page.getByRole("button", { name: /开始创作/ }).click();
  await page.locator(".react-flow").waitFor();
  await page.getByTestId("canvas-image-input").setInputFiles({ name: "model-source.png", mimeType: "image/png", buffer: source });
  const node = page.locator('.react-flow__node[data-id^="art-"]');
  await expect(node).toHaveCount(1, { timeout: 60_000 });
  await node.click();
  await page.getByRole("button", { name: /gpt-image-2/ }).click();
  await page.getByRole("button", { name: "gpt-image-1.5", exact: true }).click();
  await expect(page.getByRole("button", { name: /gpt-image-1\.5/ })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem("naumi:canvas-image-model")), "gpt-image-1.5");
  pass("canvas model selector switches model and persists the user choice");

  await page.getByPlaceholder(/描述你想怎么改/).fill("保持产品结构，生成白底商品图");
  await page.getByRole("button", { name: "↑", exact: true }).click();
  await expect.poll(async () => {
    const account = await (await api.get(`/api/account?email=${email}`)).json();
    return account.artworks.filter((item) => item.origin === "canvas").length;
  }, { timeout: 120_000 }).toBe(1);
  assert(providerModels.includes("gpt-image-1.5"), `provider models: ${providerModels.join(",")}`);
  pass("selected model reaches the upstream image edit request and produces an artwork");

  const rejected = await api.post("/api/generate-image", {
    multipart: { prompt: "test", category: "main", ratio: "1:1", resolution: "1K", count: "1", model: "rogue-image-model" },
  });
  assert.equal(rejected.status(), 400);
  assert.match((await rejected.json()).error, /模型不可用/);
  pass("server rejects a model outside the configured allowlist");

  await page.reload();
  await page.locator('.react-flow__node[data-id^="gen-"]').first().click({ force: true });
  await expect(page.getByRole("button", { name: /gpt-image-1\.5/ })).toBeVisible({ timeout: 30_000 });
  await page.goto(`${base}/generate`);
  const modelRow = page.getByText("生图模型", { exact: true }).locator("..");
  await modelRow.getByRole("button", { name: /gpt-image-2/ }).click();
  await page.getByRole("button", { name: "gpt-image-1.5", exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem("naumi:generate-image-model")), "gpt-image-1.5");
  pass("standalone generation page shares the model catalog and stores its selection");
  assert.deepEqual(pageErrors, []);
  pass("model selection survives reload and browser runtime has no exceptions");
  console.log(`MODIFIED_RESULT=PASS MODEL=gpt-image-1.5 UPSTREAM=${providerModels.join(",")} checks=${report.length}`);
} catch (error) {
  report.push(`FAIL ${error.stack || error}`);
  if (page) await page.screenshot({ path: path.join(output, "FAILURE.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output, "test.log"), report.join("\n") + "\n");
  await writeFile(path.join(output, "next.log"), appLog.join(""));
  await browser?.close();
  await api?.dispose();
  await pool?.end();
  if (app?.pid) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "pipe" }); } catch {} }
    else app.kill("SIGTERM");
  }
  if (fixture) await new Promise((resolve) => fixture.close(resolve));
  try { execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); } catch {}
}
