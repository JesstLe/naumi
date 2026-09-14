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

const baseUrl = (process.env.PACKAGING3D_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
await mkdir("output", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const user = {
  name: "UI Smoke",
  email: "packaging3d-smoke@naumi.local",
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

let capturedBody = "";
const productMock = `data:image/svg+xml;base64,${Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
    <rect width="900" height="900" fill="#f7f7f5"/>
    <ellipse cx="460" cy="735" rx="260" ry="56" fill="#d6d2ca" opacity=".55"/>
    <path d="M220 300 500 210l210 120-280 98Z" fill="#fff8e8" stroke="#b7791f" stroke-width="5"/>
    <path d="M220 300 430 428v330L220 620Z" fill="#efe1c5" stroke="#b7791f" stroke-width="5"/>
    <path d="M430 428 710 330v300L430 758Z" fill="#fff4db" stroke="#b7791f" stroke-width="5"/>
    <path d="M500 210v110l210 10" fill="none" stroke="#cf9a47" stroke-width="3" opacity=".65"/>
    <text x="285" y="500" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="#252525" transform="rotate(31 285 500)">NAUMI</text>
    <text x="490" y="520" font-family="Arial, sans-serif" font-size="28" fill="#8a5a18" transform="skewY(-19)">PRODUCT</text>
  </svg>
`).toString("base64")}`;
await page.route("**/api/packaging3d**", async (route) => {
  const request = route.request();
  if (request.method() === "POST") {
    capturedBody = request.postData() || "";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "packaging3d-smoke-job", cost: 9 }),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "done",
      id: "packaging3d-smoke-result",
      url: productMock,
      creditsUsed: 0,
    }),
  });
});

const dielineSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
    <rect width="900" height="560" fill="white"/>
    <g fill="#f4efe3" stroke="#d33" stroke-width="3">
      <rect x="230" y="150" width="180" height="260"/>
      <rect x="410" y="150" width="120" height="260"/>
      <rect x="530" y="150" width="180" height="260"/>
      <rect x="110" y="150" width="120" height="260"/>
      <rect x="230" y="70" width="180" height="80"/>
      <rect x="230" y="410" width="180" height="80"/>
    </g>
    <g stroke="#2684ff" stroke-width="2" stroke-dasharray="10 8">
      <path d="M230 150v260M410 150v260M530 150v260"/>
    </g>
    <text x="270" y="285" font-family="Arial" font-size="38" fill="#222">NAUMI</text>
  </svg>
`);

await page.goto(`${baseUrl}/packaging3d`, { waitUntil: "networkidle" });
const fileInput = page.locator('input[accept="image/png,image/jpeg,image/webp,image/svg+xml"]');
if ((await fileInput.count()) !== 1) {
  throw new Error(`Expected one packaging dieline input, found ${await fileInput.count()}`);
}
await fileInput.setInputFiles({
  name: "carton-dieline.svg",
  mimeType: "image/svg+xml",
  buffer: dielineSvg,
});
await page.getByText("carton-dieline.svg", { exact: true }).waitFor();
await page.getByRole("button", { name: "折叠纸盒" }).click();
await page.getByRole("button", { name: "亮膜" }).click();
await page.getByRole("button", { name: "纯白" }).click();
await page.getByPlaceholder(/例如：盒体厚一些/).fill("正面文字完整，展示右侧面");
await page.getByRole("button", { name: /生成 3D 产品图/ }).click();
await page.getByText("3D 成品").waitFor();
await page.getByRole("button", { name: "下载" }).waitFor();
if (!capturedBody.includes("carton") || !capturedBody.includes("glossy")) {
  throw new Error("Selected packaging controls were not sent to the API");
}
await page.screenshot({ path: "output/packaging3d-ui.png", fullPage: true });
await browser.close();
process.stdout.write("Packaging 3D UI smoke passed; screenshot: output/packaging3d-ui.png\n");
