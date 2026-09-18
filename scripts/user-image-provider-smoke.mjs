// Isolated end-to-end acceptance for account-scoped custom image providers.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { chromium, request, expect } from "@playwright/test";

const output = path.resolve("output/user-image-provider-smoke");
await mkdir(output, { recursive: true });
const container = `naumi-user-provider-${Date.now()}`;
const dbPassword = randomUUID();
const accountPassword = `Byok-${Date.now()}-Pass!`;
const firstEmail = `byok-one-${Date.now()}@local.test`;
const secondEmail = `byok-two-${Date.now()}@local.test`;
const apiKey = `fixture-user-key-${randomUUID()}`;
const generated = await sharp({
  create: { width: 128, height: 128, channels: 4, background: "#6aa9d8" },
}).png().toBuffer();
const source = await sharp({
  create: { width: 240, height: 240, channels: 4, background: "#e1b979" },
}).png().toBuffer();
const upstreamRequests = [];
const report = [];
const appLog = [];
const pageErrors = [];
const pass = (message) => {
  report.push(`PASS ${message}`);
  console.log(report.at(-1));
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let app, fixture, pool, api, other, browser;

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForJob(client, jobId) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await client.get(`/api/generate-image?job=${encodeURIComponent(jobId)}`);
    const body = await response.json();
    if (body.status === "done") return body;
    if (body.status === "error") throw new Error(body.error || "generation failed");
    await sleep(300);
  }
  throw new Error(`job ${jobId} timed out`);
}

async function generate(client, model, prompt) {
  const response = await client.post("/api/generate-image", {
    multipart: {
      prompt,
      userPrompt: prompt,
      category: "main",
      ratio: "1:1",
      resolution: "1K",
      style: "默认",
      quality: "medium",
      count: "1",
      transparent: "false",
      ratiogen: "false",
      model,
    },
  });
  assert.equal(response.status(), 200, await response.text());
  const { jobId } = await response.json();
  assert(jobId);
  return waitForJob(client, jobId);
}

