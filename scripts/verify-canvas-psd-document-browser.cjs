const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 90000 });
const origin = new URL(process.env.PSD_E2E_ORIGIN);
const project = process.env.PSD_E2E_PROJECT;
const node = process.env.PSD_E2E_NODE;
const folder = path.resolve("output/psd-document-e2e");

async function verify(page) {
  const attempts = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/canvas/layered-psd")
      attempts.push(req.url());
  });
  page.on("pageerror", (e) => console.error("Browser error:", e.message));
  page.on("response", (r) => {
    if (r.url().includes("/layered-psd"))
      console.log("PSD route", r.request().method(), r.status(), new URL(r.url()).pathname);
  });
  const flowNode = (id) => page.locator('.react-flow__node[data-id="' + id + '"]');
  const button = (root, name) => root.getByRole("button", { name, exact: true });
  const root = flowNode(project.slice(5)),
    child = flowNode(node);
  await page.goto(origin + "/canvas?project=" + encodeURIComponent(project) + "&layered-psd=pilot", {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  assert.equal(new URL(page.url()).pathname, "/canvas", "fixture must open the actual canvas");
  await expect(root).toBeVisible();
  await root.click({ button: "right" });
  await page.getByText("智能拆层", { exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("已添加分层子节点，双击可编辑")).toBeVisible();
  await button(modal, "关闭").click();
  await expect(child).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await child.dblclick();
  const surface = modal.locator("canvas"),
    list = modal.getByRole("list");
  await expect(list.getByRole("listitem")).toHaveCount(11);
  await expect(surface).toBeVisible();
  const names = await list.getByRole("button").allTextContents();
  async function downloadLayer(index, format, filename) {
    const pending = page.waitForEvent("download");
    await button(modal.getByRole("group", { name: /导出选中图层/ }), format.toUpperCase()).click();
    const file = await pending;
    assert.equal(file.suggestedFilename(), index + 1 + "-" + names[10 - index] + "." + format);
    await file.saveAs(path.join(folder, filename));
  }
  const capture = () => surface.evaluate((el) => el.toDataURL("image/png"));
  const png = async () =>
    require("node:crypto")
      .createHash("sha256")
      .update(await capture())
      .digest("hex");
  const initial = await png();
  const bounds = await surface.boundingBox();
  const pos = (x, y) => [bounds.x + (x * bounds.width) / 784, bounds.y + (y * bounds.height) / 1440];
  async function draw(start, end) {
    await page.mouse.move(...pos(...start));
    await page.mouse.down();
    await page.mouse.move(...pos(...end), { steps: 4 });
    await page.mouse.up();
  }
  await draw([397, 874], [438, 899]);
  assert.notEqual(await png(), initial, "moving the bottle changes the visible poster");
  await expect(button(list, names[0])).toHaveAttribute("aria-pressed", "true");
  await button(modal, "下移一层").click();
  await button(modal, "下移一层").click();
  await expect(list.getByRole("button").nth(2)).toHaveText(names[0]);
  await button(modal, "蒙版擦除").click();
  const beforeMask = await png();
  await draw([415, 848], [471, 882]);
  const erased = await png();
  assert.notEqual(erased, beforeMask, "erasing must affect visible pixels");
  await button(modal, "撤销").click();
  assert.equal(await png(), beforeMask, "undo");
  await button(modal, "重做").click();
  assert.equal(await png(), erased, "redo");
  await button(modal, "蒙版恢复").click();
  await draw([415, 848], [425, 854]);
  const restored = await png();
  assert.notEqual(restored, erased, "restore");
  assert.notEqual(restored, beforeMask, "remaining mask");
  await list.getByRole("checkbox", { name: "显示 " + names[1], exact: true }).uncheck();
  const edited = await png();
  await fs.writeFile(
    path.join(folder, "edited-canvas.png"),
    Buffer.from((await capture()).split(",")[1], "base64"),
  );
  const saved = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes("/layered-psd/document"),
  );
  await downloadLayer(10, "png", "dirty-bottle.png");
  const response = await saved;
  assert.equal(response.status(), 200, await response.text());
  const receipt = await response.json();
  assert.equal(receipt.revision, 1);
  await expect(modal.getByText("已保存", { exact: true })).toBeVisible();
  await button(modal, "关闭").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(child).toBeVisible();
  const image = child.locator("img").first();
  await expect.poll(() => image.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
  const thumb = await image.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    canvas.getContext("2d").drawImage(el, 0, 0);
    return canvas.toDataURL("image/png");
  });
  await fs.writeFile(path.join(folder, "displayed-child.png"), Buffer.from(thumb.split(",")[1], "base64"));
  await child.dblclick();
  await expect(list.getByRole("listitem")).toHaveCount(11);
  await expect(list.getByRole("button").nth(2)).toHaveText(names[0]);
  assert.equal(await png(), edited, "saved poster survives reload");
  await modal.screenshot({ path: path.join(folder, "reopened-editor.png") });
  const download = page.waitForEvent("download");
  await button(modal, "导出 PSD").click();
  await (await download).saveAs(path.join(folder, "browser-export.psd"));
  for (const [position, name] of names.entries()) {
    const index = 10 - position;
    await button(list, name).click();
    for (const format of ["png", "psd"]) await downloadLayer(index, format, "layer-" + index + "." + format);
  }
  await expect(list.getByRole("checkbox", { name: "显示 " + names[1], exact: true })).not.toBeChecked();
  const endpoint = origin.origin + "/api/canvas/layered-psd/document";
  const headers = { origin: origin.origin, "x-naumi-workspace": "personal", "x-naumi-project-context": project };
  const current = await page.request.get(endpoint + "?nodeId=" + node, { headers });
  assert.equal(current.status(), 200);
  const { edits, revision } = await current.json();
  const exportUrl = endpoint + "?nodeId=" + node + "&export=1";
  for (const [query, status] of [
    ["&revision=1&format=png", 400],
    ["&revision=1&layer=99&format=psd", 400],
    ["&revision=0&layer=10&format=png", 409],
  ]) {
    assert.equal((await page.request.get(exportUrl + query, { headers })).status(), status);
  }
  assert.equal((await fetch(exportUrl + "&revision=1&layer=1&format=png", { headers })).status, 401);
  assert.equal(revision, 1);
  const replay = await page.request.patch(endpoint, { headers, data: { nodeId: node, revision: 0, edits } });
  assert.equal(replay.status(), 200);
  assert.equal((await replay.json()).revision, 1);
  const wrong = edits.map((l, i) => (i === 1 ? { ...l, visible: !l.visible } : l));
  const stale = await page.request.patch(endpoint, { headers, data: { nodeId: node, revision: 0, edits: wrong } });
  assert.equal(stale.status(), 409);
  const duplicate = await page.request.post(endpoint, {
    headers,
    data: { sourceId: project.slice(5), operationId: node.slice(4) },
  });
  assert.equal(duplicate.status(), 200);
  assert.equal((await duplicate.json()).nodeId, node);
  const anonymous = await fetch(endpoint + "?nodeId=" + node, { headers });
  assert.equal(anonymous.status, 401);
  assert.deepEqual(attempts, [], "the historical receipt must not be submitted again");
  console.log(
    "PSD_EDITOR_BROWSER_PASS child, ordering, dragging, mask erase/restore, history, save, reload, download",
  );
}
async function main() {
  assert.equal(origin.hostname, "127.0.0.1");
  const app = require("next")({
    dev: true,
    hostname: origin.hostname,
    port: Number(origin.port),
    dir: process.cwd(),
  });
  await app.prepare();
  const server = http.createServer(app.getRequestHandler());
  await new Promise((ok, fail) => server.once("error", fail).listen(Number(origin.port), origin.hostname, ok));
  let browser, page;
  try {
    browser = await chromium.launch({
      executablePath: process.env.NAUMI_TEST_CHROMIUM || undefined,
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
    await context.addCookies([{ name: "nv_user", value: process.env.PSD_E2E_COOKIE, url: origin.href }]);
    await context.route(/^https?:/, (r) =>
      new URL(r.request().url()).origin === origin.origin ? r.continue() : r.abort(),
    );
    await context.addInitScript(
      ({ email, project }) => {
        localStorage.setItem("naumi:last-email", email);
        localStorage.setItem("nv:canvas:last", project);
      },
      { email: process.env.PSD_E2E_OWNER, project },
    );
    page = await context.newPage();
    page.setDefaultTimeout(90000);
    await verify(page);
  } catch (e) {
    if (page) {
      await page.screenshot({ path: path.join(folder, "failed-browser.png") }).catch(() => {});
      console.error(
        (
          await page
            .locator("body")
            .innerText()
            .catch(() => "")
        ).slice(-1800),
      );
    }
    throw e;
  } finally {
    await browser?.close();
    server.closeAllConnections();
    server.close();
    await app.close();
  }
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
