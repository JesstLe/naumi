// Isolated real Next + PostgreSQL + Chrome acceptance for adaptive/resizable image nodes and 5K output.
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
const workerSecret = randomUUID();
const email = "canvas-native-size@local.test";
const appLog = [], report = [];
const imageEditRequests = [];
const pass = message => { report.push(`PASS ${message}`); console.log(report.at(-1)); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let app, fixture, pool, api, browser, page;

async function readAccountSnapshot() {
  const { rows } = await pool.query(
    `select id,title,category,parent_id,origin,ratio,resolution,image_url,image_width,image_height,
            canvas_x,canvas_y,canvas_width,canvas_height
       from app_artworks
      where email=$1 and deleted_at is null
      order by created_at asc`,
    [email]
  );
  return {
    artworks: rows.map(row => ({
      id: row.id,
      title: row.title,
      category: row.category,
      parentId: row.parent_id,
      origin: row.origin,
      ratio: row.ratio,
      resolution: row.resolution,
      image: row.image_url,
      width: row.image_width,
      height: row.image_height,
      canvasX: row.canvas_x,
      canvasY: row.canvas_y,
      canvasWidth: row.canvas_width,
      canvasHeight: row.canvas_height,
    })),
  };
}

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
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    res.setHeader("content-type", "application/json");
    if (req.url === "/ocr") {
      return res.end(JSON.stringify({
        results: [
          { text: "春日上新", confidence: 0.98, box: [100, 120, 300, 80] },
          { text: "限时优惠", confidence: 0.96, box: [520, 720, 240, 72] },
        ],
      }));
    }
    if (req.url === "/v1/images/edits" || req.url === "/v1/images/generations") {
      if (req.url === "/v1/images/edits") {
        imageEditRequests.push(body.toString("utf8"));
        await sleep(1200);
      }
      return res.end(JSON.stringify({ data: [{ b64_json: generated.toString("base64") }] }));
    }
    res.statusCode = 404; res.end("{}");
  });
  await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
  const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
  const provider = `${fixtureOrigin}/v1`;
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: { ...process.env, DATABASE_URL: database, SETTINGS_SECRET: randomUUID(), VIDEO_WORKER_SECRET: workerSecret, ADMIN_EMAIL: email, NAUMI_EDITION: "cloud", NAUMI_MULTI_USER: "1", NAUMI_PUBLIC_COMMERCE: "0", MEDIA_DIR: path.join(output, "media"), STORAGE_DRIVER: "local", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SMTP_HOST: "", OPENAI_API_KEY: "fixture", OPENAI_BASE_URL: provider, OPENAI_IMAGE_MODEL: "gpt-image-2", PADDLE_OCR_BASE_URL: `${fixtureOrigin}/ocr`, NEXT_TELEMETRY_DISABLED: "1" },
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
  let account = await readAccountSnapshot();
  const square = account.artworks.find(item => item.title === "square-900.png");
  const tall = account.artworks.find(item => item.title === "portrait-600x1200.png");
  assert.equal(square.width, 900); assert.equal(square.height, 900);
  assert.equal(tall.width, 600); assert.equal(tall.height, 1200);
  assert.equal(square.canvasWidth, 420); assert.equal(square.canvasHeight, 420);
  assert.equal(tall.canvasWidth, 210); assert.equal(tall.canvasHeight, 420);
  const scale = await page.locator(".react-flow__viewport").evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
  const squareNode = page.locator(`.react-flow__node[data-id="${square.id}"]`);
  const tallNode = page.locator(`.react-flow__node[data-id="${tall.id}"]`);
  const squareBox = await squareNode.locator("img").boundingBox();
  const tallBox = await tallNode.locator("img").boundingBox();
  assert(Math.abs(squareBox.width / scale - square.canvasWidth) <= 3 && Math.abs(squareBox.height / scale - square.canvasHeight) <= 3);
  assert(Math.abs(tallBox.width / scale - tall.canvasWidth) <= 3 && Math.abs(tallBox.height / scale - tall.canvasHeight) <= 3);
  assert(square.canvasX + square.canvasWidth <= tall.canvasX || tall.canvasX + tall.canvasWidth <= square.canvasX || square.canvasY + square.canvasHeight <= tall.canvasY || tall.canvasY + tall.canvasHeight <= square.canvasY);
  await expect(squareNode.getByText("square-900.png", { exact: true })).toBeVisible();
  assert.equal(
    await squareNode.locator(".react-flow__handle").first().evaluate(element => getComputedStyle(element).opacity),
    "0"
  );
  const addButtonBox = await page.getByTestId("canvas-add-node-button").boundingBox();
  const mainToolbarButtons = page.getByTestId("canvas-main-toolbar").locator("button");
  const regularToolbarButtonBox = await mainToolbarButtons.nth(1).boundingBox();
  assert(addButtonBox && regularToolbarButtonBox, "canvas toolbar buttons are missing");
  assert(
    addButtonBox.width === regularToolbarButtonBox.width &&
      addButtonBox.height === regularToolbarButtonBox.height,
    `add and arrow containers must match: ${JSON.stringify({ addButtonBox, regularToolbarButtonBox })}`
  );
  assert(addButtonBox.width >= 36 && addButtonBox.height >= 36);
  pass("imports keep intrinsic pixels while adaptive image-only nodes, filenames, and consistently sized dock icons stay clearly visible");

  await page.setViewportSize({ width: 2560, height: 1440 });
  const highResolutionTitleSize = Number.parseFloat(
    await squareNode.getByText("square-900.png", { exact: true })
      .evaluate(element => getComputedStyle(element).fontSize)
  );
  assert(highResolutionTitleSize >= 14, `title is too small: ${highResolutionTitleSize}px`);
  await squareNode.getByText("square-900.png", { exact: true }).dblclick();
  const inlineRename = page.locator('input[placeholder="项目名称"]:visible');
  await expect(inlineRename).toBeVisible();
  await inlineRename.fill("square-900-已改名.png");
  await inlineRename.press("Enter");
  await expect(squareNode.getByText("square-900-已改名.png", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const refreshed = await readAccountSnapshot();
    return refreshed.artworks.find(item => item.id === square.id)?.title;
  }).toBe("square-900-已改名.png");
  await page.setViewportSize({ width: 1600, height: 1000 });
  pass("responsive image titles remain readable and double-click opens inline rename");

  // Simulate legacy rows without dimensions; the image load must backfill the database.
  await pool.query("update app_artworks set image_width=null,image_height=null where id=$1", [square.id]);
  await page.reload();
  await expect(page.locator(`.react-flow__node[data-id="${square.id}"] img`)).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await pool.query("select image_width,image_height from app_artworks where id=$1", [square.id])).rows[0]).toEqual({ image_width: 900, image_height: 900 });
  pass("legacy intrinsic dimensions backfill without overwriting adaptive canvas dimensions");

  await squareNode.click();
  await expect.poll(() => squareNode.locator(".react-flow__handle").first().evaluate(element => getComputedStyle(element).opacity)).toBe("1");
  await page.getByRole("button", { name: "解组", exact: true }).click();
  await expect.poll(async () => {
    const grouped = await pool.query("select canvas_group_id from app_artworks where id = any($1::text[])", [[square.id, tall.id]]);
    return grouped.rows.every((row) => !row.canvas_group_id);
  }).toBe(true);
  await page.locator(".react-flow__pane").click({ position: { x: 1200, y: 700 }, force: true });
  await squareNode.click();
  const resizeHandle = squareNode.locator(".react-flow__resize-control.handle.bottom.right");
  await expect(resizeHandle).toBeVisible();
  await page.waitForTimeout(700);
  const resizeBox = await resizeHandle.boundingBox();
  assert(resizeBox, "image resize handle is missing");
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  // Keep the drag endpoint above the persistent bottom toolbar. A 140px diagonal
  // drag can terminate on the toolbar at 1000px viewport height, which prevents
  // React Flow from delivering the resize-end event.
  await page.mouse.move(resizeBox.x + 80, resizeBox.y + 80, { steps: 16 });
  await page.mouse.up();
  await expect.poll(async () => {
    account = await readAccountSnapshot();
    const resized = account.artworks.find(item => item.id === square.id);
    return resized?.canvasWidth > 420 && resized?.canvasHeight > 420;
  }, { timeout: 30000 }).toBe(true);
  const resizedSquare = account.artworks.find(item => item.id === square.id);
  assert.equal(resizedSquare.width, 900); assert.equal(resizedSquare.height, 900);
  await page.reload();
  await expect(page.locator(`.react-flow__node[data-id="${square.id}"] img`)).toBeVisible({ timeout: 30000 });
  account = await readAccountSnapshot();
  const restoredSquare = account.artworks.find(item => item.id === square.id);
  assert.equal(restoredSquare.canvasWidth, resizedSquare.canvasWidth);
  assert.equal(restoredSquare.canvasHeight, resizedSquare.canvasHeight);
  pass("click reveals controls and proportional image resizing persists separately from intrinsic pixels");

  await page.locator(`.react-flow__node[data-id="${square.id}"]`).click();
  await page.getByTitle("在线改字").click();
  const ocrPanel = page.getByLabel("在线改字面板");
  await expect(ocrPanel).toBeVisible();
  await expect(ocrPanel.getByLabel("修改文字 1")).toHaveValue("春日上新");
  await expect(ocrPanel.getByLabel("修改文字 2")).toHaveValue("限时优惠");
  await ocrPanel.getByLabel("修改文字 1").fill("夏日焕新");
  await ocrPanel.getByLabel("应用文字 1").click();
  await expect(page.locator('.react-flow__node[data-id^="pend-text-edit-"]')).toHaveCount(1);
  let textEdited;
  await expect.poll(async () => {
    const tick = await api.post("/api/video/worker/tick", { headers: { "x-video-worker-secret": workerSecret } });
    assert.equal(tick.status(), 200, await tick.text());
    account = await readAccountSnapshot();
    textEdited = account.artworks.find(item => item.parentId === square.id && item.category === "canvas-text-edit");
    return Boolean(
      textEdited &&
      textEdited.canvasX > restoredSquare.canvasX + restoredSquare.canvasWidth &&
      textEdited.canvasY === restoredSquare.canvasY
    );
  }, { timeout: 120000 }).toBe(true);
  await expect(page.locator(`.react-flow__node[data-id="${textEdited.id}"] img`)).toBeVisible({ timeout: 30000 });
  assert(textEdited.canvasX > restoredSquare.canvasX + restoredSquare.canvasWidth);
  assert.equal(textEdited.canvasY, restoredSquare.canvasY);
  assert(imageEditRequests.some(body =>
    body.includes("图片其余所有画面100%保持原样") &&
    body.includes("旧文字：春日上新") &&
    body.includes("新文字：夏日焕新") &&
    body.includes("x=64")
  ));
  await expect(ocrPanel).toContainText("已生成改字结果");
  await ocrPanel.getByLabel("关闭在线改字").click();
  pass("PaddleOCR text list edits one boxed region and places a progress-backed result to the source image right");

  await page.locator(`.react-flow__node[data-id="${square.id}"]`).click();
  await page.getByRole("button", { name: /自适应.*1K/ }).click();
  await page.getByLabel("自定义宽度").fill("5120");
  await page.getByLabel("自定义高度").fill("2880");
  await page.getByRole("button", { name: "应用", exact: true }).click();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("button", { name: /5120×2880.*5K/ })).toBeVisible();
  await page.getByPlaceholder(/描述你想怎么改/).fill("保持商品结构，生成 5K 横版棚拍图");
  await page.getByRole("button", { name: "↑", exact: true }).click();
  await expect.poll(async () => {
    account = await readAccountSnapshot();
    return account.artworks.find(item => item.parentId === square.id && item.origin === "canvas" && item.resolution === "5K") || null;
  }, { timeout: 120000 }).not.toBeNull();
  const child = account.artworks.find(item => item.parentId === square.id && item.origin === "canvas" && item.resolution === "5K");
  assert.equal(child.width, 5120); assert.equal(child.height, 2880); assert.equal(child.ratio, "5120:2880"); assert.equal(child.resolution, "5K");
  assert.equal(child.canvasWidth, null); assert.equal(child.canvasHeight, null);
  await expect(page.locator(`.react-flow__node[data-id="${child.id}"] img`)).toBeVisible({ timeout: 30000 });
  const childScale = await page.locator(".react-flow__viewport").evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
  const childBox = await page.locator(`.react-flow__node[data-id="${child.id}"] img`).boundingBox();
  assert(Math.abs(childBox.width / childScale - 420) <= 3 && Math.abs(childBox.height / childScale - 236) <= 3);
  const generatedImageUrl = child.image || child.url;
  assert(generatedImageUrl, "generated image URL missing");
  const generatedResponse = generatedImageUrl.startsWith("data:")
    ? await fetch(generatedImageUrl)
    : await api.get(generatedImageUrl);
  const generatedOk = typeof generatedResponse.ok === "function" ? generatedResponse.ok() : generatedResponse.ok;
  const generatedStatus = typeof generatedResponse.status === "function" ? generatedResponse.status() : generatedResponse.status;
  assert(generatedOk, `generated image fetch failed: ${generatedStatus}`);
  const generatedBytes = "body" in generatedResponse
    ? await generatedResponse.body()
    : Buffer.from(await generatedResponse.arrayBuffer());
  const generatedMeta = await sharp(Buffer.from(generatedBytes)).metadata();
  assert.equal(generatedMeta.width, 5120); assert.equal(generatedMeta.height, 2880);
  pass("custom 5120x2880 generation keeps exact output metadata while the canvas node opens at an adaptive size");

  const other = await request.newContext({ baseURL: base });
  try {
    assert.equal((await other.post("/api/auth/register", { data: { email: "canvas-size-other@local.test", password, name: "其他账号" } })).status(), 200);
    const denied = await other.post("/api/artworks/canvas-size", { data: { id: square.id, x: 0, y: 0, width: 500, height: 500 } });
    assert.equal(denied.status(), 400);
  } finally { await other.dispose(); }
  assert.deepEqual(pageErrors, []);
  pass("dimension updates remain owner-scoped and browser runtime has no exceptions");
  console.log("MODIFIED_RESULT=PASS ADAPTIVE=420 RESIZABLE=true OCR_EDIT=true INLINE_RENAME=true CUSTOM=5120x2880 RESOLUTION=5K checks=7");
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
