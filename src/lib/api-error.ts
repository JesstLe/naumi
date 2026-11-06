// ---------------------------------------------------------------------------
// 错误净化:把上游(OpenAI/Replicate 等)或内部异常,统一转成**不泄露厂商/模型**
// 的友好中文提示。原则:catch 兜底绝不把原始 e.message 回传给前端 —— 那可能含
// "openai""gpt""quota""platform.openai.com" 等字样,会暴露我们用的模型。
//
// 用法:catch (e) { return NextResponse.json({ error: safeError(e, "生成失败,请稍后重试") }, ...) }
// ---------------------------------------------------------------------------

import { IMAGE_SUPPLIER_FAILURE_MESSAGES } from "./model-config/supplier-failure";

export function safeError(e: unknown, fallback = "服务繁忙,请稍后重试"): string {
  // The SDK preserves our typed channel error; only known static messages pass.
  // A supplier-provided message is never copied to the customer response.
  const error = e && typeof e === "object" ? e as { code?: unknown; error?: { code?: unknown } } : undefined;
  const code = error?.code || error?.error?.code;
  if (typeof code === "string" && Object.hasOwn(IMAGE_SUPPLIER_FAILURE_MESSAGES, code)) return IMAGE_SUPPLIER_FAILURE_MESSAGES[code as keyof typeof IMAGE_SUPPLIER_FAILURE_MESSAGES];
  const raw =
    e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const low = (raw || "").toLowerCase();

  // Preserve our fixed local admission messages, not an arbitrary supplier body.
  if (raw.includes("当前图片通道暂时不可用，请稍后再试；本次未提交生成，未扣积分"))
    return "当前图片服务暂时不可用，请稍后再试；本次未提交生成，未扣积分";
  if (raw.includes("当前图片请求较多，请稍后再试；本次未提交生成，未扣积分"))
    return "当前图片请求较多，请稍后再试；本次未提交生成，未扣积分";
  if (raw.includes("抠图通道尚未配置透明背景参数，请管理员在模型映射中设置；本次未提交，未扣积分"))
    return "抠图通道尚未配置透明背景参数，请管理员在模型映射中设置；本次未提交，未扣积分";

  // 配额 / 账单 / 限流 / 过载
  if (
    /quota|billing|insufficient|exceeded|rate.?limit|\b429\b|too many|capacity|overload|hard limit|spend|credit balance/.test(
      low
    )
  )
    return "生成服务繁忙,请稍后再试";

  // 内容安全 / 审核
  if (
    /safety|content.?polic|moderation|flagged|rejected by the safety|violat|nsfw|sensitive|not allowed/.test(
      low
    )
  )
    return "图片或描述未通过内容审核,请调整后重试";

  // 超时 / 网络 / 连不上
  if (
    /timeout|timed out|etimedout|econnreset|econnrefused|enotfound|network|socket|fetch failed|aborted|gateway|502|503|504/.test(
      low
    )
  ) {
    return "网络繁忙,请稍后重试";
  }

  // 其他:统一兜底,绝不回传原始 message(可能含厂商/模型信息)
  return fallback;
}
