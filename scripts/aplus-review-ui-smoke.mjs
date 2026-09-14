import { access, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].filter(Boolean);
let executablePath = "";
for (const candidate of candidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Try the next installed Chrome location.
  }
}
if (!executablePath) throw new Error("Chrome executable not found; set CHROME_PATH");

const baseUrl = (process.env.APLUS_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
await mkdir("output", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const user = {
  name: "UI Smoke",
  email: "ui-smoke@naumi.local",
  plan: "starter",
  creditsTotal: 100,
  creditsUsed: 0,
  joinedAt: new Date().toISOString(),
  renewsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  invoices: [],
};
await page.addInitScript((seed) => {
  localStorage.setItem("naumi:last-email", seed.email);
  localStorage.setItem(`naumi:user:${seed.email}`, JSON.stringify(seed));
}, user);

await page.route("**/api/config", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ db: false }) })
);

let stage = "reviewing";
let status = "awaiting_review";
let approved = [false, false];
let redoFeedback = "";
const sources = [0, 1].map((index) => ({
  id: `source-${index}`,
  label: `白底母图 ${index + 1}`,
  status: "review",
  version: 1,
  url: "/demos/aplus/showcase-single-column.png",
  history: [
    {
      version: 1,
      feedback: "首次提取",
      url: "/demos/aplus/showcase-single-column.png",
      createdAt: Date.now(),
    },
  ],
}));

await page.route("**/api/aplus**", async (route) => {
  const request = route.request();
  if (request.method() === "GET") {
    const shots = status === "done"
      ? [{
          id: "shot-1",
          role: "hero",
          label: "首屏主视觉",
          ratio: "1:1",
          status: "done",
          url: "/demos/aplus/showcase-two-column.png",
          gradient: "from-slate-100 to-white",
        }]
      : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        jobId: "ui-smoke-job",
        stage,
        status,
        sources: sources.map((source, index) => ({
          ...source,
          status: approved[index] ? "approved" : source.status,
        })),
        shots,
        done: shots.length,
        total: 1,
      }),
    });
  }
  const contentType = request.headers()["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "ui-smoke-job", total: 1, cost: 6 }),
    });
  }
  const body = request.postDataJSON();
  if (body.action === "approve_source") {
    approved[body.sourceIndex] = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        source: { ...sources[body.sourceIndex], status: "approved" },
      }),
    });
  }
  if (body.action === "redo_source") {
    const sourceIndex = body.sourceIndex;
    redoFeedback = body.feedback;
    const source = sources[sourceIndex];
    const version = source.version + 1;
    sources[sourceIndex] = {
      ...source,
      version,
      feedback: body.feedback,
      history: [
        ...source.history,
        {
          version,
          feedback: body.feedback,
          url: source.url,
          createdAt: Date.now(),
        },
      ],
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        source: { ...sources[sourceIndex], status: "redoing" },
      }),
    });
  }
  if (body.action === "generate") {
    stage = "generating";
    status = "done";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, jobId: "ui-smoke-job", total: 1, cost: 6 }),
    });
  }
  return route.fulfill({ status: 400, contentType: "application/json", body: "{}" });
});

await page.goto(`${baseUrl}/aplus`, { waitUntil: "networkidle" });
await page.locator('input[type="file"]').setInputFiles("public/demos/aplus/showcase-two-column.png");
await page.getByRole("button", { name: "提取主体并进入审核" }).click();
try {
  await page.getByText("审核白底母图").waitFor();
} catch (error) {
  await page.screenshot({ path: "output/aplus-review-ui-failed.png", fullPage: true });
  process.stderr.write(`${(await page.locator("body").innerText()).slice(0, 5000)}\n`);
  throw error;
}
await page.getByText("逐张放大核对主体").waitFor();
const confirmButton = page.getByRole("button", { name: "请先审核全部白底母图" });
if (!(await confirmButton.isDisabled())) throw new Error("Confirm button must stay disabled before review");
const firstCard = page.locator("section").filter({ hasText: "白底母图 1" });
await firstCard.locator("textarea").fill("保留瓶盖文字，主体完整露出，四周增加留白");
await firstCard.getByRole("button", { name: "打回重做" }).click();
await firstCard.getByText("点击放大 · v2").waitFor();
if (!redoFeedback.includes("保留瓶盖文字")) throw new Error("Redo feedback was not sent to the API");
await page.screenshot({ path: "output/aplus-review-ui.png", fullPage: true });

for (let index = 0; index < sources.length; index++) {
  await page
    .locator("section")
    .filter({ hasText: `白底母图 ${index + 1}` })
    .getByRole("button", { name: "通过", exact: true })
    .click();
}
await page.getByRole("button", { name: /确认并生成详情页/ }).click();
await page.getByText("打包下载").waitFor();

await browser.close();
process.stdout.write("A+ review UI smoke passed; screenshot: output/aplus-review-ui.png\n");
