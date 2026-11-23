import "server-only";
import { currentModelExecution } from "../model-config/context";
import { canvasTextOutputBudget, CANVAS_TEXT_RESULT_LIMIT } from "./text-output-policy";
import { recordSynchronousTextFailure } from "../billing/synchronous-operation";
export const canvasTextBudget = (vision = false) => canvasTextOutputBudget(currentModelExecution(vision ? "vision" : "text")?.parameterMap.textOutput);
/** Supplier acceptance and usable output are separate facts. Keep supplier usage/cost evidence. */
export function incompleteCanvasText(text: string, textProject = "", finishReason:"length"|"node_limit" = "length") {
  const partialText = text.slice(0, CANVAS_TEXT_RESULT_LIMIT);
  recordSynchronousTextFailure();
  return { code: "TEXT_OUTPUT_LIMIT", error: finishReason === "node_limit" ? "回复已达单节点文字长度上限，已保留生成内容" : partialText.trim() ? "回复尚未写完，已保留生成内容" : "本次回复未产出可用正文，可重新生成", finishReason, textProject, ...(partialText.trim() ? { partialText } : {}) };
}