try {
  execFileSync("docker", [
    "run", "-d", "--name", container,
    "-e", "POSTGRES_USER=fixture",
    "-e", `POSTGRES_PASSWORD=${dbPassword}`,
    "-e", "POSTGRES_DB=fixture",
    "-p", "127.0.0.1::5432",
    "--tmpfs", "/var/lib/postgresql/data",
    "postgres:16-alpine",
  ], { stdio: "pipe" });
  const mapping = execFileSync("docker", ["port", container, "5432"], { encoding: "utf8" }).trim();
  const database = `postgres://fixture:${dbPassword}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool = new pg.Pool({ connectionString: database });
  for (let index = 0; index < 60; index++) {
    try { await pool.query("select 1"); break; } catch { await sleep(300); }
  }

  fixture = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    upstreamRequests.push({
      url: req.url,
      authorization: req.headers.authorization || "",
      body: raw,
    });
    if (req.url === "/v1/models") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        data: [{ id: "fixture-images" }, { id: "fixture-chat-image" }],
      }));
      return;
    }
    if (req.url === "/v1/images/generations" || req.url === "/v1/images/edits") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ b64_json: generated.toString("base64") }] }));
      return;
    }
    if (req.url === "/v1/chat/completions") {
      const imageUrl = `http://127.0.0.1:${fixture.address().port}/generated.png`;
      res.setHeader("content-type", "text/event-stream");
      res.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: `![result](${imageUrl})` } }] })}\n\n` +
        "data: [DONE]\n\n"
      );
      return;
    }
    if (req.url === "/generated.png") {
      res.setHeader("content-type", "image/png");
      res.end(generated);
      return;
    }
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
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
      ADMIN_EMAIL: firstEmail,
      NAUMI_EDITION: "cloud",
      NAUMI_MULTI_USER: "1",
      NAUMI_PUBLIC_COMMERCE: "0",
      MEDIA_DIR: path.join(output, "media"),
      STORAGE_DRIVER: "local",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SMTP_HOST: "",
      OPENAI_API_KEY: "fixture-site-key",
      OPENAI_BASE_URL: provider,
      OPENAI_IMAGE_MODEL: "site-image-model",
      OPENAI_IMAGE_MODELS: "site-image-model",
      NEW_API_IMAGE_BASE_URL: "",
      NEW_API_IMAGE_API_KEY: "",
      NEW_API_IMAGE_MODELS: "",
      USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => appLog.push(chunk.toString()));
  app.stderr.on("data", (chunk) => appLog.push(chunk.toString()));
  let ready = false;
  for (let index = 0; index < 120; index++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await sleep(500);
  }
  assert(ready, "Next.js did not become ready");

  api = await request.newContext({ baseURL: base, timeout: 120_000 });
  other = await request.newContext({ baseURL: base, timeout: 120_000 });
  for (const [client, email, name] of [
    [api, firstEmail, "自定义接口验收账号一"],
    [other, secondEmail, "自定义接口验收账号二"],
  ]) {
    const registration = await client.post("/api/auth/register", {
      data: { email, password: accountPassword, name },
    });
    assert.equal(registration.status(), 200, await registration.text());
  }
  pass("two native accounts register with isolated sessions");

  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({
    storageState: await api.storageState(),
    viewport: { width: 1500, height: 1000 },
  });
  await context.addCookies([{ name: "naumi_locale", value: "zh", url: base }]);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${base}/account`);
  const providerEntry = page.getByRole("link", { name: /图片生成接口/ }).first();
  await expect(providerEntry).toBeVisible();
  await providerEntry.click();
  await expect(page.getByRole("heading", { name: "图片生成接口" })).toBeVisible();
  await page.getByLabel("API Base URL").fill(provider);
  await page.getByLabel("API Key").fill(apiKey);
  await page.getByRole("button", { name: "测试并读取模型" }).click();
  await expect(page.getByText(/连接成功，发现 2 个模型/)).toBeVisible();
  await expect(page.getByLabel("可用模型")).toHaveValue(/fixture-images/);
  await page.getByLabel("启用我的图片接口").check();
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect(page.getByText(/已保存并启用/)).toBeVisible();
  await page.screenshot({ path: path.join(output, "account-image-provider.png"), fullPage: true });
  pass("front-end entry tests, imports and saves a user image provider");

  const { rows } = await pool.query(
    "select base_url_enc, api_key_enc, models, default_model from app_user_image_providers where email=$1",
    [firstEmail]
  );
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].api_key_enc, apiKey);
  assert(!String(rows[0].api_key_enc).includes(apiKey));
  assert.notEqual(rows[0].base_url_enc, provider);
  assert.deepEqual(rows[0].models, ["fixture-images", "fixture-chat-image"]);
  pass("API key and base URL are encrypted at rest and the complete key is not stored as plaintext");

  const providerViewResponse = await api.get("/api/account/image-provider");
  const providerViewText = await providerViewResponse.text();
  assert.equal(providerViewResponse.status(), 200);
  assert(!providerViewText.includes(apiKey));
  assert.match(providerViewText, /fixtur/);
  const firstConfig = await (await api.get("/api/config")).json();
  assert.equal(firstConfig.defaultImageModel, "byok:fixture-images");
  assert(firstConfig.imageModels.some((item) => item.id === "byok:fixture-images" && item.label === "自定义 · fixture-images"));
  assert(!JSON.stringify(firstConfig).includes(provider));
  assert(!JSON.stringify(firstConfig).includes(apiKey));
  pass("authenticated config exposes only prefixed model metadata and selects the user default");

  const secondView = await (await other.get("/api/account/image-provider")).json();
  const secondConfig = await (await other.get("/api/config")).json();
  assert.equal(secondView.configured, false);
  assert(!secondConfig.imageModels.some((item) => String(item.id).startsWith("byok:")));
  pass("another account cannot read or select the first account provider");

  await page.goto(`${base}/generate`);
  await expect(page.getByRole("button", { name: /自定义 · fixture-images/ })).toBeVisible();
  pass("standalone generation page shows the signed-in account custom model");

  await page.goto(`${base}/canvas`);
  const start = page.getByRole("button", { name: /开始创作/ });
  await expect(start).toBeVisible({ timeout: 30_000 });
  await start.click();
  await page.locator(".react-flow").waitFor({ timeout: 30_000 });
  await page.getByTestId("canvas-image-input").setInputFiles({
    name: "byok-source.png", mimeType: "image/png", buffer: source,
  });
  const node = page.locator('.react-flow__node[data-id^="art-"]').first();
  await expect(node).toBeVisible({ timeout: 60_000 });
  await node.click();
  await expect(page.getByRole("button", { name: /自定义 · fixture-images/ })).toBeVisible();
  pass("wireless canvas shows the signed-in account custom model on an image node");

  const imageJob = await generate(api, "byok:fixture-images", "生成蓝色商品主图");
  assert.equal(imageJob.status, "done");
  const imageRequest = upstreamRequests.find((item) => item.url === "/v1/images/generations");
  assert(imageRequest);
  assert.equal(imageRequest.authorization, `Bearer ${apiKey}`);
  assert.match(imageRequest.body, /fixture-images/);
  pass("OpenAI Images protocol sends the account key and real upstream model");

  const switchResponse = await api.post("/api/account/image-provider", {
    data: {
      enabled: true,
      protocol: "chat-completions",
      baseUrl: provider,
      models: ["fixture-chat-image"],
      defaultModel: "fixture-chat-image",
    },
  });
  assert.equal(switchResponse.status(), 200, await switchResponse.text());
  const chatJob = await generate(api, "byok:fixture-chat-image", "生成聊天协议商品图");
  assert.equal(chatJob.status, "done");
  const chatRequest = upstreamRequests.find((item) => item.url === "/v1/chat/completions");
  assert(chatRequest);
  assert.equal(chatRequest.authorization, `Bearer ${apiKey}`);
  assert.equal(JSON.parse(chatRequest.body).model, "fixture-chat-image");
  pass("Chat Completions protocol sends the same account key and selected upstream model");

  const deleted = await api.delete("/api/account/image-provider");
  assert.equal(deleted.status(), 200, await deleted.text());
  const afterDelete = await (await api.get("/api/config")).json();
  assert(!afterDelete.imageModels.some((item) => String(item.id).startsWith("byok:")));
  assert.equal(afterDelete.defaultImageModel, "site-image-model");
  pass("deleting the provider removes custom models and restores the site default");

  assert.deepEqual(pageErrors, []);
  await writeFile(path.join(output, "report.txt"), `${report.join("\n")}\n`, "utf8");
  console.log(`REPORT ${path.join(output, "report.txt")}`);
} catch (error) {
  await writeFile(path.join(output, "app.log"), appLog.join(""), "utf8").catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (api) await api.dispose().catch(() => {});
  if (other) await other.dispose().catch(() => {});
  if (app) {
    app.kill("SIGTERM");
    await sleep(500);
    if (!app.killed) app.kill("SIGKILL");
  }
  if (fixture) await new Promise((resolve) => fixture.close(resolve)).catch(() => {});
  if (pool) await pool.end().catch(() => {});
  try { execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" }); } catch {}
  await writeFile(path.join(output, "app.log"), appLog.join(""), "utf8").catch(() => {});
}
