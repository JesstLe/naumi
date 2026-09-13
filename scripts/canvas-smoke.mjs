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
  const res = await fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  return res;
}

async function json(path, init = {}, expected = 200) {
  const res = await request(path, init);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${init.method || "GET"} ${path} returned non-JSON ${res.status}: ${text.slice(0, 200)}`);
  }
  assert.equal(res.status, expected, `${init.method || "GET"} ${path}: ${text}`);
  return body;
}

function jsonInit(method, body) {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function login() {
  const res = await request("/api/auth/login", jsonInit("POST", { email, password }));
  if (res.status === 401) {
    const registered = await request(
      "/api/auth/register",
      jsonInit("POST", { email, password, name: "画布验收" })
    );
    assert.equal(registered.status, 200, `register failed: ${await registered.text()}`);
    return;
  }
  assert.equal(res.status, 200, `login failed: ${await res.text()}`);
}

async function cleanExisting() {
  const account = await json(`/api/account?email=${encodeURIComponent(email)}`);
  const active = (account.artworks || []).map((a) => a.id);
  if (active.length) {
    await json("/api/artworks/delete", jsonInit("POST", { email, ids: active }));
  }
  const trash = await json(`/api/artworks/trash?email=${encodeURIComponent(email)}`);
  const deleted = (trash.artworks || []).map((a) => a.id);
  if (deleted.length) {
    await json(
      "/api/artworks/trash",
      jsonInit("POST", { email, action: "purge", ids: deleted })
    );
  }
}

async function addUpload(title, parentId = "", linked = false) {
  const bytes = await readFile(new URL("../public/demos/suite-before.webp", import.meta.url));
  const fd = new FormData();
  fd.append("email", "admin@admin.com"); // 故意伪造，服务端必须忽略。
  fd.append("title", title);
  fd.append("image", new Blob([bytes], { type: "image/webp" }), "canvas-smoke.webp");
  if (parentId) fd.append("parentId", parentId);
  if (linked) fd.append("linked", "1");
  const res = await request("/api/artworks/add", { method: "POST", body: fd });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(body.id);
  assert.match(body.image, /^\/media\//);
  return body;
}

async function main() {
  // 无会话不能读写画布数据。
  const unauthorized = await fetch(`${base}/api/projects?email=${encodeURIComponent(email)}`);
  assert.equal(unauthorized.status, 401);

  await login();
  await cleanExisting();

  const root = await addUpload("画布根节点");
  const child = await addUpload("画布子节点", root.id, true);
  const reference = await json(
    "/api/artworks/add",
    jsonInit("POST", {
      email: "admin@admin.com",
      parentId: root.id,
      src: { image: root.image, title: "画布参考节点", category: "main" },
    })
  );
  const otherRoot = await addUpload("另一个项目");

  await json(
    "/api/artworks/position",
    jsonInit("POST", { email: "admin@admin.com", id: child.id, x: 420, y: 180 })
  );
  await json(
    "/api/artworks/rename",
    jsonInit("POST", { email: "admin@admin.com", id: child.id, title: "已重命名子节点" })
  );
  await json(
    "/api/artworks/parents",
    jsonInit("POST", { email: "admin@admin.com", id: child.id, parentId: reference.id })
  );

  // 服务端必须拒绝跨项目连线与成环连线。
  await json(
    "/api/artworks/parents",
    jsonInit("POST", { email, id: child.id, parentId: otherRoot.id }),
    500
  );
  await json(
    "/api/artworks/parents",
    jsonInit("POST", { email, id: root.id, parentId: child.id }),
    500
  );

  const projectKey = `tree:${root.id}`;
  await json(
    "/api/projects",
    jsonInit("POST", { email: "admin@admin.com", key: projectKey, name: "画布端到端验收" })
  );
  const projects = await json(`/api/projects?email=${encodeURIComponent(email)}`);
  assert.equal(projects.names[projectKey], "画布端到端验收");

  const fetched = await json(
    `/api/artworks/get?email=${encodeURIComponent(email)}&ids=${encodeURIComponent(
      [root.id, child.id, reference.id].join(",")
    )}`
  );
  const fetchedChild = fetched.artworks.find((a) => a.id === child.id);
  assert.equal(fetchedChild.title, "已重命名子节点");
  assert.equal(fetchedChild.canvasX, 420);
  assert.equal(fetchedChild.canvasY, 180);
  assert.equal(fetchedChild.parentId, root.id);
  assert.deepEqual(fetchedChild.parentIds, [reference.id]);

  const zip = await request(
    "/api/suite/download",
    jsonInit("POST", {
      items: [
        { url: root.image, name: "root" },
        { url: child.image, name: "child" },
      ],
    })
  );
  if (zip.status !== 200) {
    throw new Error(`zip failed ${zip.status}: ${await zip.text()}`);
  }
  const zipBytes = new Uint8Array(await zip.arrayBuffer());
  assert.equal(String.fromCharCode(...zipBytes.slice(0, 2)), "PK");

  const childRecord = fetched.artworks.find((a) => a.id === child.id);
  await json("/api/artworks/delete", jsonInit("POST", { email, ids: [child.id] }));
  let trash = await json(`/api/artworks/trash?email=${encodeURIComponent(email)}`);
  assert.ok(trash.artworks.some((a) => a.id === child.id));
  await json(
    "/api/artworks/restore",
    jsonInit("POST", { email, records: [childRecord] })
  );
  const restored = await json(
    `/api/artworks/get?email=${encodeURIComponent(email)}&ids=${encodeURIComponent(child.id)}`
  );
  assert.equal(restored.artworks[0]?.id, child.id);

  const ids = [root.id, child.id, reference.id, otherRoot.id];
  await json("/api/artworks/delete", jsonInit("POST", { email, ids }));
  trash = await json(`/api/artworks/trash?email=${encodeURIComponent(email)}`);
  const cleanupIds = trash.artworks.map((a) => a.id);
  await json(
    "/api/artworks/trash",
    jsonInit("POST", { email, action: "purge", ids: cleanupIds })
  );
  await json("/api/projects", jsonInit("DELETE", { key: projectKey }));

  const after = await json(`/api/account?email=${encodeURIComponent(email)}`);
  assert.equal(after.artworks.length, 0);
  console.log("canvas smoke: PASS");
}

main().catch((error) => {
  console.error("canvas smoke: FAIL");
  console.error(error);
  process.exitCode = 1;
});
