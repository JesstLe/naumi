import { createHash, randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { BillingError } from "../billing/types";
import { ModelConfigError } from "../model-config/types";
import {FeatureAccessError} from "@/lib/feature-access/repository";
import { ExactImageSizeError } from "../imagegen/request-size";
import { ImagegenPlanError } from "../imagegen/plan-error";
import { WorkbenchError } from "./contract";

export type WorkbenchStage = "quote" | "submit" | "request";
const modelMessages: Record<string, [number, string]> = {
  MODEL_OUTSIDE_TOOL_SCOPE: [400, "所选模型未开放给当前工具，请重新选择模型"],
  MODEL_UNAVAILABLE: [409, "所选模型暂不可用，请刷新模型列表"],
  INVALID_REQUEST: [400, "模型请求参数无效，请检查生成参数"],
  CONFIG_PREPARING: [503, "模型配置正在准备，请稍后重新报价"],
};
const billingMessages: Record<string, [number, string]> = {
  INSUFFICIENT_CREDITS: [402, "可用积分不足，请检查余额"],
  PRICE_CHANGED: [409, "积分报价已变化，请重新确认报价"],
  AUTHORIZATION_EXCEEDED: [409, "本次任务超出已确认的积分额度，请重新确认报价"],
  CONFIG_UNAVAILABLE: [503, "积分报价暂不可用，请稍后重新报价"],
  CONFIG_CONFLICT: [409, "积分配置已变化，请重新确认报价"],
};

export function workbenchFailure(error: unknown, stage: WorkbenchStage, action: string) {
  const traceId = `wb-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  let status = 500, code = "WORKBENCH_INTERNAL", message = stage === "quote"
    ? "报价暂时失败，本次未发起新的生成提交。请稍后重新报价"
    : stage === "submit" ? "提交结果待核查，请查询原任务，勿重复提交" : "操作暂时失败，请稍后再试";
  if (error instanceof WorkbenchError) { status = error.status; code = "WORKBENCH_REQUEST"; message = error.message; }
  else if (error instanceof ExactImageSizeError) { status = 400; code = error.code; message = error.message; }
  else if (error instanceof ImagegenPlanError) { status = error.status; code = error.code; message = error.message; }
  else if (error instanceof ZodError) { status = 400; code = "INVALID_REQUEST"; message = "请求格式或生成参数无效，请检查后再提交"; }
  else if (error instanceof FeatureAccessError) { status = 403; code = "FEATURE_ACCESS_DENIED"; message = "此功能尚未授权"; }
  else if (error instanceof ModelConfigError) {
    [status, message] = modelMessages[error.code] || [503, "模型配置暂不可用，请联系管理员并提供错误编号"];
    code = modelMessages[error.code] ? error.code : "MODEL_CONFIG_UNAVAILABLE";
  } else if (error instanceof BillingError) {
    [status, message] = billingMessages[error.code] || [409, "积分报价校验未通过，请联系管理员并提供错误编号"];
    code = billingMessages[error.code] ? error.code : "BILLING_QUOTE_REJECTED";
  }
  // Log only a closed vocabulary and one-way signature. Never log request bodies,
  // prompts, account IDs, URLs, credentials or a supplier/database error message.
  const signature = createHash("sha256").update(error instanceof Error ? `${error.name}\n${error.stack || error.message}` : typeof error).digest("hex").slice(0, 24);
  const knownAction = ["quote", "workbench/start", "workbench/infer-prompts", "workbench/edit", "single/start", "chat-image/send", "chat-image/confirm"].includes(action) ? action : "other";
  console.error("reference-workbench.failure", { traceId, stage, action: knownAction, code, status, signature });
  return { status, body: { ok: false, error: message, detail: message, code, stage, traceId } };
}
