// Real-browser regression for video controls embedded in the production React Flow canvas.
// Run against an already started local app:
//   $env:CANVAS_MEDIA_BASE_URL='http://127.0.0.1:3199'; node scripts/canvas-media-controls-browser-smoke.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const output = path.resolve("output/canvas-media-controls-browser-smoke");
const distDir = `output/canvas-media-controls-browser-smoke/.next-${process.pid}`;
const tsconfigPath = path.resolve("tsconfig.json");
const originalTsconfig = await readFile(tsconfigPath);
const appLog = [];
let app;
let baseURL = process.env.CANVAS_MEDIA_BASE_URL || "";
const nodeId = "video-controls-browser-fixture";
const projectKey = `tree:${nodeId}`;
const profiles = [
  {
    name: "windows",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  },
  {
    name: "mac",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  },
];

const round = (value) => Math.round(value * 100) / 100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const stableState = async (page) =>
  page.evaluate((fixtureId) => {
    const node = document.querySelector(`.react-flow__node[data-id="${fixtureId}"]`);
    const viewport = document.querySelector(".react-flow__viewport");
    if (!(node instanceof HTMLElement) || !(viewport instanceof HTMLElement)) return null;
    const box = node.getBoundingClientRect();
    return {
      nodeTransform: node.style.transform,
      viewportTransform: viewport.style.transform,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  }, nodeId);

async function waitForCanvasSettled(page) {
  let previous = null;
  let stableSamples = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await stableState(page);
    const signature = current
      ? `${current.nodeTransform}|${current.viewportTransform}|${current.box.x}|${current.box.y}`
      : "missing";
    stableSamples = signature === previous ? stableSamples + 1 : 0;
    if (stableSamples >= 2) return current;
    previous = signature;
    await page.waitForTimeout(100);
  }
  throw new Error("React Flow viewport did not settle before media interaction checks");
}

function assertStable(before, after, label) {
  assert(before && after, `${label}: missing canvas state`);
  assert.equal(after.nodeTransform, before.nodeTransform, `${label}: node transform changed`);
  assert.equal(after.viewportTransform, before.viewportTransform, `${label}: viewport transform changed`);
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(after.box[key] - before.box[key]) < 1,
      `${label}: node ${key} changed ${before.box[key]} -> ${after.box[key]}`
    );
  }
}

await mkdir(output, { recursive: true });
if (!baseURL) {
  const port = await freePort();
  baseURL = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: {
      ...process.env,
      DATABASE_URL: "",
      AUTH_MODE: "mock",
      NAUMI_MULTI_USER: "0",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      MEDIA_DIR: path.join(output, "media"),
      NEXT_DIST_DIR: distDir,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => appLog.push(chunk.toString()));
  app.stderr.on("data", (chunk) => appLog.push(chunk.toString()));
}

let ready = false;
for (let attempt = 0; attempt < 120; attempt += 1) {
  try {
    if ((await fetch(`${baseURL}/api/health`)).ok) {
      ready = true;
      break;
    }
  } catch {}
  await sleep(500);
}
assert(ready, `local app is not ready at ${baseURL}`);
const health = await fetch(`${baseURL}/api/health`).catch(() => null);
assert(health?.ok, `local app is not ready at ${baseURL}`);

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--disable-gpu"],
});

