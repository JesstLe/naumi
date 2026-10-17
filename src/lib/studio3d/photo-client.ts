import type { Crop, Outline } from "./photo-outline";
import { newProject, type StudioProject } from "./project";

export async function decodePhoto(file: File) {
  if (
    file.size > 12 * 1024 * 1024 ||
    !/^image\/(png|jpeg|webp)$/.test(file.type)
  )
    throw Error("请选择 12MB 以内的 PNG、JPG 或 WebP 图片");
  const image = await createImageBitmap(file);
  if (image.width * image.height > 40_000_000) {
    image.close();
    throw Error("图片超过 4000 万像素，请先缩小");
  }
  const scale = Math.min(1, 1536 / Math.max(image.width, image.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas;
}
export async function localPhotoProject(
  file: File,
  canvas: HTMLCanvasElement,
  crop: Crop,
  signal: AbortSignal,
): Promise<{ project: StudioProject; outline: Outline; elapsedMs: number }> {
  if (
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x + crop.width > 1.001 ||
    crop.y + crop.height > 1.001
  )
    throw Error("选区无效");
  const x = Math.round(crop.x * canvas.width),
    y = Math.round(crop.y * canvas.height),
    w = Math.round(crop.width * canvas.width),
    h = Math.round(crop.height * canvas.height);
  const resized = document.createElement("canvas"),
    scale = Math.min(1, 640 / w, 1280 / h);
  resized.width = Math.round(w * scale);
  resized.height = Math.round(h * scale);
  if (resized.width < 32 || resized.height < 64)
    throw Error("选区过小，请框选完整瓶子");
  const ctx = resized.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, x, y, w, h, 0, 0, resized.width, resized.height);
  const pixels = ctx.getImageData(0, 0, resized.width, resized.height).data;
  const started = performance.now();
  const response = await new Promise<{ result: Outline; elapsedMs: number }>(
    (resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Canceled", "AbortError"));
        return;
      }
      const worker = new Worker(new URL("./photo-worker.ts", import.meta.url), {
        type: "module",
      });
      const stop = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        worker.terminate();
      };
      const abort = () => {
        stop();
        reject(new DOMException("Canceled", "AbortError"));
      };
      const timer = setTimeout(() => {
        stop();
        reject(Error("本机处理超时，请缩小选区后重试"));
      }, 15000);
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = (event) => {
        stop();
        if (event.data.ok) resolve(event.data);
        else reject(Error(event.data.error));
      };
      worker.onerror = () => {
        stop();
        reject(Error("浏览器后台处理启动失败，请使用支持 Web Worker 的浏览器"));
      };
      worker.postMessage(
        { pixels: pixels.buffer, width: resized.width, height: resized.height },
        [pixels.buffer],
      );
    },
  );
  if (signal.aborted) throw new DOMException("Canceled", "AbortError");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  if (signal.aborted) throw new DOMException("Canceled", "AbortError");
  const assumedHeight = 160,
    diameter = assumedHeight * response.result.widthHeight;
  const p: StudioProject = {
    ...newProject("bottle"),
    version: 2,
    template: "photo-lathe",
    name: file.name.replace(/\.[^.]+$/, "").slice(0, 70) + " · 照片建模",
    width: Math.max(15, Math.min(250, diameter)),
    height: assumedHeight,
    depth: Math.max(15, Math.min(250, diameter)),
    color: response.result.backColor,
    view: "front",
    material: "matte",
    roughness: 0.65,
    photo: {
      image: resized.toDataURL("image/png"),
      profile: response.result.profile,
      sourceHash: Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
      crop,
      width: resized.width,
      height: resized.height,
      textureMode: "photo",
      scaleSource: "assumed",
      assumption: "axisymmetric",
      workerMs: response.elapsedMs,
    },
  };
  return {
    project: p,
    outline: response.result,
    elapsedMs: performance.now() - started,
  };
}
