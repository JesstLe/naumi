// Real canvas + upload routes in an isolated database. No existing account/media is touched.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import pg from "pg";
import { chromium, request, expect } from "@playwright/test";

const baseline = process.argv.includes("--baseline");
const out = path.resolve("output/canvas-batch-import");
await mkdir(out, { recursive: true });
const container = `naumi-canvas-import-${Date.now()}`;
const password = randomUUID(), email = "canvas-import@local.test";
const log = [], appLog = [], errors = [];
const pass = name => { log.push(`PASS ${name}`); console.log(log.at(-1)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let app, pool, browser, api, page;
const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#4f9caa" } }).png().toBuffer();
const files = names => names.map(name => ({ name, mimeType: "image/png", buffer: png }));
try {
  execFileSync("docker", ["run", "-d", "--name", container, "-e", "POSTGRES_USER=fixture", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=fixture", "-p", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data", "postgres:16-alpine"], { stdio: "pipe" });
  const mapping = execFileSync("docker", ["port", container, "5432"], { encoding: "utf8" }).trim();
  const database = `postgres://fixture:${password}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool = new pg.Pool({ connectionString: database });
  for (let i = 0; i < 60; i++) { try { await pool.query("select 1"); break; } catch { await sleep(300); } }
  const server = createServer(); await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: { ...process.env, DATABASE_URL: database, SETTINGS_SECRET: randomUUID(), ADMIN_EMAIL: email, NAUMI_EDITION: "cloud", NAUMI_MULTI_USER: "1", NAUMI_PUBLIC_COMMERCE: "0", MEDIA_DIR: path.join(out, baseline ? "baseline-media" : "media"), STORAGE_DRIVER: "local", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SMTP_HOST: "", OPENAI_API_KEY: "fixture", OPENAI_BASE_URL: "http://127.0.0.1:1/v1", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", x => appLog.push(x.toString())); app.stderr.on("data", x => appLog.push(x.toString()));
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await sleep(500); }
  assert(ready);
  api = await request.newContext({ baseURL: base, timeout: 60000 });
  const registration = await api.post("/api/auth/register", { data: { email, password, name: "画布导入验收" } });
  assert.equal(registration.status(), 200, await registration.text());
  const works = async () => (await (await api.get(`/api/account?email=${email}`)).json()).artworks;
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ storageState: await api.storageState(), viewport: { width: 1440, height: 1000 } });
  page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/canvas`);
  const browserLanding = page.getByTestId("canvas-project-browser");
  await expect(browserLanding).toBeVisible();
  await expect(page.getByRole("button", { name: "通用工作流", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^商品主图/ })).toBeVisible();
  const landingBg = await browserLanding.evaluate(element => getComputedStyle(element).backgroundColor);
  assert.equal(landingBg, "rgb(246, 247, 249)");
  pass("project browser uses the light workbench layout and exposes common workflows");
  await page.screenshot({ path: path.join(out, "landing-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: path.join(out, "landing-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  pass("project browser remains readable at 390px without horizontal overflow");
  await page.getByRole("button", { name: /开始创作/ }).click();
  await page.locator(".react-flow").waitFor();
  const surface = page.locator(".react-flow");
  async function drop(entries, offset = { x: 220, y: 200 }) {
    const box = await surface.boundingBox();
    const data = await page.evaluateHandle(items => {
      const dt = new DataTransfer();
      for (const item of items) dt.items.add(new File([Uint8Array.from(atob(item.base64), c => c.charCodeAt(0))], item.name, { type: item.type }));
      return dt;
    }, entries.map(f => ({ name: f.name, type: f.mimeType, base64: f.buffer.toString("base64") })));
    await surface.dispatchEvent("dragenter", { dataTransfer: data });
    await surface.dispatchEvent("dragover", { dataTransfer: data });
    await surface.dispatchEvent("drop", { dataTransfer: data, clientX: box.x + offset.x, clientY: box.y + offset.y });
    await data.dispose();
  }
  const nodes = page.locator('.react-flow__node[data-id^="art-"]');
  if (baseline) {
    await drop(files(["front.png", "side.png", "back.png"]));
    await sleep(800);
    assert.equal((await works()).length, 0);
    assert.equal(await page.locator('input[type="file"]').last().getAttribute("multiple"), null);
    pass("baseline: file drop creates 0 nodes; root picker is single-select");
    console.log("BASELINE_RESULT=PASS DROP_NODES=0 MULTIPLE=0");
  } else {
    await drop(files(["front.png", "side.png", "back.png"]));
    await expect(nodes).toHaveCount(3, { timeout: 60000 });
    await expect(page.getByTestId("canvas-import-status")).toContainText("完成 3 / 3");
    let list = await works();
    assert.equal(new Set(list.map(a => a.groupId)).size, 1);
    assert.equal(new Set(list.map(a => a.canvasGroupId)).size, 1);
    assert(list[0].canvasGroupId);
    assert.equal(new Set(list.map(a => `${a.canvasX},${a.canvasY}`)).size, 3);
    assert.deepEqual(list.map(a => a.title).sort(), ["back.png", "front.png", "side.png"]);
    assert.equal(await page.locator(".react-flow__edge").count(), 0);
    await expect.poll(() => nodes.locator("img").evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0))).toBe(true);
    pass("drop three images: three loaded nodes, filename titles, one project, separate positions, no false edges");

    // One batch is an editable group: clicking one member selects the whole group.
    await nodes.first().click();
    await expect(page.getByLabel("批量操作")).toContainText("已选 3 个");
    await expect(page.getByRole("button", { name: "解组", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "解组", exact: true }).click();
    await expect.poll(async () => (await works()).filter(a => ["front.png", "side.png", "back.png"].includes(a.title)).every(a => !a.canvasGroupId)).toBe(true);
    pass("batch import auto-groups nodes and the group can be explicitly ungrouped");

    await page.locator(".react-flow__pane").click({ position: { x: 900, y: 650 }, force: true });
    await page.keyboard.down("Control");
    await nodes.nth(0).click();
    await nodes.nth(1).click();
    await page.keyboard.up("Control");
    await expect(page.getByRole("button", { name: "成组", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "成组", exact: true }).click();
    await expect.poll(async () => {
      const imported = (await works()).filter(a => ["front.png", "side.png", "back.png"].includes(a.title));
      const grouped = imported.filter(a => a.canvasGroupId);
      return grouped.length === 2 && new Set(grouped.map(a => a.canvasGroupId)).size === 1;
    }).toBe(true);
    pass("arbitrary multi-selection can be grouped without changing project lineage");

    await page.locator(".react-flow__pane").click({ position: { x: 900, y: 650 }, force: true });
    const groupedBefore = (await works()).filter(a => a.canvasGroupId);
    const groupedIds = groupedBefore.map(a => a.id);
    const groupedNode = page.locator(`.react-flow__node[data-id="${groupedIds[0]}"]`);
    await groupedNode.click();
    await expect(page.getByLabel("批量操作")).toContainText("已选 2 个");
    const box = await groupedNode.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => {
      const after = (await works()).filter(a => groupedIds.includes(a.id));
      return after.length === 2 && after.every(a => {
        const before = groupedBefore.find(item => item.id === a.id);
        return Math.abs(a.canvasX - before.canvasX) > 10 && Math.abs(a.canvasY - before.canvasY) > 10;
      });
    }).toBe(true);
    pass("clicking a grouped member selects and moves the full group with persisted positions");
    await page.getByRole("button", { name: "解组", exact: true }).click();
    await expect.poll(async () => {
      const ungrouped = (await works()).filter(a => groupedIds.includes(a.id));
      return ungrouped.length === 2 && ungrouped.every(a => !a.canvasGroupId);
    }).toBe(true);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => {
      const restored = (await works()).filter(a => groupedIds.includes(a.id));
      return restored.length === 2 && restored.every(a => a.canvasGroupId === restored[0].canvasGroupId && !!a.canvasGroupId);
    }).toBe(true);
    pass("ungroup participates in undo and restores the persisted group");
    await page.getByRole("button", { name: "清除选择", exact: true }).click();

    // A second drop is queued while the first is in-flight, never rejected/locked.
    await drop(files(["four.png", "five.png"]));
    await drop(files(["six.png", "seven.png"]), { x: 600, y: 200 });
    await expect(nodes).toHaveCount(7, { timeout: 60000 });
    list = await works(); assert.equal(new Set(list.map(a => a.groupId)).size, 1);
    assert.equal(new Set(list.map(a => `${a.canvasX},${a.canvasY}`)).size, 7);
    pass("successive drops remain in one project and reserve non-overlapping slots");

    const picker = page.getByTestId("canvas-image-input");
    assert.notEqual(await picker.getAttribute("multiple"), null);
    await picker.setInputFiles(files(["eight.png", "nine.png"]));
    await expect(nodes).toHaveCount(9, { timeout: 60000 });
    await expect(page.getByTestId("canvas-import-status")).toContainText("完成 2 / 2");
    await page.keyboard.press("Control+z");
    await expect(nodes).toHaveCount(7, { timeout: 30000 });
    await expect.poll(async () => (await works()).length).toBe(7);
    await page.keyboard.press("Control+Shift+z");
    await expect(nodes).toHaveCount(9, { timeout: 30000 });
    pass("a batch is one undo/redo action and restores every node");
    await picker.setInputFiles(files(["eight.png", "nine.png"]));
    await expect(nodes).toHaveCount(11, { timeout: 60000 });
    pass("multi-select picker and reselecting identical files work");

    await drop([...files(["valid.png"]), { name: "readme.txt", mimeType: "text/plain", buffer: Buffer.from("test") }, { name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(12 * 1024 * 1024 + 1) }]);
    await expect(nodes).toHaveCount(12, { timeout: 60000 });
    await expect(page.getByTestId("canvas-import-status")).toContainText("失败 2");
    await expect(page.getByTestId("canvas-import-status")).toContainText("readme.txt");
    await expect(page.getByTestId("canvas-import-status")).toContainText("large.png");
    pass("mixed valid, non-image and oversized files preserve successful imports and identify each failure");

    let failed = false;
    await page.route("**/api/artworks/add", async route => {
      if (!failed) { failed = true; await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"fixture upload failure"}' }); }
      else await route.continue();
    });
    await drop(files(["failed.png", "survives.png"]));
    await expect(nodes).toHaveCount(13, { timeout: 60000 });
    await expect(page.getByTestId("canvas-import-status")).toContainText("failed.png");
    await expect(page.getByTestId("canvas-import-status")).toContainText("fixture upload failure");
    await page.unroute("**/api/artworks/add");
    pass("one failed request does not cancel other files");

    await page.screenshot({ path: path.join(out, "DESKTOP.png"), fullPage: true });
    await page.reload(); await expect(nodes).toHaveCount(13, { timeout: 60000 });
    assert.equal(new Set((await works()).map(a => a.groupId)).size, 1);
    pass("refresh restores all imported nodes in the same project");

    const addNodeButton = page.getByRole("button", { name: "添加节点", exact: true });
    const addNodeBox = await addNodeButton.boundingBox();
    assert(addNodeBox.width >= 48 && addNodeBox.height >= 48);
    await page.getByRole("button", { name: /^\d+(?:\.\d+)?%$/ }).click();
    const zoomInput = page.locator('.menu-pop-up input[inputmode="decimal"]');
    await zoomInput.fill("5");
    await zoomInput.press("Enter");
    await addNodeButton.click();
    await page.getByRole("button", { name: "图片节点", exact: true }).click();
    await expect.poll(() => page.locator(".react-flow__viewport").evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)).toBeGreaterThanOrEqual(.75);
    const pendingHandleBox = await page.locator('.react-flow__node[data-id^="pend-"] .react-flow__handle-left').boundingBox();
    assert(pendingHandleBox.width >= 34 && pendingHandleBox.height >= 34);
    pass("larger add controls remain clickable and new nodes auto-focus from a tiny canvas zoom");
    await page.locator(".react-flow__pane").click({ position: { x: 900, y: 650 }, force: true });

    await page.getByRole("button", { name: /^\d+%$/ }).click();
    await page.getByRole("button", { name: "缩放至50%", exact: true }).click();
    await expect(page.getByRole("button", { name: "50%", exact: true })).toBeVisible();
    await expect.poll(() => page.locator(".react-flow__viewport").evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)).toBe(.5);
    // Pan empty canvas with middle mouse, then measure the actual viewport transform.
    await page.mouse.move(1200, 700); await page.mouse.down({ button: "middle" });
    await page.mouse.move(1100, 600, { steps: 5 }); await page.mouse.up({ button: "middle" });
    const matrix = await page.locator(".react-flow__viewport").evaluate(el => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return { x: m.e, y: m.f, zoom: m.a };
    });
    assert.equal(matrix.zoom, .5);
    const point = { x: 40, y: 100 };
    // 320x240 source images open as adaptive 420x315 canvas nodes plus the 28px label.
    const expected = { x: Math.round((point.x - matrix.x) / matrix.zoom - 210), y: Math.round((point.y - matrix.y) / matrix.zoom - 172) };
    list = await works();
    while (list.some(a => Math.abs(a.canvasX - expected.x) < 444 && Math.abs(a.canvasY - expected.y) < 367)) expected.y += 391;
    await drop(files(["zoomed.png"]), point);
    await expect(nodes).toHaveCount(14, { timeout: 60000 });
    const zoomed = (await works()).find(a => a.title === "zoomed.png");
    assert.equal(zoomed.canvasX, expected.x); assert.equal(zoomed.canvasY, expected.y);
    pass("zoomed and panned drop uses real flow coordinates");

    // Native text/URL drags are not consumed as files; only file drops get a hint.
    const urlDrag = await page.evaluateHandle(() => { const dt = new DataTransfer(); dt.setData("text/uri-list", "https://example.com/image.png"); return dt; });
    await surface.dispatchEvent("dragenter", { dataTransfer: urlDrag });
    await surface.dispatchEvent("drop", { dataTransfer: urlDrag });
    await expect(page.getByTestId("canvas-drop-hint")).toHaveCount(0);
    await urlDrag.dispose(); assert.equal((await works()).length, 14);
    pass("non-file drag does not create nodes or show file overlay");

    // A new blank canvas receives two batches before a root exists; the first file fails.
    await page.getByRole("button", { name: "Naumi", exact: true }).click();
    await page.getByRole("button", { name: "创建新项目", exact: true }).click();
    let first = true;
    await page.route("**/api/artworks/add", async route => {
      if (first) { first = false; await sleep(800); await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"first root failed"}' }); }
      else await route.continue();
    });
    await drop(files(["bad-root.png", "new-root.png", "new-child.png"]));
    await drop(files(["queued-a.png", "queued-b.png"]));
    await expect(nodes).toHaveCount(4, { timeout: 60000 });
    await expect.poll(async () => (await works()).length).toBe(18);
    list = (await works()).filter(a => ["new-root.png", "new-child.png", "queued-a.png", "queued-b.png"].includes(a.title));
    assert.equal(new Set(list.map(a => a.groupId)).size, 1);
    assert.notEqual(list[0].groupId, zoomed.groupId);
    assert.equal(new Set(list.map(a => `${a.canvasX},${a.canvasY}`)).size, 4);
    await page.unroute("**/api/artworks/add");
    pass("new-canvas queued batches share the first successful root despite a failed first file");

    // Switching projects while a request is pending must not jump back on completion.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/api/artworks/add", async route => { await gate; await route.continue(); });
    await drop(files(["background.png"]));
    await page.getByRole("button", { name: "Naumi", exact: true }).click();
    await page.getByRole("button", { name: "创建新项目", exact: true }).click();
    release();
    await expect.poll(async () => (await works()).length).toBe(19);
    await expect(page.getByTestId("canvas-import-status")).toContainText("完成 1 / 1");
    await expect(nodes).toHaveCount(0);
    await page.unroute("**/api/artworks/add");
    pass("background upload remains in captured project without hijacking new canvas");
    await page.screenshot({ path: path.join(out, "EMPTY_CANVAS.png"), fullPage: true });

    const other = await request.newContext({ baseURL: base });
    let otherId;
    try {
      assert.equal((await other.post("/api/auth/register", { data: { email: "canvas-import-other@local.test", password, name: "只读验收" } })).status(), 200);
      const seed = await other.post("/api/artworks/add", { multipart: { title: "other.png", image: { name: "other.png", mimeType: "image/png", buffer: png } } });
      assert.equal(seed.status(), 200); otherId = (await seed.json()).id;
    } finally { await other.dispose(); }
    await page.goto(`${base}/canvas?email=canvas-import-other@local.test&node=${otherId}`);
    await expect(nodes).toHaveCount(1, { timeout: 30000 });
    let readonlyWrites = 0;
    page.on("request", req => { if (req.url().endsWith("/api/artworks/add") && req.method() === "POST") readonlyWrites++; });
    await drop(files(["readonly.png"]));
    await page.getByTestId("canvas-image-input").setInputFiles(files(["readonly-picker.png"]));
    await sleep(500);
    assert.equal(readonlyWrites, 0); await expect(nodes).toHaveCount(1);
    await expect(page.getByTestId("canvas-drop-hint")).toHaveCount(0);
    pass("read-only view rejects both drop and picker without making upload requests");
    assert.deepEqual(errors, []); pass("no browser runtime exceptions");
    console.log(`MODIFIED_RESULT=PASS checks=${log.length}`);
  }
} catch (e) {
  log.push(`FAIL ${e.stack}`);
  if (page) { await page.screenshot({ path: path.join(out, "FAILURE.png"), fullPage: true }).catch(() => {}); await writeFile(path.join(out, "FAILURE.txt"), await page.locator("body").innerText().catch(() => "")); }
  throw e;
} finally {
  await writeFile(path.join(out, baseline ? "baseline.log" : "test.log"), log.join("\n") + "\n");
  await writeFile(path.join(out, baseline ? "baseline-next.log" : "next.log"), appLog.join(""));
  await browser?.close(); await api?.dispose(); await pool?.end();
  if (app?.pid) { if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "pipe" }); } catch {} } else app.kill("SIGTERM"); }
  try { execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); } catch {}
}
