import { unified } from "unified";
import remarkParse from "remark-parse";

export type AssistantContentPart = { kind: "markdown" | "generate"; content: string };
type PositionedNode = { type: string; children?: PositionedNode[]; position?: { start: { offset?: number }; end: { offset?: number } } };
const parser = unified().use(remarkParse);

/** Legacy action markers are recognized only outside Markdown code and HTML. */
export function splitAssistantContent(content: string): AssistantContentPart[] {
  const protectedRanges: [number, number][] = [];
  function visit(node: PositionedNode) {
    if (["code", "inlineCode", "html", "link", "image"].includes(node.type) && node.position) {
      protectedRanges.push([node.position.start.offset ?? 0, node.position.end.offset ?? 0]);
    } else node.children?.forEach(visit);
  }
  visit(parser.parse(content) as PositionedNode);
  const protectedAt = (index: number) => protectedRanges.some(([start, end]) => index >= start && index < end);
  const parts: AssistantContentPart[] = [];
  const marker = /\[\[GEN\]\]([\s\S]*?)\[\[\/GEN\]\]/g;
  let cursor = 0;
  for (const match of content.matchAll(marker)) {
    const index = match.index!;
    if (protectedAt(index) || protectedAt(index + match[0].length - 1)) continue;
    if (index > cursor) parts.push({ kind: "markdown", content: content.slice(cursor, index) });
    if (match[1].trim()) parts.push({ kind: "generate", content: match[1].trim() });
    cursor = index + match[0].length;
  }
  let tail = content.slice(cursor);
  const pending = tail.indexOf("[[GEN]]");
  if (pending >= 0 && !protectedAt(cursor + pending)) tail = tail.slice(0, pending);
  const partial = /\[\[(?:G(?:E(?:N(?:\])?)?)?)?$/.exec(tail);
  if (partial && !protectedAt(cursor + partial.index)) tail = tail.slice(0, partial.index);
  if (tail) parts.push({ kind: "markdown", content: tail });
  return parts;
}

export function assistantUrl(value: string, key = "href") {
  const url = value.trim();
  if (!url || /[\u0000-\u0020\\]/.test(url)) return "";
  if (key === "src") return /^\/(?:media|api\/media|uploads)\//.test(url) ? url : "";
  return /^(https?:\/\/|mailto:)/i.test(url) || /^\/(?!\/)/.test(url) || url.startsWith("#") ? url : "";
}
