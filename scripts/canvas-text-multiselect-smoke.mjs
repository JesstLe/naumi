// Isolated browser regression for mixed artwork/text movement, deletion, and media clipboard copies.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import sharp from "sharp";
import { chromium, expect, request } from "@playwright/test";

const output = path.resolve("output/canvas-text-multiselect-smoke");
const distDir = `output/canvas-text-multiselect-smoke/.next-${process.pid}`;
const tsconfigPath = path.resolve("tsconfig.json");
const originalTsconfig = await readFile(tsconfigPath);
const container = `naumi-text-multiselect-${Date.now()}`;
const password = randomUUID();
const email = "canvas-text-multiselect@local.test";
const report = [];
const appLog = [];
let app;
let pool;
let api;
let browser;
let page;

const pass = (message) => {
  report.push(`PASS ${message}`);
  console.log(report.at(-1));
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function positions(rootId, textId) {
  const [accountResponse, textResponse] = await Promise.all([
    api.get(`/api/account?email=${encodeURIComponent(email)}`),
    api.get(`/api/canvas/text-nodes?email=${encodeURIComponent(email)}`),
  ]);
  const account = await accountResponse.json();
  const textState = await textResponse.json();
  const artwork = account.artworks?.find((item) => item.id === rootId);
  const textNode = textState.nodes?.find((item) => item.id === textId);
  assert(artwork, "artwork fixture disappeared");
  assert(textNode, "text fixture disappeared");
  return {
    artwork: { x: Number(artwork.canvasX), y: Number(artwork.canvasY) },
    text: { x: Number(textNode.canvasX), y: Number(textNode.canvasY) },
  };
}

async function nodePresence(rootId, textId) {
  const [accountResponse, textResponse] = await Promise.all([
    api.get(`/api/account?email=${encodeURIComponent(email)}`),
    api.get(`/api/canvas/text-nodes?email=${encodeURIComponent(email)}`),
  ]);
  const account = await accountResponse.json();
  const textState = await textResponse.json();
  return {
    artwork: account.artworks?.some((item) => item.id === rootId) ?? false,
    text: textState.nodes?.some((item) => item.id === textId) ?? false,
    artworks: account.artworks ?? [],
    textNodes: textState.nodes ?? [],
  };
}

function samePoint(actual, expected, tolerance = 0.01) {
  return (
    Math.abs(actual.x - expected.x) <= tolerance &&
    Math.abs(actual.y - expected.y) <= tolerance
  );
}

async function flowPosition(locator) {
  return locator.evaluate((element) => {
    const match = element.style.transform.match(
      /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/
    );
    if (!match) throw new Error(`missing React Flow translate: ${element.style.transform}`);
    return { x: Number(match[1]), y: Number(match[2]) };
  });
}

try {
  await mkdir(output, { recursive: true });
  const canvasSource = await readFile(
    path.resolve("src/components/canvas/canvas-client.tsx"),
    "utf8"
  );
  assert.match(canvasSource, /height:\s*canvasSize\.height,/);
  assert.doesNotMatch(canvasSource, /height:\s*canvasSize\.height\s*\+\s*NODE_LABEL_H/);
  assert.match(canvasSource, /setNaturalSize/);
  assert.match(canvasSource, /sizeOnly:\s*true/);
  assert.match(canvasSource, /\/api\/canvas\/nodes\/delete/);
  pass("image card height equals the decoded image canvas and ratio repair is silent");
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      container,
      "-e",
      "POSTGRES_USER=fixture",
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-e",
      "POSTGRES_DB=fixture",
      "-p",
      "127.0.0.1::5432",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "postgres:16-alpine",
    ],
    { stdio: "pipe" }
  );
  const mapping = execFileSync("docker", ["port", container, "5432"], {
    encoding: "utf8",
  }).trim();
  const database = `postgres://fixture:${password}@127.0.0.1:${mapping
    .split(":")
    .pop()}/fixture?sslmode=disable`;
  pool = new pg.Pool({ connectionString: database });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await pool.query("select 1");
      break;
    } catch {
      await sleep(300);
    }
  }

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  app = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-p", String(port)],
    {
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
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_DIST_DIR: distDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  app.stdout.on("data", (chunk) => appLog.push(chunk.toString()));
  app.stderr.on("data", (chunk) => appLog.push(chunk.toString()));
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {
      // wait for Next.js
    }
    await sleep(500);
  }
  assert(ready, "Next.js did not become ready");

  api = await request.newContext({ baseURL: base, timeout: 120_000 });
  const registration = await api.post("/api/auth/register", {
    data: { email, password, name: "文字多选移动验收" },
  });
  assert.equal(registration.status(), 200, await registration.text());

  const png = await sharp({
    create: {
      width: 480,
      height: 360,
      channels: 4,
      background: "#dce7f7",
    },
  })
    .png()
    .toBuffer();
  const artworkResponse = await api.post("/api/artworks/add", {
    multipart: {
      title: "多选图片节点",
      image: { name: "fixture.png", mimeType: "image/png", buffer: png },
    },
  });
  assert.equal(artworkResponse.status(), 200, await artworkResponse.text());
  const artwork = await artworkResponse.json();
  const initialArtwork = { x: 120, y: 180 };
  const positionResponse = await api.post("/api/artworks/position", {
    data: {
      id: artwork.id,
      x: initialArtwork.x,
      y: initialArtwork.y,
    },
  });
  assert.equal(positionResponse.status(), 200, await positionResponse.text());

  const textId = `text-${randomUUID()}`;
  const initialText = { x: 560, y: 180 };
  const textResponse = await api.post("/api/canvas/text-nodes", {
    data: {
      id: textId,
      projectKey: `tree:${artwork.id}`,
      title: "多选文字节点",
      prompt: "验证多选移动",
      content: "文字节点必须通过 text-nodes API 持久化",
      status: "completed",
      canvasX: initialText.x,
      canvasY: initialText.y,
      width: 300,
      height: 176,
      sourceIds: [],
      targetIds: [],
      productIds: [],
    },
  });
  assert.equal(textResponse.status(), 200, await textResponse.text());

  const rollbackArtworkResponse = await api.post("/api/artworks/add", {
    multipart: {
      title: "事务回滚图片节点",
      image: { name: "rollback.png", mimeType: "image/png", buffer: png },
    },
  });
  assert.equal(rollbackArtworkResponse.status(), 200, await rollbackArtworkResponse.text());
  const rollbackArtwork = await rollbackArtworkResponse.json();
  const rollbackTextId = `text-rollback-${randomUUID()}`;
  const rollbackTextResponse = await api.post("/api/canvas/text-nodes", {
    data: {
      id: rollbackTextId,
      projectKey: `tree:${rollbackArtwork.id}`,
      title: "事务回滚文字节点",
      prompt: "验证原子删除",
      content: "删除失败时图片和文字必须同时保留",
      status: "completed",
      canvasX: 0,
      canvasY: 0,
      width: 300,
      height: 176,
      sourceIds: [],
      targetIds: [],
      productIds: [],
    },
  });
  assert.equal(rollbackTextResponse.status(), 200, await rollbackTextResponse.text());
  await pool.query(`
    CREATE OR REPLACE FUNCTION naumi_force_canvas_delete_rollback()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.id = '${rollbackTextId}' THEN
        RAISE EXCEPTION 'forced canvas delete rollback';
      END IF;
      RETURN OLD;
    END;
    $$;
    CREATE TRIGGER naumi_force_canvas_delete_rollback_trigger
      BEFORE DELETE ON app_canvas_text_nodes
      FOR EACH ROW EXECUTE FUNCTION naumi_force_canvas_delete_rollback();
  `);
  const rollbackDeleteResponse = await api.post("/api/canvas/nodes/delete", {
    data: { artworkIds: [rollbackArtwork.id], textIds: [rollbackTextId] },
  });
  assert.equal(rollbackDeleteResponse.status(), 500, await rollbackDeleteResponse.text());
  const rollbackState = await nodePresence(rollbackArtwork.id, rollbackTextId);
  assert.equal(rollbackState.artwork, true);
  assert.equal(rollbackState.text, true);
  await pool.query(`
    DROP TRIGGER naumi_force_canvas_delete_rollback_trigger ON app_canvas_text_nodes;
    DROP FUNCTION naumi_force_canvas_delete_rollback();
  `);
  const cleanupRollbackResponse = await api.post("/api/canvas/nodes/delete", {
    data: { artworkIds: [rollbackArtwork.id], textIds: [rollbackTextId] },
  });
  assert.equal(cleanupRollbackResponse.status(), 200, await cleanupRollbackResponse.text());
  pass("mixed node deletion rolls back both tables when either half fails");

  const ratioRepairArtworkResponse = await api.post("/api/artworks/add", {
    multipart: {
      title: "静默比例修复节点",
      image: { name: "ratio-repair.png", mimeType: "image/png", buffer: png },
    },
  });
  assert.equal(ratioRepairArtworkResponse.status(), 200, await ratioRepairArtworkResponse.text());
  const ratioRepairArtwork = await ratioRepairArtworkResponse.json();
  await pool.query(
    `UPDATE app_artworks SET canvas_x = NULL, canvas_y = NULL WHERE id = $1`,
    [ratioRepairArtwork.id]
  );
  const ratioRepairResponse = await api.post("/api/artworks/canvas-size", {
    data: {
      id: ratioRepairArtwork.id,
      width: 360,
      height: 270,
      sizeOnly: true,
    },
  });
  assert.equal(ratioRepairResponse.status(), 200, await ratioRepairResponse.text());
  const ratioRepairRow = await pool.query(
    `SELECT canvas_x, canvas_y, canvas_width, canvas_height
       FROM app_artworks WHERE id = $1`,
    [ratioRepairArtwork.id]
  );
  assert.equal(ratioRepairRow.rows[0].canvas_x, null);
  assert.equal(ratioRepairRow.rows[0].canvas_y, null);
  assert.equal(Number(ratioRepairRow.rows[0].canvas_width), 360);
  assert.equal(Number(ratioRepairRow.rows[0].canvas_height), 270);
  const cleanupRatioRepairResponse = await api.post("/api/canvas/nodes/delete", {
    data: { artworkIds: [ratioRepairArtwork.id], textIds: [] },
  });
  assert.equal(cleanupRatioRepairResponse.status(), 200, await cleanupRatioRepairResponse.text());
  pass("silent ratio repair updates only canvas size and preserves automatic layout coordinates");

  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--disable-gpu"],
  });
  const context = await browser.newContext({
    storageState: await api.storageState(),
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addCookies([{ name: "naumi_locale", value: "zh", url: base }]);
  page = await context.newPage();
  const pageErrors = [];
  const artworkPositionRequests = [];
  const textNodeRequests = [];
  const artworkDeleteRequests = [];
  const textNodeDeleteRequests = [];
  const canvasDeleteRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (requestEvent) => {
    const method = requestEvent.method();
    if (method !== "POST" && method !== "DELETE") return;
    const pathname = new URL(requestEvent.url()).pathname;
    let body = {};
    try {
      body = requestEvent.postDataJSON();
    } catch {
      return;
    }
    if (method === "POST" && pathname === "/api/artworks/position") {
      artworkPositionRequests.push(body);
    }
    if (method === "POST" && pathname === "/api/canvas/text-nodes") {
      textNodeRequests.push(body);
    }
    if (method === "POST" && pathname === "/api/artworks/delete") {
      artworkDeleteRequests.push(body);
    }
    if (method === "DELETE" && pathname === "/api/canvas/text-nodes") {
      textNodeDeleteRequests.push(body);
    }
    if (method === "POST" && pathname === "/api/canvas/nodes/delete") {
      canvasDeleteRequests.push(body);
    }
  });
  await page.goto(`${base}/canvas?node=${encodeURIComponent(artwork.id)}`);

  const artworkNode = page.locator(
    `.react-flow__node[data-id="${artwork.id}"]`
  );
  const textNode = page.locator(`.react-flow__node[data-id="${textId}"]`);
  await expect(artworkNode).toBeVisible({ timeout: 30_000 });
  await expect(textNode).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("适应视图").click();
  await page.waitForTimeout(800);

  await textNode.getByTestId("text-node-title").click();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await artworkNode.click({ modifiers: ["Control"] });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);

  artworkPositionRequests.length = 0;
  textNodeRequests.length = 0;
  const before = await positions(artwork.id, textId);
  const textTitleBox = await textNode
    .getByTestId("text-node-title")
    .boundingBox();
  assert(textTitleBox, "text node title has no bounding box");
  await page.mouse.move(
    textTitleBox.x + textTitleBox.width * 0.35,
    textTitleBox.y + textTitleBox.height * 0.5
  );
  await page.mouse.down();
  await page.mouse.move(
    textTitleBox.x + textTitleBox.width * 0.35 + 150,
    textTitleBox.y + textTitleBox.height * 0.5 + 90,
    { steps: 16 }
  );
  await page.mouse.up();

  let moved;
  await expect
    .poll(async () => {
      moved = await positions(artwork.id, textId);
      return (
        !samePoint(moved.artwork, before.artwork) &&
        !samePoint(moved.text, before.text)
      );
    }, { timeout: 30_000 })
    .toBe(true);
  const artworkDelta = {
    x: moved.artwork.x - before.artwork.x,
    y: moved.artwork.y - before.artwork.y,
  };
  const textDelta = {
    x: moved.text.x - before.text.x,
    y: moved.text.y - before.text.y,
  };
  assert(Math.abs(artworkDelta.x - textDelta.x) < 0.01);
  assert(Math.abs(artworkDelta.y - textDelta.y) < 0.01);
  assert(
    artworkPositionRequests.every((body) => body.id !== textId),
    `text id leaked to artwork position API: ${JSON.stringify(artworkPositionRequests)}`
  );
  assert(textNodeRequests.some((body) => body.id === textId));
  pass("mixed multi-selection moves artwork and text by the same delta through separate APIs");

  await page.waitForTimeout(200);
  await page.keyboard.press("Control+Z");
  await expect
    .poll(async () => {
      const state = await positions(artwork.id, textId);
      return (
        samePoint(state.artwork, before.artwork) &&
        samePoint(state.text, before.text)
      );
    }, { timeout: 30_000 })
    .toBe(true);
  pass("move-many undo restores both artwork and text positions");

  await page.keyboard.press("Control+Shift+Z");
  await expect
    .poll(async () => {
      const state = await positions(artwork.id, textId);
      return (
        samePoint(state.artwork, moved.artwork) &&
        samePoint(state.text, moved.text)
      );
    }, { timeout: 30_000 })
    .toBe(true);
  assert(
    artworkPositionRequests.every((body) => body.id !== textId),
    `undo/redo sent text id to artwork API: ${JSON.stringify(artworkPositionRequests)}`
  );
  pass("move-many redo reapplies both positions without sending text-* to artworks/position");

  await page.reload();
  await expect(artworkNode).toBeVisible({ timeout: 30_000 });
  await expect(textNode).toBeVisible({ timeout: 30_000 });
  const [artworkFlowPosition, textFlowPosition] = await Promise.all([
    flowPosition(artworkNode),
    flowPosition(textNode),
  ]);
  assert(samePoint(artworkFlowPosition, moved.artwork));
  assert(samePoint(textFlowPosition, moved.text));
  assert.deepEqual(pageErrors, []);
  pass("refresh restores the redone artwork and text coordinates from persistence");

  artworkDeleteRequests.length = 0;
  textNodeDeleteRequests.length = 0;
  canvasDeleteRequests.length = 0;
  await textNode.getByTestId("text-node-title").click();
  await expect(textNode).toHaveClass(/selected/);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => {
      const state = await nodePresence(artwork.id, textId);
      return state.artwork && !state.text;
    }, { timeout: 30_000 })
    .toBe(true);
  assert.equal(
    artworkDeleteRequests.length,
    0,
    `text deletion leaked to artworks/delete: ${JSON.stringify(artworkDeleteRequests)}`
  );
  assert.deepEqual(canvasDeleteRequests.at(-1), {
    artworkIds: [],
    textIds: [textId],
  });
  assert.equal(textNodeDeleteRequests.length, 0);
  await expect(artworkNode).toBeVisible();
  await expect(page.locator(".react-flow")).toBeVisible();
  pass("single text Delete sends only textIds through the atomic endpoint and keeps the artwork canvas open");

  await page.keyboard.press("Control+Z");
  await expect
    .poll(async () => (await nodePresence(artwork.id, textId)).text, {
      timeout: 30_000,
    })
    .toBe(true);
  await expect(textNode).toBeVisible();
  pass("single text delete undo restores the text node");

  artworkDeleteRequests.length = 0;
  textNodeDeleteRequests.length = 0;
  canvasDeleteRequests.length = 0;
  await artworkNode.click();
  await expect(artworkNode).toHaveClass(/selected/);
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => {
      const state = await nodePresence(artwork.id, textId);
      return !state.artwork && state.text;
    }, { timeout: 30_000 })
    .toBe(true);
  assert.deepEqual(canvasDeleteRequests.at(-1), {
    artworkIds: [artwork.id],
    textIds: [],
  });
  assert.equal(artworkDeleteRequests.length, 0);
  assert.equal(
    textNodeDeleteRequests.length,
    0,
    `artwork deletion leaked to text-nodes DELETE: ${JSON.stringify(textNodeDeleteRequests)}`
  );
  await expect(textNode).toBeVisible();
  await expect(page.locator(".react-flow")).toBeVisible();
  pass("single artwork Delete sends only artworkIds through the atomic endpoint and keeps a text-only canvas open");

  await page.keyboard.press("Control+Z");
  await expect
    .poll(async () => (await nodePresence(artwork.id, textId)).artwork, {
      timeout: 30_000,
    })
    .toBe(true);
  await expect(artworkNode).toBeVisible();
  pass("single artwork delete undo restores the artwork node");

  artworkDeleteRequests.length = 0;
  textNodeDeleteRequests.length = 0;
  canvasDeleteRequests.length = 0;
  await textNode.getByTestId("text-node-title").click();
  await artworkNode.click({ modifiers: ["Control"] });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => {
      const state = await nodePresence(artwork.id, textId);
      return !state.artwork && !state.text;
    }, { timeout: 30_000 })
    .toBe(true);
  assert.deepEqual(canvasDeleteRequests.at(-1), {
    artworkIds: [artwork.id],
    textIds: [textId],
  });
  assert.equal(artworkDeleteRequests.length, 0);
  assert.equal(textNodeDeleteRequests.length, 0);
  await expect(page.locator(".react-flow")).toHaveCount(0);
  pass("mixed Delete splits IDs in one atomic request and exits only after both real node types are empty");

  await page.keyboard.press("Control+Z");
  await expect
    .poll(async () => {
      const state = await nodePresence(artwork.id, textId);
      return state.artwork && state.text;
    }, { timeout: 30_000 })
    .toBe(true);
  pass("one undo restores both halves of a mixed delete");

  await page.keyboard.press("Control+Shift+Z");
  await expect
    .poll(async () => {
      const state = await nodePresence(artwork.id, textId);
      return !state.artwork && !state.text;
    }, { timeout: 30_000 })
    .toBe(true);
  pass("one redo deletes both halves of a mixed delete again");

  await page.keyboard.press("Control+Z");
  await expect
    .poll(async () => {
      const state = await nodePresence(artwork.id, textId);
      return state.artwork && state.text;
    }, { timeout: 30_000 })
    .toBe(true);

  const videoUrl =
    "data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJtcDQxaXNvbQ==";
  const audioUrl =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  const videoResponse = await api.post("/api/artworks/add", {
    data: {
      parentId: artwork.id,
      x: 500,
      y: 430,
      src: {
        image: "",
        videoUrl,
        title: "视频复制节点",
        category: "video",
        prompt: "保留视频媒体字段",
        width: 320,
        height: 180,
        canvasWidth: 320,
        canvasHeight: 180,
      },
    },
  });
  assert.equal(videoResponse.status(), 200, await videoResponse.text());
  const videoArtwork = await videoResponse.json();
  assert.equal(videoArtwork.image, "");
  assert.equal(videoArtwork.videoUrl, videoUrl);

  const audioResponse = await api.post("/api/artworks/add", {
    data: {
      parentId: artwork.id,
      x: 860,
      y: 430,
      src: {
        image: "",
        videoUrl: audioUrl,
        title: "音频复制节点",
        category: "audio",
        prompt: "保留音频媒体字段",
        width: 360,
        height: 120,
        canvasWidth: 360,
        canvasHeight: 120,
      },
    },
  });
  assert.equal(audioResponse.status(), 200, await audioResponse.text());
  const audioArtwork = await audioResponse.json();
  assert.equal(audioArtwork.image, "");
  assert.equal(audioArtwork.videoUrl, audioUrl);
  pass("artworks/add accepts video and image-less audio JSON nodes");

  await page.goto(`${base}/canvas?node=${encodeURIComponent(artwork.id)}`);
  const videoNode = page.locator(
    `.react-flow__node[data-id="${videoArtwork.id}"]`
  );
  const audioNode = page.locator(
    `.react-flow__node[data-id="${audioArtwork.id}"]`
  );
  await expect(videoNode).toBeVisible({ timeout: 30_000 });
  await expect(audioNode).toBeVisible({ timeout: 30_000 });
  await expect(videoNode.locator("video")).toHaveCount(1);
  await expect(videoNode.locator("img")).toHaveCount(0);
  await expect(audioNode.locator("audio")).toHaveCount(1);
  await expect(audioNode.locator("img")).toHaveCount(0);
  pass("video and audio sources render native media elements instead of img tags");

  await page.locator(".react-flow__pane").click({ position: { x: 1200, y: 120 } });
  await expect(page.getByTestId("image-node-dock")).toHaveCount(0);
  await videoNode.getByText("视频复制节点", { exact: true }).click();
  await expect(videoNode).toHaveClass(/selected/);
  await videoNode.locator("video").focus();
  assert.equal(
    await page.evaluate(() => document.activeElement?.tagName),
    "VIDEO"
  );
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");
  let videoCopy;
  await expect
    .poll(async () => {
      const state = await nodePresence(artwork.id, textId);
      videoCopy = state.artworks.find(
        (item) => item.id !== videoArtwork.id && item.title === "视频复制节点 副本"
      );
      return Boolean(videoCopy);
    }, { timeout: 30_000 })
    .toBe(true);
  assert.equal(videoCopy.category, "video");
  assert.equal(videoCopy.videoUrl, videoUrl);
  assert.equal(videoCopy.image, "");
  const videoCopyNode = page.locator(
    `.react-flow__node[data-id="${videoCopy.id}"]`
  );
  await expect(videoCopyNode).toBeVisible({ timeout: 30_000 });
  await expect(videoCopyNode.locator("video")).toHaveCount(1);
  await expect(videoCopyNode.locator("img")).toHaveCount(0);
  pass("Ctrl+C/V duplicates video with category/videoUrl and no fake image source");

  await page.locator(".react-flow__pane").click({ position: { x: 1200, y: 120 } });
  await expect(page.getByTestId("image-node-dock")).toHaveCount(0);
  await audioNode.evaluate((element) =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  );
  await expect(audioNode).toHaveClass(/selected/);
  await audioNode.focus();
  await page.keyboard.press("Control+C");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()), {
      timeout: 10_000,
    })
    .toBe("音频复制节点");
  await page.keyboard.press("Control+V");
  let audioCopy;
  await expect
    .poll(async () => {
      const state = await nodePresence(artwork.id, textId);
      audioCopy = state.artworks.find(
        (item) => item.id !== audioArtwork.id && item.title === "音频复制节点 副本"
      );
      return Boolean(audioCopy);
    }, { timeout: 30_000 })
    .toBe(true);
  assert.equal(audioCopy.category, "audio");
  assert.equal(audioCopy.videoUrl, audioUrl);
  assert.equal(audioCopy.image, "");
  const audioCopyNode = page.locator(
    `.react-flow__node[data-id="${audioCopy.id}"]`
  );
  await expect(audioCopyNode).toBeVisible({ timeout: 30_000 });
  await expect(audioCopyNode.locator("audio")).toHaveCount(1);
  await expect(audioCopyNode.locator("img")).toHaveCount(0);
  assert.deepEqual(pageErrors, []);
  pass("Ctrl+C/V duplicates image-less audio with category/videoUrl and native audio rendering");

  await page.locator(".react-flow__pane").click({ position: { x: 1200, y: 120 } });
  await expect(page.getByTestId("image-node-dock")).toHaveCount(0);
  await artworkNode.evaluate((element) =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  );
  await expect(artworkNode).toHaveClass(/selected/);
  await artworkNode.focus();
  await page.keyboard.press("Control+C");
  const beforeImagePaste = await nodePresence(artwork.id, textId);
  const beforeIds = new Set(beforeImagePaste.artworks.map((item) => item.id));
  const rootCopyCount = beforeImagePaste.artworks.filter(
    (item) => item.title === "多选图片节点 副本"
  ).length;
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([bytes], { type: "image/png" }),
      }),
    ]);
  }, png.toString("base64"));
  await page.keyboard.press("Control+V");
  let pastedImage;
  await expect
    .poll(async () => {
      const state = await nodePresence(artwork.id, textId);
      pastedImage = state.artworks.find((item) => !beforeIds.has(item.id));
      return Boolean(pastedImage);
    }, { timeout: 30_000 })
    .toBe(true);
  assert(pastedImage.image, "system image paste did not create an image artwork");
  assert.equal(pastedImage.videoUrl ?? null, null);
  const afterImagePaste = await nodePresence(artwork.id, textId);
  assert.equal(
    afterImagePaste.artworks.filter((item) => item.title === "多选图片节点 副本").length,
    rootCopyCount,
    "system image paste was hijacked by the internal node clipboard"
  );
  pass("system image paste remains higher priority than a recent normal image-node copy");

  console.log(
    `CANVAS_TEXT_MULTISELECT_RESULT=PASS artwork=${artwork.id} text=${textId} checks=${report.length}`
  );
} catch (error) {
  report.push(`FAIL ${error.stack || error}`);
  await page
    ?.screenshot({ path: path.join(output, "FAILURE.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "test.log"), `${report.join("\n")}\n`);
  await writeFile(path.join(output, "next.log"), appLog.join(""));
  await browser?.close();
  await api?.dispose();
  await pool?.end();
  if (app?.pid) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], {
          stdio: "pipe",
        });
      } catch {
        // already stopped
      }
    } else {
      app.kill("SIGTERM");
    }
  }
  try {
    execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
  } catch {
    // already stopped
  }
  await rm(path.resolve(distDir), { recursive: true, force: true });
  await writeFile(tsconfigPath, originalTsconfig);
}
