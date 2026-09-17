// Browser acceptance for client-side upload optimization and bounded parallelism.
// Runs against isolated PostgreSQL/media fixtures and never touches production data.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import pg from "pg";
import { chromium, request, expect } from "@playwright/test";

const output = path.resolve("output/upload-performance-smoke");
await mkdir(output, { recursive: true });
const container = `naumi-upload-perf-${Date.now()}`;
const password = randomUUID();
const email = "upload-performance@local.test";
const report = [];
const appLog = [];
const pass = message => { report.push(`PASS ${message}`); console.log(report.at(-1)); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let app, pool, browser, api, page;

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

const smallPng = await sharp({ create: { width: 320, height: 240, channels: 4, background: "#75a7c0" } }).png().toBuffer();
const smallFiles = names => names.map(name => ({ name, mimeType: "image/png", buffer: smallPng }));

// High-detail JPEG is intentionally above the 1.5MB optimization threshold but below 12MB.
let seed = 0x12345678;
const raw = Buffer.allocUnsafe(2400 * 1600 * 3);
for (let i = 0; i < raw.length; i++) {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  raw[i] = seed & 255;
}
const largeJpeg = await sharp(raw, { raw: { width: 2400, height: 1600, channels: 3 } }).jpeg({ quality: 96 }).toBuffer();
assert(largeJpeg.length > 1.5 * 1024 * 1024 && largeJpeg.length < 12 * 1024 * 1024, `fixture size=${largeJpeg.length}`);

try {
  execFileSync("docker", ["run", "-d", "--name", container, "-e", "POSTGRES_USER=fixture", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=fixture", "-p", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data", "postgres:16-alpine"], { stdio: "pipe" });
  const mapping = execFileSync("docker", ["port", container, "5432"], { encoding: "utf8" }).trim();
  const database = `postgres://fixture:${password}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool = new pg.Pool({ connectionString: database });
  for (let i = 0; i < 60; i++) { try { await pool.query("select 1"); break; } catch { await sleep(300); } }

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const media = path.join(output, "media");
  await rm(media, { recursive: true, force: true });
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: { ...process.env, DATABASE_URL: database, SETTINGS_SECRET: randomUUID(), ADMIN_EMAIL: email, NAUMI_EDITION: "cloud", NAUMI_MULTI_USER: "1", NAUMI_PUBLIC_COMMERCE: "0", MEDIA_DIR: media, STORAGE_DRIVER: "local", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SMTP_HOST: "", OPENAI_API_KEY: "fixture", OPENAI_BASE_URL: "http://127.0.0.1:1/v1", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", chunk => appLog.push(chunk.toString()));
  app.stderr.on("data", chunk => appLog.push(chunk.toString()));
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await sleep(500); }
  assert(ready, "Next server ready");

  api = await request.newContext({ baseURL: base, timeout: 60000 });
  const registration = await api.post("/api/auth/register", { data: { email, password, name: "上传性能验收" } });
  assert.equal(registration.status(), 200, await registration.text());
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ storageState: await api.storageState(), viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${base}/canvas`);
  await page.getByRole("button", { name: /开始创作/ }).click();
  const surface = page.locator(".react-flow");
  await surface.waitFor();
  async function drop(files) {
    const box = await surface.boundingBox();
    const transfer = await page.evaluateHandle(items => {
      const data = new DataTransfer();
      for (const item of items) data.items.add(new File([Uint8Array.from(atob(item.base64), value => value.charCodeAt(0))], item.name, { type: item.type }));
      return data;
    }, files.map(file => ({ name: file.name, type: file.mimeType, base64: file.buffer.toString("base64") })));
    await surface.dispatchEvent("drop", { dataTransfer: transfer, clientX: box.x + 260, clientY: box.y + 240 });
    await transfer.dispose();
  }

  let canvasActive = 0, canvasMax = 0, captureLarge = false;
  const largeBodies = [];
  await page.route("**/api/artworks/add", async route => {
    if (route.request().method() !== "POST") return route.continue();
    canvasActive++; canvasMax = Math.max(canvasMax, canvasActive);
    if (captureLarge) largeBodies.push(route.request().postDataBuffer()?.length || 0);
    await sleep(350);
    await route.continue();
    canvasActive--;
  });
  await drop(smallFiles(["root.png", "front.png", "side.png", "back.png", "detail.png"]));
  await expect(page.locator('.react-flow__node[data-id^="art-"]')).toHaveCount(5, { timeout: 60000 });
  assert.equal(canvasMax, 4, `canvas max parallel=${canvasMax}`);
  pass("canvas keeps root creation ordered and reaches four parallel uploads afterwards");

  captureLarge = true;
  await page.getByTestId("canvas-image-input").setInputFiles({ name: "large-photo.jpg", mimeType: "image/jpeg", buffer: largeJpeg });
  await expect(page.locator('.react-flow__node[data-id^="art-"]')).toHaveCount(6, { timeout: 60000 });
  assert.equal(largeBodies.length, 1);
  assert(largeBodies[0] < largeJpeg.length * 0.92, `request=${largeBodies[0]} original=${largeJpeg.length}`);
  pass(`large browser image compressed before transfer: ${largeJpeg.length} -> ${largeBodies[0]} bytes including multipart`);
  await page.unroute("**/api/artworks/add");

  await page.goto(`${base}/competitors`);
  await page.getByRole("heading", { name: "竞品工作台" }).waitFor();
  const folder = path.join(output, "folder-fixture", "竞品批量");
  await rm(path.dirname(folder), { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  for (let i = 1; i <= 5; i++) await writeFile(path.join(folder, `${i}.png`), smallPng);
  let competitorActive = 0, competitorMax = 0;
  await page.route("**/api/competitors", async route => {
    if (route.request().method() !== "POST") return route.continue();
    competitorActive++; competitorMax = Math.max(competitorMax, competitorActive);
    await sleep(350);
    await route.continue();
    competitorActive--;
  });
  await page.getByTestId("folder-input").setInputFiles(folder);
  await page.getByText("导入进度 5 / 5", { exact: false }).waitFor({ timeout: 60000 });
  assert.equal(competitorMax, 3, `competitor max parallel=${competitorMax}`);
  pass("competitor folder import reaches three parallel uploads and completes all files");
  await page.unroute("**/api/competitors");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  assert.deepEqual(pageErrors, []);
  pass("upload status remains responsive at 390px with no browser exceptions");
  console.log(`MODIFIED_RESULT=PASS CANVAS_PARALLEL=${canvasMax} COMPETITOR_PARALLEL=${competitorMax} ORIGINAL_BYTES=${largeJpeg.length} REQUEST_BYTES=${largeBodies[0]}`);
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
  try { execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); } catch {}
}
