export const IMAGE_SUPPLIER_FAILURE_MESSAGES = {
  IMAGE_CONTENT_REJECTED: "图片或描述未通过内容审核，请调整后重试",
  IMAGE_INPUT_REJECTED: "参考图片未被生成服务接受，请检查图片后重试",
  IMAGE_PARAMETER_REJECTED: "生成参数未被服务接受，请调整参数或联系管理员核对",
  IMAGE_ACCESS_DENIED: "生成通道访问被拒绝，请联系管理员处理",
  IMAGE_RATE_LIMITED: "生成服务繁忙，请稍后再试",
  IMAGE_UPSTREAM_UNAVAILABLE: "生成通道暂时异常，请稍后再试",
  IMAGE_REQUEST_REJECTED: "本次生成请求被服务拒绝，请调整图片或描述后重试",
} as const;
export type ImageSupplierFailureCode = keyof typeof IMAGE_SUPPLIER_FAILURE_MESSAGES;
export type ImageSupplierFailure = { code: ImageSupplierFailureCode; status: number; parameter?: string };

/** Never retain or return arbitrary upstream messages, URLs, keys or echoed
 * user prompts. Preserve only a finite diagnosis and an allowlisted field name.
 * HTTP rejection does not establish supplier billing/refund state. */
export function imageSupplierFailure(status: number, receipt: unknown): ImageSupplierFailure {
  const body = receipt && typeof receipt === "object" ? receipt as Record<string, unknown> : {};
  const error = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : body;
  const code = typeof error.code === "string" ? error.code.slice(0, 100).toLowerCase() : "";
  const rawParam = typeof error.param === "string" ? error.param.toLowerCase() : "";
  const parameter = ["image", "image[]", "mask", "size", "resolution", "quality", "aspect_ratio", "n", "background", "output_format", "prompt"].includes(rawParam) ? rawParam : undefined;
  let category: ImageSupplierFailureCode;
  if (status === 401 || status === 403) category = "IMAGE_ACCESS_DENIED";
  else if (status === 429) category = "IMAGE_RATE_LIMITED";
  else if (status >= 500 || status === 408) category = "IMAGE_UPSTREAM_UNAVAILABLE";
  else if (["content_policy_violation", "content_filter", "safety_violation", "moderation_blocked"].includes(code)) category = "IMAGE_CONTENT_REJECTED";
  else if (["invalid_image", "invalid_image_format", "invalid_image_url", "image_too_large", "invalid_mask"].includes(code) || parameter && ["image", "image[]", "mask"].includes(parameter)) category = "IMAGE_INPUT_REJECTED";
  else if (["invalid_parameter", "invalid_argument", "unsupported_parameter", "unsupported_size", "invalid_size"].includes(code) || parameter && parameter !== "prompt") category = "IMAGE_PARAMETER_REJECTED";
  else category = "IMAGE_REQUEST_REJECTED";
  return { code: category, status, ...(parameter ? { parameter } : {}) };
}
