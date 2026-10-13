import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const defaultAssetsRoot = path.resolve("output/canvas-video-fusion-20261013/fixtures/assets");
function command(binary, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout?.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(`${binary} exited ${code}: ${stderr}`)));
  });
}
export async function probeAsset(filename) {
  const raw = JSON.parse(await command("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", filename], true));
  const video = raw.streams?.find(stream => stream.codec_type === "video");
  return { durationSeconds: Number(raw.format?.duration || 0), width: video?.width || 0, height: video?.height || 0,
    videoCodec: video?.codec_name || null, audioCodecs: (raw.streams || []).filter(s => s.codec_type === "audio").map(s => s.codec_name),
    hasVideoStream: Boolean(video) };
}
export async function prepareVideoAssets(root = defaultAssetsRoot, durations = [4, 5, 6, 8, 10, 12, 15, 30]) {
  root = path.resolve(root);
  await mkdir(root, { recursive: true });
  const manifest = { version: 1, license: "Original test patterns and tones generated for this task; no third-party media.",
    generator: "ffmpeg testsrc2/sine", createdAt: new Date().toISOString(), files: [] };
  const ffmpeg = async (name, args) => {
    const file = path.join(root, name);
    if (!(await stat(file).catch(() => null))) await command("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-n", ...args, file]);
    return file;
  };
  const record = async (name, mimeType, args, extra = {}) => {
    const filename = await ffmpeg(name, args), bytes = await readFile(filename);
    const info = await probeAsset(filename);
    if (!(info.durationSeconds > 0) && !mimeType.startsWith("image/")) throw new Error(`Invalid fixture ${name}`);
    const file = { name, mimeType, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), ...info, ...extra,
      command: ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-n", ...args, name] };
    manifest.files.push(file); return file;
  };
  for (const [orientation, width, height, aspectRatio] of [["landscape",1280,720,"16:9"],["portrait",720,1280,"9:16"],["square",720,720,"1:1"]]) {
    for (const seconds of durations) {
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) throw new Error("Invalid fixture duration");
      await record(`${orientation}-${seconds}-audio.mp4`, "video/mp4", ["-f","lavfi","-i",`testsrc2=size=${width}x${height}:rate=24`,
        "-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t",String(seconds),"-threads","2","-c:v","libx264","-preset","fast",
        "-crf","27","-pix_fmt","yuv420p","-c:a","aac","-movflags","+faststart"], { aspectRatio });
    }
  }
  await record("landscape-4-silent.mp4", "video/mp4", ["-f","lavfi","-i","testsrc2=size=1280x720:rate=24","-t","4",
    "-threads","2","-c:v","libx264","-preset","fast","-crf","27","-pix_fmt","yuv420p","-an","-movflags","+faststart"], { aspectRatio: "16:9" });
  await record("tone-8.wav", "audio/wav", ["-f","lavfi","-i","sine=frequency=880:sample_rate=48000","-t","8","-c:a","pcm_s16le"]);
  const source = path.join(root, "landscape-4-audio.mp4");
  await record("first.png", "image/png", ["-ss","0","-i",source,"-frames:v","1"]);
  await record("last.png", "image/png", ["-ss","3.95","-i",source,"-frames:v","1"]);
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
export async function loadVideoAssets(root = defaultAssetsRoot) {
  const manifest = JSON.parse(await readFile(path.join(root,"manifest.json"),"utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error("Invalid asset manifest");
  for (const entry of manifest.files) {
    if (path.basename(entry.name) !== entry.name) throw new Error("Unsafe asset filename");
    const bytes = await readFile(path.join(root,entry.name));
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error(`Fixture hash mismatch ${entry.name}`);
  }
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await prepareVideoAssets(process.argv[2] || defaultAssetsRoot);
  process.stdout.write(`ASSETS_READY files=${manifest.files.length} original_media=true\n`);
}
