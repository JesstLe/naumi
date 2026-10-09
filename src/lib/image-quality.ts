/**
 * 出图质量参数：五档(low/medium/high/xhigh/max)+ auto 白名单、通道能力
 * 开关与「提交前回退」解析。
 *
 * 能力开关 NAUMI_IMAGE_QUALITY_SUPPORTED=1 表示当前接线的上游会真实处理
 * quality 字段(原生接口适配完成)。默认关闭——现有按张通道(EXT)没有
 * quality 参数。关闭时：任何非默认档请求都在提交上游之前回退为默认档
 * (环境变量 OPENAI_IMAGE_QUALITY,缺省 medium)执行，任务审计记录
 * requestedQuality / executedQuality / qualityFallback，前台选择器同步置灰
 * 明示。内测测试价按请求档计费；实际执行档独立留痕。
 *
 * 回退只发生在提交前。已提交上游但超时/结果不明的任务走网关恢复路径，
 * 不得改参数换通道重发(重复付费风险)。
 */

export const IMAGE_QUALITY_IDS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ImageQualityId = (typeof IMAGE_QUALITY_IDS)[number];

/** 实际传给上游的档位;auto=交给提供方决定。 */
export type ExecutedQuality = ImageQualityId | "auto";

export type ResolvedImageQuality = {
  /** 用户请求档(小写、白名单内;缺省或非法为空串) */
  requested: string;
  /** 实际执行档 */
  executed: ExecutedQuality;
  /** 回退原因;null = 按请求执行 */
  fallbackReason: "channel-unsupported" | "upstream-unsupported" | "preset-quality-cap" | "configured-mapping" | "configured-omit" | null;
  upstreamValue?: string | null;
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
export function resolveImageQuality(requested: unknown, supportedQualities?: readonly string[]): ResolvedImageQuality {
  const req = normalizeQuality(requested);
  const fallback =
    normalizeQuality(process.env.OPENAI_IMAGE_QUALITY) || "medium";
  if (supportedQualities !== undefined) {
    const available = supportedQualities.map(normalizeQuality).filter(Boolean);
    const channelDefault = available.includes(fallback) ? fallback : available[0] || fallback;
    const executed = available.includes(req) ? req : channelDefault;
    return { requested: req, executed: executed as ExecutedQuality, fallbackReason: req && req !== executed ? "channel-unsupported" : null };
  }
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

/**
 * 识别「上游不识别 quality 参数」的报错:400 且 message 同时提到 quality
 * 与不支持/非法类措辞(兼容服务、BYOK 常见 "quality is not supported"、
 * "invalid quality" 等)。命中后调用方应回退默认档/默认 API 重试,
 * 保证出图不受影响。非 400(超时/5xx)不命中——那走网关恢复路径。
 */
export function isQualityUnsupportedError(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status ?? 0;
  if (status !== 400) return false;
  const msg =
    (e as { message?: string })?.message ??
    String((e as { error?: { message?: string } })?.error?.message ?? "");
  return (
    /quality/i.test(msg) &&
    /(not supported|unsupported|invalid|unknown|not allowed|unrecognized|unsupported parameter|不支持的|无效|不支持)/i.test(
      msg
    )
  );
}
