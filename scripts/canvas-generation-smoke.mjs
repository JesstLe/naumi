import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = (process.env.CANVAS_BASE_URL || "http://localhost").replace(/\/$/, "");
const email = process.env.CANVAS_SMOKE_EMAIL || "canvas-e2e@local.test";
const password = process.env.CANVAS_SMOKE_PASSWORD;
if (!password) throw new Error("请设置 CANVAS_SMOKE_PASSWORD");
let cookie = "";

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  return response;
}

async function json(path, init = {}) {
  const response = await request(path, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${init.method || "GET"} ${path} returned ${response.status}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${path} returned ${response.status}: ${body.error || text}`);
  }
  return body;
}

async function main() {
  await json("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const current = await json(`/api/account?email=${encodeURIComponent(email)}`);
  const currentIds = (current.artworks || []).map((work) => work.id);
  if (currentIds.length) {
    await json("/api/artworks/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, ids: currentIds }),
    });
  }

  const bytes = await readFile(new URL("../public/demos/suite-before.webp", import.meta.url));
  const rootForm = new FormData();
  rootForm.append("email", email);
  rootForm.append("title", "真实生图父节点");
  rootForm.append("image", new Blob([bytes], { type: "image/webp" }), "generation-parent.webp");
  const root = await json("/api/artworks/add", { method: "POST", body: rootForm });

  const before = await json(`/api/account?email=${encodeURIComponent(email)}`);
  const form = new FormData();
  form.append("email", email);
  form.append("prompt", "Keep the product shape and create a clean studio product photo on a light gray background");
  form.append("userPrompt", "保留商品形状，改成浅灰背景的干净棚拍");
  form.append("category", "main");
  form.append("ratio", "1:1");
  form.append("resolution", "1K");
  form.append("count", "1");
  form.append("parentId", root.id);
  form.append("parentIds", "[]");
  form.append("origin", "canvas");
  form.append("image", new Blob([bytes], { type: "image/webp" }), "generation-parent.webp");
  const start = await json("/api/generate-image", { method: "POST", body: form });
  assert.ok(start.jobId, "generation did not return jobId");

  const deadline = Date.now() + 330_000;
  let result;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    result = await json(`/api/generate-image?job=${encodeURIComponent(start.jobId)}`);
    if (result.status === "done" || result.status === "error") break;
  }
  assert.ok(result, "generation polling returned no result");
  assert.equal(result.status, "done", result.error || "generation timed out");
  assert.equal(result.images?.length, 1);
  assert.match(result.images[0].url, /^(data:image\/|https?:\/\/|\/media\/)/);

  const after = await json(`/api/account?email=${encodeURIComponent(email)}`);
  const generated = (after.artworks || []).find((work) => work.id === result.images[0].id);
  assert.ok(generated, "generated artwork was not persisted");
  assert.equal(generated.origin, "canvas");
  assert.equal(generated.parentId, root.id);
  const creditsBefore = (before.user.creditsTotal || 0) - (before.user.creditsUsed || 0);
  const creditsAfter = (after.user.creditsTotal || 0) - (after.user.creditsUsed || 0);
  assert.ok(creditsAfter < creditsBefore, "generation did not deduct credits");
  console.log(JSON.stringify({
    status: "PASS",
    jobId: start.jobId,
    artworkId: generated.id,
    image: generated.image,
    parentId: root.id,
    creditsBefore,
    creditsAfter,
  }));
}

main().catch((error) => {
  console.error("canvas generation smoke: FAIL");
  console.error(error);
  process.exitCode = 1;
});
