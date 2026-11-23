import {CANVAS_TEXT_CONTENT_LIMIT} from "./text-content";
/** Shared, bounded output policy. Never infer limits or token dialect from a model name. */
export type TextOutputPolicy = { maxTokens?: number; maxSupportedTokens?: number; tokenParameter?: "max_tokens" | "max_completion_tokens" };
export const CANVAS_TEXT_DEFAULT_OUTPUT_TOKENS = 8192;
export const CANVAS_TEXT_RESULT_LIMIT = CANVAS_TEXT_CONTENT_LIMIT;
export function canvasTextOutputBudget(policy?: TextOutputPolicy) {
  const positive = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) > 0;
  const requested = positive(policy?.maxTokens) ? policy.maxTokens : CANVAS_TEXT_DEFAULT_OUTPUT_TOKENS;
  const tokens = Math.min(requested, positive(policy?.maxSupportedTokens) ? policy.maxSupportedTokens : requested, 65_536);
  return policy?.tokenParameter === "max_completion_tokens" ? { max_completion_tokens: tokens } : { max_tokens: tokens };
}
export type PartialText = { text: string; operationId: string };
/** A failure is reusable only after billing proves its original identity and final outcome. */
export function partialCanvasText(data: unknown, operationId?: string | null): PartialText | undefined {
  const v = data as Record<string, unknown> | null;
  if (!operationId || !v || v.code !== "TEXT_OUTPUT_LIMIT" || v.terminal !== true || v.status !== "failed" ||
      v.operationId !== `tool-${operationId}` || !Number.isSafeInteger(v.chargedCredits) || Number(v.chargedCredits) < 0 ||
      typeof v.partialText !== "string" || !v.partialText.trim() || v.partialText.length > CANVAS_TEXT_RESULT_LIMIT) return;
  return { text: v.partialText, operationId };
}
