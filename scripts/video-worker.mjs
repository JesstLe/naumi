import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const origin = String(process.env.NAUMI_APP_ORIGIN || "http://app:3000").replace(/\/+$/, "");
const secret = String(process.env.VIDEO_WORKER_SECRET || "");
const intervalMs = Math.max(5_000, Number(process.env.VIDEO_WORKER_INTERVAL_MS || 15_000));

if (!Number.isFinite(intervalMs) || intervalMs > 2_147_483_647) {
  console.error("Invalid worker interval configuration");
  process.exit(1);
}

if (secret.trim().length<32) {
  console.error("VIDEO_WORKER_SECRET must contain at least 32 characters");
  process.exit(1);
}

const controlPort = Number(process.env.VIDEO_WORKER_CONTROL_PORT || 0);
const startPaused = process.env.VIDEO_WORKER_START_PAUSED === "1";
if (!Number.isInteger(controlPort) || controlPort < 0 || controlPort > 65535 || startPaused && !controlPort) {
  console.error("Invalid worker control configuration"); process.exit(1);
}
let running = false, mode = startPaused ? "paused" : "running", timer, control;
let completedTicks = 0, lastSuccessfulTick = null;
const status = () => ({ mode: mode === "draining" && !running ? "drained" : mode, running, completedTicks, lastSuccessfulTick });
function finishStop() {
  if (mode !== "stopping" || running) return;
  clearInterval(timer);
  if (control) { control.close(); control.closeIdleConnections(); }
  process.exitCode = 0;
}
function stop() { mode = "stopping"; clearInterval(timer); finishStop(); }
process.on("SIGTERM", stop); process.on("SIGINT", stop);

if (controlPort) {
  control = http.createServer((request, response) => {
    const token = String(request.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(token);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      response.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" }); response.end('{"error":"worker authentication failed"}'); return;
    }
    if (request.method === "POST" && request.url === "/drain") { if (mode !== "stopping") mode = "draining"; }
    else if (request.method === "POST" && request.url === "/resume") {
      if (mode === "stopping") { response.writeHead(409); response.end(); return; }
      if (mode !== "running") { mode = "running"; void tick(); }
    } else if (request.method !== "GET" || request.url !== "/status") { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(status()));
  });
  await new Promise((resolve, reject) => { control.once("error", reject); control.listen(controlPort, "127.0.0.1", resolve); });
  console.log("[video-worker] private-control-ready");
}

async function tick() {
  if (running || mode !== "running") return;
  running = true;
  try {
    const response = await fetch(`${origin}/api/video/worker/tick`, {
      method: "POST",
      headers: { "x-video-worker-secret": secret },
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) throw new Error(`worker tick failed: ${response.status}`);
    const data = await response.json();
    completedTicks++; lastSuccessfulTick = new Date().toISOString();
    if (data.processed) console.log(`[video-worker] processed=${data.processed} at=${data.at}`);
  } catch (error) {
    console.error(`[video-worker] ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    running = false;
    finishStop();
  }
}

// Install scheduling before awaiting a tick: SIGTERM during the first request
// must never recreate an interval after the drain has completed.
if (mode !== "stopping") {
  timer = setInterval(() => void tick(), intervalMs);
  void tick();
} else finishStop();
