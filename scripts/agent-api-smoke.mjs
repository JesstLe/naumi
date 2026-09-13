import assert from "node:assert/strict";

const base = (process.env.AGENT_BASE_URL || "http://127.0.0.1:3012").replace(/\/$/, "");
const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
const sessionId = `api-${suffix}`;
const email = `agent-api-${suffix}@local.test`;
const password = `Agent-${suffix}-Pass!`;
let cookie = "";

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  return response;
}

const registration = await request("/api/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, name: "Agent API 验收" }),
});
if (registration.status !== 200) {
  throw new Error(`registration failed ${registration.status}: ${await registration.text()}`);
}

const response = await request("/api/agent", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    sessionId,
    message: process.env.AGENT_SMOKE_MESSAGE || "查询我的积分余额，只回答余额，不要生成图片。",
    history: [],
  }),
});
if (response.status !== 200) {
  throw new Error(`agent failed ${response.status}: ${await response.text()}`);
}
const stream = await response.text();
console.log(stream);
assert.match(stream, /event: plan/);
assert.match(stream, /event: tool_start/);
assert.match(stream, /event: tool_end/);
assert.match(stream, /event: final/);
assert.doesNotMatch(stream, /sk-[A-Za-z0-9]/);
assert.doesNotMatch(stream, /https?:\/\/[^\s"]+\/media\//);

const renamedTitle = "Agent API 重命名保留验收";
const renamed = await request("/api/agent/session", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: sessionId, title: renamedTitle }),
});
if (renamed.status !== 200) {
  throw new Error(`rename failed ${renamed.status}: ${await renamed.text()}`);
}

const continued = await request("/api/agent", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    sessionId,
    message: "再查询一次积分余额，只回答余额，不要生成图片。",
    history: [],
  }),
});
if (continued.status !== 200) {
  throw new Error(`continue failed ${continued.status}: ${await continued.text()}`);
}
assert.match(await continued.text(), /event: final/);

const restored = await request(`/api/agent/session?id=${encodeURIComponent(sessionId)}`);
if (restored.status !== 200) {
  throw new Error(`restore failed ${restored.status}: ${await restored.text()}`);
}
const restoredSession = await restored.json();
assert.equal(restoredSession.session.title, renamedTitle);
console.log(`agent api smoke: PASS (${email})`);
