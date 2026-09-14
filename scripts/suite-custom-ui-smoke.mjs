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
    // Try the next Chrome location.
  }
}
if (!executablePath) throw new Error("Chrome executable not found; set CHROME_PATH");

const baseUrl = (process.env.SUITE_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
await mkdir("output", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const user = {
  name: "Suite Custom Smoke",
  email: "suite-custom-smoke@naumi.local",
  plan: "starter",
  creditsTotal: 200,
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
await page.route("**/api/account**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user, artworks: [] }),
  })
);

let capturedBody = "";
await page.route("**/api/suite**", async (route) => {
  const request = route.request();
  if (request.method() === "POST") {
    capturedBody = request.postDataBuffer()?.toString("utf8") || "";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "suite-custom-smoke-job", total: 5, cost: 30 }),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "done",
      done: 5,
      total: 5,
      creditsUsed: 30,
      shots: [
        { id: "custom-1", role: "main", label: "横版品牌主图", ratio: "16:9", status: "done", url: "/demos/suite-demo/thermos-main.png", gradient: "from-slate-100 to-white" },
        { id: "custom-2", role: "sub", label: "核心卖点", ratio: "1:1", status: "done", url: "/demos/suite-demo/thermos-selling.png", gradient: "from-slate-100 to-white" },
        { id: "custom-3", role: "sub", label: "细节特写", ratio: "1:1", status: "done", url: "/demos/suite-demo/thermos-detail.png", gradient: "from-slate-100 to-white" },
        { id: "custom-4", role: "detail", label: "使用场景", ratio: "3:4", status: "done", url: "/demos/suite-demo/thermos-spec.png", gradient: "from-slate-100 to-white" },
        { id: "custom-5", role: "detail", label: "包装清单", ratio: "9:16", status: "done", url: "/demos/suite-demo/thermos-detail.png", gradient: "from-slate-100 to-white" },
      ],
      user,
    }),
  });
});

await page.goto(`${baseUrl}/suite`, { waitUntil: "networkidle" });
await page.locator('input[type="file"]').setInputFiles("public/demos/suite-demo/thermos-src.png");
await page.getByRole("button", { name: "自定义配置" }).click();
await page.getByTestId("custom-shot-1").waitFor();
await page.getByLabel("第 1 张画幅").selectOption("16:9");
await page.getByLabel("第 1 张标题").fill("横版品牌主图");
await page.getByLabel("第 1 张要求").fill("产品完整居中，左侧保留品牌文案空间");
await page.getByRole("button", { name: "新增详情图" }).click();
await page.getByLabel("删除").last().click();
await page.getByRole("button", { name: /生成商品套图/ }).click();
await page.getByText("横版品牌主图", { exact: true }).waitFor();

for (const expected of ["custom", "横版品牌主图", "16:9", "产品完整居中"]) {
  if (!capturedBody.includes(expected)) {
    throw new Error(`Custom suite payload is missing: ${expected}`);
  }
}
if (!capturedBody.includes('name="shots"')) {
  throw new Error("Custom shot JSON was not sent to the API");
}
await page.screenshot({ path: "output/suite-custom-ui.png", fullPage: true });
await browser.close();
process.stdout.write("Suite custom UI smoke passed; screenshot: output/suite-custom-ui.png\n");
