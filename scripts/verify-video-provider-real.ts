import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { openAiVideosAdapter, resolveOpenAiVideosConfig } = await import("@/lib/video/providers/openai-videos");
  const cfg = resolveOpenAiVideosConfig();
  if (!cfg) {
    console.log("SKIP real video provider: VIDEO_API_BASE_URL/KEY/MODEL not configured");
    return;
  }
  const created = await openAiVideosAdapter.create({
    source: "workbench",
    providerId: "openai-videos",
    modelId: cfg.model,
    prompt: "A premium skincare bottle slowly rotates on a clean white studio pedestal, soft commercial lighting, stable camera, realistic product video",
    durationSeconds: 4,
    resolution: "1280x720",
    references: [],
    idempotencyKey: `real-acceptance-${Date.now()}`,
  });
  const snapshot = {
    id: "real-acceptance", email: "local-acceptance", providerId: "openai-videos",
    modelId: cfg.model, upstreamTaskId: created.upstreamTaskId, prompt: "acceptance",
    parameters: {}, references: [],
  };
  const deadline = Date.now() + 8 * 60_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error("real provider acceptance timed out");
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const polled = await openAiVideosAdapter.poll(snapshot);
    if (polled.status === "failed") throw new Error(polled.errorMessage || "real provider task failed");
    if (polled.status !== "completed") continue;
    const result = await openAiVideosAdapter.fetchResult(snapshot, polled);
    if (!result.bytes?.byteLength) throw new Error("real provider returned empty video");
    const out = path.resolve("output/video-real-provider-acceptance.mp4");
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, result.bytes);
    console.log(`PASS real video provider: status=completed bytes=${result.bytes.byteLength} mime=${result.mimeType} output=${out}`);
    return;
  }
}

void main().catch((error) => {
  console.error(`FAIL real video provider: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
