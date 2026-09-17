// Isolated real Next + PostgreSQL + Chrome acceptance for native canvas sizes and custom output dimensions.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import pg from "pg";
import { chromium, request, expect } from "@playwright/test";

const output = path.resolve("output/canvas-native-size-smoke");
await mkdir(output, { recursive: true });
const container = `naumi-canvas-size-${Date.now()}`;
const password = randomUUID();
const email = "canvas-native-size@local.test";
const appLog = [], report = [];
const pass = message => { report.push(`PASS ${message}`); console.log(report.at(-1)); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let app, fixture, pool, api, browser, page;

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

const square900 = await sharp({ create: { width: 900, height: 900, channels: 4, background: "#77a8c6" } }).png().toBuffer();
const portrait = await sharp({ create: { width: 600, height: 1200, channels: 4, background: "#c59a73" } }).png().toBuffer();
const generated = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#385ab8" } }).png().toBuffer();

try {
  execFileSync("docker", ["run", "-d", "--name", container, "-e", "POSTGRES_USER=fixture", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=fixture", "-p", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data", "postgres:16-alpine"], { stdio: "pipe" });
  const mapping = execFileSync("docker", ["port", container, "5432"], { encoding: "utf8" }).trim();
  const database = `postgres://fixture:${password}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool = new pg.Pool({ connectionString: database });
  for (let i = 0; i < 60; i++) { try { await pool.query("select 1"); break; } catch { await sleep(300); } }

  fixture = createServer(async (req, res) => {
    for await (const _ of req) { /* consume multipart */ }
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/images/edits" || req.url === "/v1/images/generations") {
      return res.end(JSON.stringify({ data: [{ b64_json: generated.toString("base64") }] }));
    }
    res.statusCode = 404; res.end("{}");
  });
  await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
  const provider = `http://127.0.0.1:${fixture.address().port}/v1`;
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: { ...process.env, DATABASE_URL: database, SETTINGS_SECRET: randomUUID(), ADMIN_EMAIL: email, NAUMI_EDITION: "cloud", NAUMI_MULTI_USER: "1", NAUMI_PUBLIC_COMMERCE: "0", MEDIA_DIR: path.join(output, "media"), STORAGE_DRIVER: "local", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SMTP_HOST: "", OPENAI_API_KEY: "fixture", OPENAI_BASE_URL: provider, OPENAI_IMAGE_MODEL: "gpt-image-2", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", chunk => appLog.push(chunk.toString()));
  app.stderr.on("data", chunk => appLog.push(chunk.toString()));
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await sleep(500); }
  assert(ready);
  api = await request.newContext({ baseURL: base, timeout: 120000 });
  const registration = await api.post("/api/auth/register", { data: { email, password, name: "原尺寸画布验收" } });
  assert.equal(registration.status(), 200, await registration.text());
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ storageState: await api.storageState(), viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: "naumi_locale", value: "zh", url: base }]);
  page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`${base}/canvas`);
  await page.getByRole("button", { name: /开始创作/ }).click();
  await page.locator(".react-flow").waitFor();
  await page.getByTestId("canvas-image-input").setInputFiles([
    { name: "square-900.png", mimeType: "image/png", buffer: square900 },
    { name: "portrait-600x1200.png", mimeType: "image/png", buffer: portrait },
  ]);
  const nodes = page.locator('.react-flow__node[data-id^="art-"]');
  await expect(nodes).toHaveCount(2, { timeout: 60000 });
  let account = await (await api.get(`/api/account?email=${email}`)).json();
  const square = account.artworks.find(item => item.title === "square-900.png");
  const tall = account.artworks.find(item => item.title === "portrait-600x1200.png");
  assert.equal(square.width, 900); assert.equal(square.height, 900);
  assert.equal(tall.width, 600); assert.equal(tall.height, 1200);
  const scale = await page.locator(".react-flow__viewport").evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
  const squareBox = await page.locator(`.react-flow__node[data-id="${square.id}"] img`).boundingBox();
  const tallBox = await page.locator(`.react-flow__node[data-id="${tall.id}"] img`).boundingBox();
  assert(Math.abs(squareBox.width / scale - 900) < 2 && Math.abs(squareBox.height / scale - 900) < 2);
  assert(Math.abs(tallBox.width / scale - 600) < 2 && Math.abs(tallBox.height / scale - 1200) < 2);
  assert(square.canvasX + square.width <= tall.canvasX || tall.canvasX + tall.width <= square.canvasX || square.canvasY + square.height <= tall.canvasY || tall.canvasY + tall.height <= square.canvasY);
  pass("uploaded 900x900 and 600x1200 images render at native canvas dimensions without overlap");

  // Simulate legacy rows without dimensions; the image load must backfill the database.
  await pool.query("update app_artworks set image_width=null,image_height=null where id=$1", [square.id]);
  await page.reload();
  await expect(page.locator(`.react-flow__node[data-id="${square.id}"] img`)).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await pool.query("select image_width,image_height from app_artworks where id=$1", [square.id])).rows[0]).toEqual({ image_width: 900, image_height: 900 });
  pass("legacy artwork dimensions backfill from the original image on first canvas load");

  await page.locator(`.react-flow__node[data-id="${square.id}"]`).click();
  await page.getByRole("button", { name: "解组", exact: true }).click();
  await expect.poll(async () => {
    const grouped = await pool.query("select canvas_group_id from app_artworks where id = any($1::text[])", [[square.id, tall.id]]);
    return grouped.rows.every((row) => !row.canvas_group_id);
  }).toBe(true);
  await page.locator(".react-flow__pane").click({ position: { x: 1200, y: 700 }, force: true });
  await page.locator(`.react-flow__node[data-id="${square.id}"]`).click();
  await page.getByRole("button", { name: /自适应.*1K/ }).click();
  await page.getByLabel("自定义宽度").fill("900");
  await page.getByLabel("自定义高度").fill("1200");
  await page.getByRole("button", { name: "应用", exact: true }).click();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("button", { name: /900×1200.*1K/ })).toBeVisible();
  await page.getByPlaceholder(/描述你想怎么改/).fill("保持商品结构，生成竖版棚拍图");
  await page.getByRole("button", { name: "↑", exact: true }).click();
  await expect.poll(async () => {
    account = await (await api.get(`/api/account?email=${email}`)).json();
    return account.artworks.find(item => item.parentId === square.id && item.origin === "canvas") || null;
  }, { timeout: 120000 }).not.toBeNull();
  const child = account.artworks.find(item => item.parentId === square.id && item.origin === "canvas");
  assert.equal(child.width, 900); assert.equal(child.height, 1200); assert.equal(child.ratio, "900:1200");
  await expect(page.locator(`.react-flow__node[data-id="${child.id}"] img`)).toBeVisible({ timeout: 30000 });
  const childScale = await page.locator(".react-flow__viewport").evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
  const childBox = await page.locator(`.react-flow__node[data-id="${child.id}"] img`).boundingBox();
  assert(Math.abs(childBox.width / childScale - 900) < 2 && Math.abs(childBox.height / childScale - 1200) < 2);
  pass("custom 900x1200 generation persists and renders at the exact requested dimensions");

  const other = await request.newContext({ baseURL: base });
  try {
    assert.equal((await other.post("/api/auth/register", { data: { email: "canvas-size-other@local.test", password, name: "其他账号" } })).status(), 200);
    const denied = await other.post("/api/artworks/dimensions", { data: { id: square.id, width: 1, height: 1 } });
    assert.equal(denied.status(), 400);
  } finally { await other.dispose(); }
  assert.deepEqual(pageErrors, []);
  pass("dimension updates remain owner-scoped and browser runtime has no exceptions");
  console.log("MODIFIED_RESULT=PASS NATIVE=900x900 CUSTOM=900x1200 checks=4");
} catch (error) {
  report.push(`FAIL ${error.stack || error}`);
  if (page) await page.screenshot({ path: path.join(output, "FAILURE.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output, "test.log"), report.join("\n") + "\n");
  await writeFile(path.join(output, "next.log"), appLog.join(""));
  await browser?.close(); await api?.dispose(); await pool?.end();
  if (app?.pid) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "pipe" }); } catch {} }
    else app.kill("SIGTERM");
  }
  if (fixture) await new Promise(resolve => fixture.close(resolve));
  try { execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); } catch {}
}
