/**
 * 出图质量参数：五档(low/medium/high/xhigh/max)+ auto 白名单、通道能力
 * 开关与「提交前回退」解析。
 *
 * 能力开关 NAUMI_IMAGE_QUALITY_SUPPORTED=1 表示当前接线的上游会真实处理
 * quality 字段(原生接口适配完成)。默认关闭——现有按张通道(EXT)没有
 * quality 参数。关闭时：任何非默认档请求都在提交上游之前回退为默认档
 * (环境变量 OPENAI_IMAGE_QUALITY,缺省 medium)执行，任务审计记录
 * requestedQuality / executedQuality / qualityFallback，前台选择器同步置灰
 * 明示。计费始终按实际执行档，不按请求档。
 *
 * 回退只发生在提交前。已提交上游但超时/结果不明的任务走网关恢复路径，
 * 不得改参数换通道重发(重复付费风险)。
 */

export const IMAGE_QUALITY_IDS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ImageQualityId = (typeof IMAGE_QUALITY_IDS)[number];

/** 实际传给上游并计费的档位;auto=交给提供方决定。 */
export type ExecutedQuality = ImageQualityId | "auto";

export type ResolvedImageQuality = {
  /** 用户请求档(小写、白名单内;缺省或非法为空串) */
  requested: string;
  /** 实际执行档 */
  executed: ExecutedQuality;
  /** 回退原因;null = 按请求执行 */
  fallbackReason: "channel-unsupported" | null;
};

/** 当前通道是否真实支持质量参数(接线的上游会处理 quality 字段)。 */
export function imageQualityCapable(): boolean {
  return (process.env.NAUMI_IMAGE_QUALITY_SUPPORTED || "").trim() === "1";
}

function normalizeQuality(value: unknown): string {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (IMAGE_QUALITY_IDS as readonly string[]).includes(v) || v === "auto"
    ? v
    : "";
}

/**
 * 解析一次生成请求的质量参数。
 * - 通道支持:按请求执行(auto/空串回退到环境默认)。
 * - 通道不支持:一律按默认档执行,并标记回退原因;请求值仅入审计。
 */
export function resolveImageQuality(requested: unknown): ResolvedImageQuality {
  const req = normalizeQuality(requested);
  const fallback =
    normalizeQuality(process.env.OPENAI_IMAGE_QUALITY) || "medium";
  if (imageQualityCapable()) {
    return {
      requested: req,
      executed: (req || fallback) as ExecutedQuality,
      fallbackReason: null,
    };
  }
  return {
    requested: req,
    executed: fallback as ExecutedQuality,
    fallbackReason: req && req !== fallback ? "channel-unsupported" : null,
  };
}
