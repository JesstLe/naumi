const DEFAULT_MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export async function readLimitedMediaResponse(
  response: Response,
  maxBytes = DEFAULT_MAX_VIDEO_BYTES,
  expectedKind: "video" | "audio" | "image" = "video"
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const abort = async (message: string): Promise<never> => {
    await response.body?.cancel().catch(() => {});
    throw new Error(message);
  };
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return abort("媒体字节上限无效");
  if (!response.ok) return abort(`取回媒体失败(${response.status})`);
  const mimeType = String(response.headers.get("content-type") || "video/mp4").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith(`${expectedKind}/`) && mimeType !== "application/octet-stream") {
    return abort(`媒体结果 MIME 无效：${mimeType || "unknown"}`);
  }
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) return abort(`媒体结果超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制`);
  if (!response.body) throw new Error("视频结果响应为空");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try { for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`视频结果超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制`);
    }
    // Content-Length is an untrusted hint, not an allocation or write boundary.
    chunks.push(chunk.value);
  } } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  if (!total) throw new Error("视频内容为空");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, mimeType };
}

export function readLimitedVideoResponse(response: Response, maxBytes = DEFAULT_MAX_VIDEO_BYTES) {
  return readLimitedMediaResponse(response, maxBytes, "video");
}
