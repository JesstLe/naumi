/* Mock supplier receipts, real encoder, actual React dialog and Chromium file download. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const sharp = require("sharp");
const esbuild = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const tailwind = require("tailwindcss");
const postcss = require("postcss");

const source = path.resolve("src");
const output = path.resolve("output/layered-psd-verification");
const pixels = {
  background: [232, 224, 194, 255],
  product: [36, 88, 71, 255],
  decor: [221, 126, 58, 255],
};
const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);
const entry = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LayeredPsdDialog } from "@/components/canvas/layered-psd-dialog";
import { configureBrowserImageCache } from "@/lib/browser-image-cache";
configureBrowserImageCache(false);
const scope = { account: "fixture", project: "tree:poster", workspace: "personal",
  key: "fixture:personal:poster", viewCurrent: () => true, documentCurrent: () => true, assertView: () => {} };
function App() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>智能拆层</button>
    {open && <LayeredPsdDialog selection={{id:"poster",image:"/original.png",title:"商品海报",scope}}
      english={false} onClose={() => setOpen(false)} onSettled={() => {}} />}</>;
}
createRoot(document.querySelector("#root")).render(<App />);
`;

async function main() {
  await fs.mkdir(output, { recursive: true });
  const [background, product, decor] = await Promise.all([
    sharp(svg(320, 240, '<path fill="#e8e0c2" d="M0 0h320v240H0z"/>')).png().toBuffer(),
    sharp(svg(96, 140, '<rect fill="#245847" x="8" y="10" width="80" height="122" rx="16"/><rect fill="#c4d7a8" x="24" y="65" width="48" height="30" rx="3"/>')).png().toBuffer(),
    sharp(svg(80, 64, '<circle fill="#dd7e3a" cx="40" cy="32" r="27"/>')).png().toBuffer(),
  ]);
  const original = await sharp(background).composite([{ input: product, left: 101, top: 72 }, { input: decor, left: 154, top: 25 }]).png().toBuffer();
  const { createLayerProvider, downloadLayerStack, readLayerReceipt } = await import("../src/lib/canvas/layer-decomposition-provider.ts");
  const { encodeLayeredPsd } = await import("../src/lib/canvas/layered-psd.ts");
  const images = {
    "/bg.png": background, "/product.png": product, "/decor.png": decor,
  };
  const result = { images: [{
    layer_decomposition: true,
    url: ["/bg.png", "/decor.png", "/product.png"].map(file => `https://fixtures.example${file}`),
    sizes: ["320x240", "80x64", "96x140"],
    layers: [{ z_index: "0" }, { z_index: "2", name: "装饰", bounding_box: { absolute: [154, 25, 233, 88] } },
      { z_index: "1", name: "商品", bounding_box: { absolute: [101, 72, 197, 212] } }],
  }] };
  const vendorCalls = [];
  const mockVendor = async (url, init) => {
    const target = new URL(url);
    vendorCalls.push([target.pathname, init.method || "GET"]);
    if (target.pathname === "/v1/uploads/images") {
      assert.equal(init.body.get("file").size, original.length);
      return Response.json({ url: "https://fixtures.example/input.png" });
    }
    if (target.pathname === "/v1/images/generations") {
      assert.equal(init.headers["Idempotency-Key"], "fixture-operation");
      assert.equal(JSON.parse(init.body).layer_decomposition, true);
      return Response.json({ code: 200, data: { id: "task_layered_fixture" } });
    }
    assert.equal(target.pathname, "/v1/tasks/task_layered_fixture");
    return Response.json({ code: 200, data: { id: "task_layered_fixture", status: "completed", result } });
  };
  const provider = createLayerProvider({ baseUrl: "https://fixtures.example", apiKey: "placeholder", model: "seedream-5-0-pro" }, mockVendor);
  const signal = AbortSignal.timeout(30_000);
  const uploaded = await provider.upload(original, "image/png", signal);
  const { taskId } = await provider.submit(uploaded, "fixture-operation", signal);
  const supplier = await provider.poll(taskId, signal);
  const mockCdn = async (url, init) => {
    assert.equal(init.headers, undefined);
    return new Response(images[new URL(url).pathname], { headers: { "content-type": "image/png" } });
  };
  const stack = await downloadLayerStack(supplier.data.result, signal, mockCdn);
  const psd = await encodeLayeredPsd(stack);
  assert.equal(psd.subarray(0, 4).toString(), "8BPS");
  assert.deepEqual(stack.layers.map(layer => layer.name), ["背景", "商品", "装饰"]);
  const enlarged = structuredClone(result);
  enlarged.images[0].sizes[2] = "192x280";
  const enlargedProduct = await sharp(product).resize(192, 280).png().toBuffer();
  const placed = await downloadLayerStack(enlarged, signal, async (url, init) => new URL(url).pathname === "/product.png"
    ? new Response(enlargedProduct, { headers: { "content-type": "image/png" } }) : mockCdn(url, init));
  assert.deepEqual([placed.layers[1].placedWidth, placed.layers[1].placedHeight], [96, 140]);
  assert.equal((await encodeLayeredPsd(placed)).subarray(0, 4).toString(), "8BPS");
  enlarged.images[0].layers[2].bounding_box.absolute[2] = 321;
  assert.throws(() => readLayerReceipt(enlarged), /坐标/);
  assert.throws(() => readLayerReceipt({ images: [{ ...result.images[0], sizes: ["320x240"] }] }), /图层数/);
  await assert.rejects(encodeLayeredPsd({ ...stack, layers: [stack.layers[0], { ...stack.layers[1], width: 95 }] }), /格式/);
  assert.deepEqual(vendorCalls, [["/v1/uploads/images", "POST"], ["/v1/images/generations", "POST"], ["/v1/tasks/task_layered_fixture", "GET"]]);
  await fs.writeFile(path.join(output, "original.png"), original);
  await fs.writeFile(path.join(output, "poster.psd"), psd);

  const { outputFiles } = await esbuild.build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, platform: "browser",
    write: false, jsx: "automatic", alias: { "@": source }, define: { "process.env": "{}" },
  });
  const css = (await postcss([tailwind({
    content: [{ raw: await fs.readFile(path.join(source, "components/canvas/layered-psd-dialog.tsx"), "utf8"), extension: "tsx" }],
  })]).process("@tailwind base;@tailwind utilities;", { from: undefined })).css;
  const submissions = [];
  let ready = false;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const send = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (url.pathname === "/app.js") return response.writeHead(200, { "Content-Type": "text/javascript" }).end(outputFiles[0].contents);
    if (url.pathname === "/app.css") return response.writeHead(200, { "Content-Type": "text/css" }).end(css);
    if (url.pathname === "/original.png") return response.writeHead(200, { "Content-Type": "image/png" }).end(original);
    if (url.pathname === "/api/canvas/layered-psd") {
      if (request.headers["x-naumi-project-context"] !== "tree:poster" || request.headers["x-naumi-workspace"] !== "personal") {
        return send(403, { error: "invalid scope" });
      }
      if (request.method === "POST") {
        const parts = [];
        for await (const part of request) parts.push(part);
        submissions.push(JSON.parse(Buffer.concat(parts)));
        // The gateway can lose the upstream response after accepting the request.
        return send(504, { error: "gateway timeout" });
      }
      const id = url.searchParams.get("operationId");
      if (!id) return send(200, { credits: 12, version: 7 });
      if (id !== submissions[0]?.operationId) return send(404, { state: "missing" });
      if (url.searchParams.has("file") && ready) return response.writeHead(200, { "Content-Type": "image/vnd.adobe.photoshop" }).end(psd);
      return send(200, { state: ready ? "ready" : "pending" });
    }
    return response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end('<!doctype html><title>PSD fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ ...(process.env.NAUMI_TEST_CHROMIUM ? { executablePath: process.env.NAUMI_TEST_CHROMIUM } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole("button", { name: "智能拆层" }).click();
    const confirm = page.getByRole("button", { name: "开始拆层 · 12 积分" });
    await expect(confirm).toBeVisible();
    assert.equal(submissions.length, 0);
    await confirm.evaluate(button => { button.click(); button.click(); });
    await expect(page.getByRole("button", { name: "查询原任务" })).toBeVisible();
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].artworkId, "poster");
    assert.equal(submissions[0].sourceImage, "/original.png");
    assert.equal(submissions[0].credits, 12);
    assert.equal(submissions[0].version, 7);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "智能拆层" }).click();
    await expect(page.getByRole("button", { name: "查询原任务" })).toBeVisible();
    ready = true;
    await page.getByRole("button", { name: "查询原任务" }).click();
    const preview = page.getByRole("img", { name: "图层合成预览" });
    const pixel = (x, y) => preview.evaluate((canvas, [x, y]) => Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data), [x, y]);
    await expect.poll(() => pixel(114, 105)).toEqual(pixels.product);
    assert.deepEqual(await pixel(180, 53), pixels.decor);
    const productLayer = page.getByRole("button", { name: "商品", exact: true });
    await productLayer.click();
    await expect(productLayer).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => pixel(114, 105)).toEqual(pixels.background);
    assert.deepEqual(await pixel(180, 53), pixels.decor);
    assert.equal(await page.getByRole("dialog").evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载分层 PSD" }).click();
    const download = await pendingDownload;
    assert.equal(download.suggestedFilename(), "商品海报.psd");
    await download.saveAs(path.join(output, "browser-download.psd"));
    assert.deepEqual(await fs.readFile(path.join(output, "browser-download.psd")), psd);
    assert.equal(submissions.length, 1);
    assert.deepEqual(errors, []);
    console.log("LAYERED_PSD_BROWSER=PASS mock_supplier=1 layers=3 duplicate_posts=0 reload_recovery=1 downloaded_original_layers=1");
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
