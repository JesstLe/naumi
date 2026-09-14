import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = (process.env.CANVAS_BASE_URL || "http://localhost:3012").replace(/\/$/, "");
const email = process.env.CANVAS_SMOKE_EMAIL;
const password = process.env.CANVAS_SMOKE_PASSWORD;
if (!email || !password) throw new Error("请设置 CANVAS_SMOKE_EMAIL / CANVAS_SMOKE_PASSWORD");
let cookie = "";

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  return response;
}

async function readJson(response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status}: ${text}`);
  return body;
}

async function addReference(title, bytes) {
  const form = new FormData();
  form.append("title", title);
  form.append("image", new Blob([bytes], { type: "image/webp" }), `${title}.webp`);
  return readJson(await request("/api/artworks/add", { method: "POST", body: form }));
}

async function main() {
  await readJson(
    await request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: "画布详情图真实验收" }),
    })
  );
  const bytes = await readFile(new URL("../public/demos/suite-before.webp", import.meta.url));
  const front = await addReference("详情参考正面", bytes);
  const side = await readJson(
    await request("/api/artworks/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parentId: front.id,
        linked: false,
        src: { image: front.image, title: "详情参考侧面", category: "main" },
      }),
    })
  );
  const before = await readJson(await request(`/api/account?email=${encodeURIComponent(email)}`));
  const balanceBefore = before.user.creditsTotal - before.user.creditsUsed;

  const form = new FormData();
  form.append("prepared", "1");
  form.append("image", new Blob([bytes], { type: "image/webp" }), "front.webp");
  form.append("image", new Blob([bytes], { type: "image/webp" }), "side.webp");
  form.append("text", "生成蓝白简洁的护肤品详情页，保持产品包装和文字一致");
  form.append("platform", "taobao");
  form.append("lang", "zh");
  form.append("format", "aplus-web");
  form.append("parentId", front.id);
  form.append("parentIds", JSON.stringify([side.id]));
  form.append("origin", "canvas");
  for (const moduleKey of ["hero", "selling", "scene", "angles"]) {
    form.append("module", moduleKey);
  }
  const started = await readJson(
    await request("/api/aplus", { method: "POST", body: form })
  );
  assert.equal(started.next, "generating");
  assert.equal(started.total, 4);

  const deadline = Date.now() + 20 * 60 * 1000;
  let result;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    result = await readJson(
      await request(`/api/aplus?job=${encodeURIComponent(started.jobId)}`)
    );
    process.stdout.write(`\r详情图真实生成 ${result.done || 0}/${result.total || 4}`);
    if (result.status === "done" || result.status === "error") break;
  }
  process.stdout.write("\n");
  assert.equal(result?.status, "done", result?.error || "详情图任务超时");
  const shots = result.shots.filter((shot) => shot.status === "done");
  assert.equal(shots.length, 4);
  assert.deepEqual(
    shots.map((shot) => shot.role),
    ["hero", "selling", "scene", "angles"]
  );

  const after = await readJson(await request(`/api/account?email=${encodeURIComponent(email)}`));
  const balanceAfter = after.user.creditsTotal - after.user.creditsUsed;
  assert.equal(balanceBefore - balanceAfter, 24);
  const generated = after.artworks.filter((artwork) => shots.some((shot) => shot.id === artwork.id));
  assert.equal(generated.length, 4);
  for (const artwork of generated) {
    assert.equal(artwork.parentId, front.id);
    assert.deepEqual(artwork.parentIds, [side.id]);
    assert.equal(artwork.origin, "canvas");
    assert.equal(artwork.category, "detail");
  }

  const cleanupIds = [front.id, side.id, ...shots.map((shot) => shot.id)];
  await readJson(
    await request("/api/artworks/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: cleanupIds }),
    })
  );
  await readJson(
    await request("/api/artworks/trash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "purge", ids: cleanupIds }),
    })
  );
  console.log(
    JSON.stringify({ ok: true, count: shots.length, creditsUsed: 24, roles: shots.map((shot) => shot.role) })
  );
}

main().catch((error) => {
  console.error("canvas detail generation smoke: FAIL");
  console.error(error);
  process.exitCode = 1;
});