try {
  for (const profile of profiles) {
    const now = new Date().toISOString();
    const email = `media-controls-${profile.name}@local.test`;
    const user = {
      name: `Media Controls ${profile.name}`,
      email,
      plan: "starter",
      creditsTotal: 20,
      creditsUsed: 0,
      joinedAt: now,
      renewsAt: now,
      invoices: [],
    };
    const artwork = {
      id: nodeId,
      title: "视频交互回归",
      category: "video",
      prompt: "验证视频播放器不会拖动画布节点",
      createdAt: now,
      status: "completed",
      image: "",
      videoUrl: "/fixture-video.mp4",
      gradient: "from-slate-100 to-slate-200",
      source: "canvas-add",
      origin: "canvas",
      parentId: null,
      parentIds: [],
      groupId: nodeId,
      canvasX: 520,
      canvasY: 280,
      width: 640,
      height: 360,
      canvasWidth: 420,
      canvasHeight: 236,
    };

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: profile.userAgent,
    });
    await context.addInitScript(
      ({ fixtureEmail, fixtureProjectKey, fixtureUser }) => {
        localStorage.setItem(`naumi:user:${fixtureEmail}`, JSON.stringify(fixtureUser));
        localStorage.setItem("naumi:last-email", fixtureEmail);
        localStorage.setItem("nv:canvas:last", fixtureProjectKey);
      },
      { fixtureEmail: email, fixtureProjectKey: projectKey, fixtureUser: user }
    );
    await context.addCookies([{ name: "naumi_locale", value: "zh", url: baseURL }]);
    const page = await context.newPage();
    const pageErrors = [];
    const requestFailures = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) =>
      requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`)
    );

    await page.route("**/api/account**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { persisted: true, user, artworks: [artwork] } });
        return;
      }
      await route.fulfill({ json: { persisted: true, user } });
    });
    await page.route("**/api/projects**", (route) =>
      route.fulfill({ json: { persisted: false, names: {} } })
    );
    await page.route("**/api/canvas/text-nodes**", (route) =>
      route.fulfill({ json: { persisted: false, nodes: [] } })
    );
    await page.route("**/api/video/tasks**", (route) =>
      route.fulfill({ json: { tasks: [] } })
    );
    await page.route("**/fixture-video.mp4", (route) =>
      route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.alloc(0) })
    );

    await page.goto(`${baseURL}/canvas`);
    const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
    try {
      await expect(node).toBeVisible({ timeout: 30_000 });
    } catch (error) {
      const diagnostics = await page.evaluate((fixtureEmail) => ({
        body: document.body.innerText.slice(0, 1200),
        lastEmail: localStorage.getItem("naumi:last-email"),
        user: localStorage.getItem(`naumi:user:${fixtureEmail}`),
      }), email);
      console.error(JSON.stringify({ profile: profile.name, diagnostics, pageErrors, requestFailures }, null, 2));
      throw error;
    }
    await node.click({ position: { x: 24, y: 16 } });

    const video = node.locator("video");
    await expect(video).toBeVisible();
    await video.evaluate((element) => {
      let paused = true;
      let currentTime = 0;
      Object.defineProperty(element, "duration", {
        configurable: true,
        get: () => 12,
      });
      Object.defineProperty(element, "paused", {
        configurable: true,
        get: () => paused,
      });
      Object.defineProperty(element, "currentTime", {
        configurable: true,
        get: () => currentTime,
        set: (value) => {
          currentTime = Number(value);
          element.dispatchEvent(new Event("timeupdate"));
        },
      });
      element.play = async () => {
        paused = false;
        element.dispatchEvent(new Event("play"));
      };
      element.pause = () => {
        paused = true;
        element.dispatchEvent(new Event("pause"));
      };
      element.dispatchEvent(new Event("loadedmetadata"));
    });

    const timeline = page.getByTestId("canvas-video-timeline");
    const range = timeline.getByRole("slider", { name: "视频时间轴" });
    await expect(timeline).toBeVisible();
    await expect(range).toBeVisible();
    await waitForCanvasSettled(page);

    const videoBox = await video.boundingBox();
    assert(videoBox, `${profile.name}: video bounding box missing`);
    let before = await stableState(page);
    await page.mouse.move(videoBox.x + videoBox.width * 0.55, videoBox.y + videoBox.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(videoBox.x + videoBox.width * 0.72, videoBox.y + videoBox.height * 0.58, {
      steps: 8,
    });
    await page.mouse.up();
    await page.waitForTimeout(120);
    let after = await stableState(page);
    assertStable(before, after, `${profile.name} video pointer drag`);

    before = after;
    await page.mouse.move(videoBox.x + videoBox.width / 2, videoBox.y + videoBox.height / 2);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(120);
    after = await stableState(page);
    assertStable(before, after, `${profile.name} video wheel`);

    await video.focus();
    await expect(video).toBeFocused();
    before = after;
    await page.keyboard.down("Space");
    await page.mouse.move(videoBox.x + videoBox.width * 0.48, videoBox.y + videoBox.height * 0.52);
    await page.mouse.down();
    await page.mouse.move(videoBox.x + videoBox.width * 0.62, videoBox.y + videoBox.height * 0.64, {
      steps: 8,
    });
    await page.mouse.up();
    await page.keyboard.up("Space");
    await expect(page.getByTestId("canvas-media-playback")).toHaveAttribute("aria-label", "暂停");
    after = await stableState(page);
    assertStable(before, after, `${profile.name} focused Space playback`);

    const rangeBox = await range.boundingBox();
    assert(rangeBox, `${profile.name}: timeline bounding box missing`);
    const beforeValue = Number(await range.inputValue());
    before = after;
    await page.mouse.move(rangeBox.x + 2, rangeBox.y + rangeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rangeBox.x + rangeBox.width - 2, rangeBox.y + rangeBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const afterValue = Number(await range.inputValue());
    assert(afterValue > beforeValue, `${profile.name}: timeline value did not advance`);
    after = await stableState(page);
    assertStable(before, after, `${profile.name} timeline drag`);

    await page.screenshot({
      path: path.join(output, `${profile.name}-media-controls.png`),
      fullPage: true,
    });
    assert.deepEqual(pageErrors, [], `${profile.name}: ${JSON.stringify(pageErrors)}`);
    console.log(
      `PASS ${profile.name} media controls node=${round(after.box.x)},${round(after.box.y)} viewport=${after.viewportTransform} timeline=${round(afterValue)}`
    );
    await context.close();
  }

  console.log(`PASS canvas media browser regression profiles=${profiles.length}`);
} finally {
  await browser.close();
  await writeFile(path.join(output, "next.log"), appLog.join(""));
  if (app?.pid) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "pipe" });
      } catch {}
    } else {
      app.kill("SIGTERM");
    }
  }
  if (app) await rm(path.resolve(distDir), { recursive: true, force: true });
  await writeFile(tsconfigPath, originalTsconfig);
}
