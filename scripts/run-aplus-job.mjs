import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const baseIndex = args.indexOf("--base");
const outputDir = outputIndex >= 0 ? args[outputIndex + 1] : "output/aplus-job";
const baseUrl = baseIndex >= 0 ? args[baseIndex + 1].replace(/\/$/, "") : "http://localhost:3100";
const imagePaths = args.filter((arg, index) => {
  if ([outputIndex, outputIndex + 1, baseIndex, baseIndex + 1].includes(index)) return false;
  return !arg.startsWith("--");
});
if (imagePaths.length < 1 || imagePaths.length > 3) {
  throw new Error("usage: node run-aplus-job.mjs <image1> [image2] [image3] --output <dir>");
}

await mkdir(outputDir, { recursive: true });
const form = new FormData();
for (const imagePath of imagePaths) {
  const bytes = await readFile(imagePath);
  const ext = extname(imagePath).toLowerCase();
  const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  form.append("image", new Blob([bytes], { type }), basename(imagePath));
}
form.append("text", "VOSS 芙丝饮用天然水，净含量 500mL；浅色高端电商视觉。只使用照片和包装中可确认的信息，不虚构健康、矿物质、认证或促销信息。");
form.append("platform", "taobao");
form.append("lang", "zh");
form.append("format", "aplus-web");
for (const moduleName of ["hero", "selling", "scene", "angles", "story", "specs"]) {
  form.append("module", moduleName);
}

const startResponse = await fetch(`${baseUrl}/api/aplus`, { method: "POST", body: form });
const startText = await startResponse.text();
let start;
try {
  start = JSON.parse(startText);
} catch {
  throw new Error(`A+ start returned ${startResponse.status}: ${startText.slice(0, 500)}`);
}
if (!startResponse.ok || !start.jobId) {
  throw new Error(start.error || `A+ start failed: ${startResponse.status}`);
}
process.stdout.write(`job ${start.jobId} started\n`);

let result;
let reviewCompleted = false;
for (let attempt = 0; attempt < 160; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const response = await fetch(`${baseUrl}/api/aplus?job=${encodeURIComponent(start.jobId)}`, {
    cache: "no-store",
  });
  result = await response.json();
  process.stdout.write(
    `stage=${result.stage || "unknown"} status=${result.status} progress=${result.done || 0}/${result.total || 0}\n`
  );
  if (result.status === "awaiting_review" && !reviewCompleted) {
    for (const [sourceIndex, source] of (result.sources || []).entries()) {
      if (source.status !== "review" && source.status !== "approved") {
        throw new Error(source.error || `white source ${sourceIndex + 1} is not reviewable`);
      }
      if (source.status === "approved") continue;
      const approveResponse = await fetch(`${baseUrl}/api/aplus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: start.jobId,
          action: "approve_source",
          sourceIndex,
        }),
      });
      if (!approveResponse.ok) {
        throw new Error(`approve source ${sourceIndex + 1} failed: ${await approveResponse.text()}`);
      }
    }
    const continueResponse = await fetch(`${baseUrl}/api/aplus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: start.jobId, action: "generate" }),
    });
    if (!continueResponse.ok) {
      throw new Error(`continue A+ failed: ${await continueResponse.text()}`);
    }
    reviewCompleted = true;
    process.stdout.write("white sources approved; A+ generation started\n");
  }
  if (result.status === "done" || result.status === "error") break;
}
if (!result || result.status !== "done") {
  await writeFile(join(outputDir, "failed-job.json"), JSON.stringify({ start, result }, null, 2));
  throw new Error(result?.error || "A+ job timed out");
}

async function saveRemote(item, prefix, index) {
  if (!item?.url) return null;
  const filename = `${prefix}-${String(index + 1).padStart(2, "0")}-${item.role || item.label || "image"}.png`
    .replace(/[\\/:*?"<>|\s]+/g, "-");
  const target = join(outputDir, filename);
  if (item.url.startsWith("data:")) {
    const match = /^data:[^;]+;base64,(.+)$/s.exec(item.url);
    if (!match) throw new Error(`invalid data URL for ${filename}`);
    await writeFile(target, Buffer.from(match[1], "base64"));
  } else {
    const url = item.url.startsWith("/") ? `${baseUrl}${item.url}` : item.url;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`download ${url} failed: ${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  return filename;
}

const savedSources = [];
for (const [index, source] of (result.sources || []).entries()) {
  savedSources.push(await saveRemote(source, "white-source", index));
}
const savedShots = [];
for (const [index, shot] of (result.shots || []).entries()) {
  if (shot.status === "done") savedShots.push(await saveRemote(shot, "aplus", index));
}
const manifest = {
  generatedAt: new Date().toISOString(),
  projectEndpoint: `${baseUrl}/api/aplus`,
  jobId: start.jobId,
  sourceFiles: savedSources.filter(Boolean),
  aplusFiles: savedShots.filter(Boolean),
  raw: result,
};
await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
process.stdout.write(`saved ${manifest.sourceFiles.length} sources and ${manifest.aplusFiles.length} A+ images to ${outputDir}\n`);
