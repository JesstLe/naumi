import { canvasTextContent } from "./text-content";

/** Only direct, explicit edges are inputs. Position and upstream edges are not. */
export type LinkedImageTextNode = {
  id: string;
  projectKey: string;
  title?: string;
  content?: string | null;
  prompt?: string | null;
  status?: string;
  targetIds?: readonly string[];
  busy?: boolean;
};

export type LinkedImageTextSource = {
  id: string;
  title: string;
  content: string;
};

export type LinkedImageTextResult = {
  sources: LinkedImageTextSource[];
  prompt: string;
  error: string | null;
};

/**
 * Resolve at display/submission time; the composed prompt is never a draft.
 * Pending-node IDs lead, then direct target edges follow node-list order.
 * An invalid explicit source fails the whole input rather than silently
 * producing a different image from a partial prompt.
 */
export function resolveLinkedImageText(input: {
  nodes: readonly LinkedImageTextNode[];
  targetId: string;
  projectKey: string;
  explicitTextIds?: readonly string[];
  draft: string;
  fallback?: string;
}): LinkedImageTextResult {
  const byId = new Map<string, LinkedImageTextNode>();
  for (const node of input.nodes) {
    if (!byId.has(node.id)) byId.set(node.id, node);
  }

  const ids = new Set(input.explicitTextIds ?? []);
  for (const node of input.nodes) {
    if (input.targetId && node.targetIds?.includes(input.targetId)) ids.add(node.id);
  }

  const sources: LinkedImageTextSource[] = [];
  let error: string | null = null;
  for (const id of ids) {
    const node = byId.get(id);
    if (!node) {
      error ??= "关联的文字节点已失效，请重新连接";
      continue;
    }
    if (node.projectKey !== input.projectKey) {
      error ??= "关联的文字节点不在当前画布，请重新连接";
      continue;
    }

    // Explicitly empty content is an edit, not a reason to revive AI writing
    // instructions. Keep legacy prompt-only nodes compatible with the shared
    // reader without changing the node or the shared reader's other callers.
    const content = canvasTextContent({
      ...node,
      prompt: node.content !== undefined ? "" : node.prompt,
    });
    sources.push({ id: node.id, title: node.title?.trim() || "文字节点", content });
    if (node.status === "generating") {
      error ??= "关联的文字节点仍在生成，请完成后再试";
    } else if (node.busy || node.status === "saving") {
      error ??= "关联的文字节点正在保存，请完成后再试";
    }
  }

  if (error) return { sources, prompt: "", error };
  const linkedPrompt = sources.map(source => source.content.trim()).filter(Boolean).join("\n\n");
  const draft = input.draft.trim();
  // Old spawn paths copied the entire linked body into the draft once. Only
  // that exact whole-body match is redundant; never remove individual source
  // paragraphs or user text, and never deduplicate different source IDs.
  const prompt = linkedPrompt && draft === linkedPrompt
    ? linkedPrompt
    : [linkedPrompt, draft].filter(Boolean).join("\n\n");
  return { sources, prompt: prompt || input.fallback?.trim() || "", error: null };
}
