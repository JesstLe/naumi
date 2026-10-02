const origin = String(process.env.NAUMI_APP_ORIGIN || "http://app:3000").replace(/\/+$/, "");
const secret = String(process.env.VIDEO_WORKER_SECRET || "");
const intervalMs = Math.max(5_000, Number(process.env.VIDEO_WORKER_INTERVAL_MS || 15_000));

if (secret.trim().length<32) {
  console.error("VIDEO_WORKER_SECRET must contain at least 32 characters");
  process.exit(1);
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const response = await fetch(`${origin}/api/video/worker/tick`, {
      method: "POST",
      headers: { "x-video-worker-secret": secret },
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) throw new Error(`worker tick failed: ${response.status}`);
    const data = await response.json();
    if (data.processed) console.log(`[video-worker] processed=${data.processed} at=${data.at}`);
  } catch (error) {
    console.error(`[video-worker] ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    running = false;
  }
}

await tick();
setInterval(tick, intervalMs);
