/** Proxy errors may be HTML or empty bodies. Never show their parser error/body to users. */
export async function readToolResponse<T>(response: Response): Promise<T> {
  const fallback = response.status === 413
    ? "上传文件总大小超出限制，请减少图片或压缩后重试"
    : [504, 524].includes(response.status)
      ? "请求等待超时，请先到作品库查看是否已有结果，避免重复提交"
      : [502, 503].includes(response.status)
        ? "生成服务暂时繁忙，请稍后重试"
        : `服务返回异常（${response.status}），请稍后重试`;
  let data: unknown;
  try { data = JSON.parse(await response.text()); } catch { throw new Error(fallback); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(fallback);
  const error = (data as { error?: unknown }).error;
  if (!response.ok) throw new Error(typeof error === "string" && !/<(?:html|!doctype)/i.test(error) ? error : fallback);
  return data as T;
}
