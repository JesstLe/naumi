import "server-only";
import sharp from "sharp";
import { ModelConfigError } from "./types";

/** Exact wire identities only. These limits come from the pinned related
 * APIMart documents, not from GPT or Reverse Hub capabilities. */
export const SEEDREAM_WIRE_IDS = ["seedream-4-0", "seedream-4-5", "seedream-5-0-flash", "seedream-5-0-lite", "seedream-5-0-pro", "seedream-5-5"] as const;
export const isSeedreamWire = (model: string) => (SEEDREAM_WIRE_IDS as readonly string[]).includes(model);
const fail = (message: string): never => { throw new ModelConfigError("INVALID_REQUEST", message, 422); };

/** Call only for a fresh, unclaimed submission. Accepted/unknown markers and
 * saved task IDs retain their frozen request and query-only recovery path.
 * MB is conservatively decimal: 10 MB = 10,000,000 bytes (not 10 MiB).
 * Prompt characters use Unicode code points, not UTF-16 units or graphemes;
 * the supplier's undocumented counting implementation is not claimed tested. */
export async function seedreamPreflight(model: string, prompt: string, files: readonly File[], n: number) {
  if (!isSeedreamWire(model)) return;
  const pro = model === "seedream-5-0-pro" || model === "seedream-5-0-flash" || model === "seedream-5-5";
  if (model === "seedream-4-0" && Array.from(prompt).length > 1000) fail("即梦 4.0 提示词最多1000个Unicode字符，本次未提交生成");
  if (!Number.isInteger(n) || n < 1 || (pro ? n !== 1 : files.length + n > 15) || files.length > 10)
    fail("此即梦型号的图片数量或参考图数量超出已开放范围，本次未提交生成");
  for (const file of files) {
    if (!(pro ? ["image/png", "image/jpeg", "image/webp"] : ["image/png", "image/jpeg"]).includes(file.type) || file.size > (model === "seedream-5-5" ? 30 * 1024 * 1024 : pro ? 30_000_000 : 10_000_000))
      fail("此即梦型号的参考图格式或字节大小超出已开放范围，本次未上传或提交生成");
    let width: number | undefined, height: number | undefined;
    try { ({ width, height } = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error", limitInputPixels: 36_000_000 }).metadata()); }
    catch { return fail("此即梦型号的参考图无效或超过3600万像素，本次未上传或提交生成"); }
    if (!width || !height || width <= 14 || height <= 14 || width * height > 36_000_000 || (pro ? width > height * 16 || height > width * 16 : width > height * 3 || height > width * 3))
      fail("此即梦型号的参考图尺寸或比例超出已开放范围，本次未上传或提交生成");
  }
}
