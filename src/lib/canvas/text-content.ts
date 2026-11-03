/** Text content and AI instructions are different values. Legacy idle nodes
 * may contain only a prompt; after editing (including clearing), content wins. */
export function canvasTextContent(node: { content?: string | null; prompt?: string | null; status?: string }): string {
  if (node.content) return node.content;
  return node.status === "idle" || node.status === undefined ? node.prompt || "" : "";
}

export const CANVAS_TEXT_CONTENT_LIMIT = 12_000;
export const CANVAS_TEXT_INSTRUCTION_LIMIT = 4_000;

/** Millisecond equality must not let an earlier save ACK replace a later draft. */
export function nextCanvasTextTimestamp(previous?: string): string {
  const before = Date.parse(previous || "");
  return new Date(Math.max(Date.now(), Number.isFinite(before) ? before + 1 : 0)).toISOString();
}
