const DEFAULT_MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export async function readLimitedVideoResponse(
  response: Response,
  maxBytes = DEFAULT_MAX_VIDEO_BYTES
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (!response.ok) throw new Error(`取回视频失败(${response.status})`);
  const mimeType = String(response.headers.get("content-type") || "video/mp4").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("video/") && mimeType !== "application/octet-stream") {
    throw new Error(`视频结果 MIME 无效：${mimeType || "unknown"}`);
  }
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error(`视频结果超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制`);
  if (!response.body) throw new Error("视频结果响应为空");
  const reader = response.body.getReader();
  const preallocated = length > 0 ? new Uint8Array(length) : null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`视频结果超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制`);
    }
    if (preallocated) preallocated.set(chunk.value, total - chunk.value.byteLength);
    else chunks.push(chunk.value);
  }
  if (!total) throw new Error("视频内容为空");
  if (preallocated) return { bytes: total === preallocated.byteLength ? preallocated : preallocated.slice(0, total), mimeType };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, mimeType };
}
