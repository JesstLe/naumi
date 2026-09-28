import crypto from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { NextResponse } from "next/server";

import { authenticatedEmail } from "@/lib/request-auth";
import { MEDIA_DIR, uploadImage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function runFfmpeg(input: string, kind: "frame" | "audio", timestamp: number): Promise<Uint8Array> {
  const args = kind === "frame"
    ? ["-hide_banner", "-loglevel", "error", "-ss", String(timestamp), "-i", input, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"]
    : ["-hide_banner", "-loglevel", "error", "-i", input, "-vn", "-acodec", "libmp3lame", "-f", "mp3", "pipe:1"];
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { windowsHide: true });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 || !chunks.length) reject(new Error(errors.join("").slice(0, 500) || "视频抽取失败"));
      else resolve(new Uint8Array(Buffer.concat(chunks)));
    });
  });
}

export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as { videoUrl?: string; kind?: string; timestamp?: number } | null;
  const videoUrl = String(body?.videoUrl || "").trim();
  const kind = body?.kind === "audio" ? "audio" : "frame";
  const timestamp = Math.max(0, Math.min(3600, Number(body?.timestamp || 0)));
  if (!videoUrl || (!videoUrl.startsWith("/media/") && !/^https?:\/\//i.test(videoUrl))) {
    return NextResponse.json({ error: "视频地址无效" }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const workDir = path.join(os.tmpdir(), `naumi-video-${id}`);
  const inputPath = path.join(workDir, "input.mp4");
  try {
    await mkdir(workDir, { recursive: true });
    if (videoUrl.startsWith("/media/")) {
      const relative = videoUrl.slice("/media/".length).replaceAll("/", path.sep);
      const resolved = path.resolve(MEDIA_DIR, relative);
      if (!resolved.startsWith(path.resolve(MEDIA_DIR) + path.sep)) throw new Error("视频地址无效");
      await writeFile(inputPath, await readFile(resolved));
    } else {
      const response = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`读取视频失败(${response.status})`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 200 * 1024 * 1024) throw new Error("视频超过 200MB 上限");
      await writeFile(inputPath, bytes);
    }
    const bytes = await runFfmpeg(inputPath, kind, timestamp);
    const mimeType = kind === "frame" ? "image/png" : "audio/mpeg";
    const storageKey = `videos/extracted/${id}.${kind === "frame" ? "png" : "mp3"}`;
    const url = await uploadImage(bytes, mimeType, storageKey);
    return NextResponse.json({ ok: true, kind, url, mimeType, storageKey, timestamp: kind === "frame" ? timestamp : 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "视频抽取失败" }, { status: 502 });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
