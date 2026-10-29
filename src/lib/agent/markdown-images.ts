import { agentMediaUrl } from "./media-policy";

/** Preserve the Harness's deliberately small Markdown contract, not a general
 * Markdown parser. Each pass skips a failed label as a unit: every nested ![
 * before its first ] would fail at the same delimiter. Retrying the old global
 * regex at each unmatched opener made bounded model output quadratic. */
function replaceImages(text: string, reference: boolean): string {
  const parts: string[] = [];
  let scan = 0, copied = 0;
  while (scan < text.length) {
    const start = text.indexOf("![", scan);
    if (start < 0) break;
    const labelEnd = text.indexOf("]", start + 2);
    if (labelEnd < 0) break;
    scan = labelEnd + 1;
    if (text[scan] !== (reference ? "[" : "(")) continue;
    const bodyStart = scan + 1;
    const end = text.indexOf(reference ? "]" : ")", bodyStart);
    if (end < 0) break;
    // Inline URLs require at least one character; reference IDs may be empty.
    if (!reference && end === bodyStart) continue;
    const alt = text.slice(start + 2, labelEnd);
    const allowed = !reference && agentMediaUrl(text.slice(bodyStart, end), process.env.INTERNAL_APP_ORIGIN);
    parts.push(text.slice(copied, start), allowed ? text.slice(start, end + 1) : `[${alt || "图片"}]`);
    copied = scan = end + 1;
  }
  if (!parts.length) return text;
  parts.push(text.slice(copied));
  return parts.join("");
}

export function sanitizeAgentMarkdownImages(text: string): string {
  // Keep the original inline-then-reference order, including references exposed
  // inside a replaced inline label. Escapes/fences retain their old semantics.
  return replaceImages(replaceImages(text, false), true);
}
