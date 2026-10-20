/** Do not surface HTML gateway/framework pages or raw JSON parser errors. */
export class ImagegenHttpError extends Error {
  constructor(message: string, public status: number, public accepted?: boolean) { super(message); }
}

/** A dismissed preparation choice is not a failed or accepted generation. */
export class ImagegenPreparationCancelled extends ImagegenHttpError {
  constructor() { super("已取消生成准备", 0, false); }
}

export async function readImagegenResponse<T>(response: Response, fallback: string): Promise<T> {
  let data: any;
  try { data = JSON.parse(await response.text()); }
  catch {
    // Acceptance is unknown. Submission callers recover the existing operation
    // receipt rather than resubmitting a potentially charged request.
    throw new ImagegenHttpError(`服务返回异常（HTTP ${response.status}），请稍后重试`, response.status);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ImagegenHttpError(`服务返回异常（HTTP ${response.status}），请稍后重试`, response.status);
  }
  if (!response.ok) throw new ImagegenHttpError(
    typeof data.error === "string" && data.error ? data.error : fallback,
    response.status,
    typeof data.accepted === "boolean" ? data.accepted : undefined,
  );
  return data as T;
}
