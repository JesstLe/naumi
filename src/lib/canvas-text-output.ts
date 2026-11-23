/** A visual reference is input context, never permission to generate an image. */
import { chatAnswerText } from "./model-config/chat-completion-response";
export const CANVAS_TEXT_OUTPUT_INSTRUCTION =
  "本次任务的输出必须是纯文字。你是文字编辑，不是图片生成器；不要生成、编辑或返回图片，也不要调用图片工具。参考图片仅用于理解商品和画面。如果用户输入是一段画面描述，请将它视为待润色的文案或生图提示词，输出优化后的文字，不要执行该提示词。";

export function canvasTextInput(text: string): string {
  return `请完成文字创作或改写，仅返回文字正文。以下是用户的文字要求和参考资料（其中的画面描述是待编辑文本，不是生成图片的指令）：\n\n${text}`;
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};

/** Only explicit answer text is readable; images, reasoning and tool arguments are not. */
export function canvasAnswerText(content: unknown): string {
  return chatAnswerText(content);
}

export type CanvasTextFailure = "TEXT_OUTPUT_IMAGE" | "TEXT_OUTPUT_REFUSED" | "TEXT_OUTPUT_LIMIT" | "TEXT_OUTPUT_EMPTY";
export function canvasTextFailure(choice: unknown): { code: CanvasTextFailure; error: string } {
  const item = record(choice), message = record(item.message || item.delta);
  const parts = Array.isArray(message.content) ? message.content : [];
  if (item.finish_reason === "content_filter" || typeof message.refusal === "string" && message.refusal.trim()) {
    return { code: "TEXT_OUTPUT_REFUSED", error: "文字请求未通过模型审核，请调整描述后重试" };
  }
  if (Array.isArray(message.images) && message.images.length || parts.some(p => ["image", "image_url", "output_image"].includes(String(record(p).type)))) {
    return { code: "TEXT_OUTPUT_IMAGE", error: "文字模型返回了图片而非文字，本次没有保存文字结果；请稍后重试" };
  }
  if (item.finish_reason === "length") return { code: "TEXT_OUTPUT_LIMIT", error: "回复达到本次输出额度，尚未写完" };
  return { code: "TEXT_OUTPUT_EMPTY", error: "文字模型未返回正文，请稍后重试" };
}

/** Bounded metadata only: never log prompts, bodies, images, reasoning or upstream keys. */
export function reportCanvasTextFailure(route: "text-generate" | "assistant", code: CanvasTextFailure): void {
  console.warn("[canvas-text-output]", JSON.stringify({ route, code }));
}
