export type CanvasOutlineKind = "image" | "text" | "video" | "pending" | "group";
export type CanvasOutlineEntry = {
  id: string;
  title: string;
  kind: CanvasOutlineKind;
  detail: string;
  searchText: string;
  locked: boolean;
  state: "ready" | "draft" | "running" | "failed";
};
type OutlineNode = { id: string; type?: string; data: Record<string, unknown> };
const text = (value: unknown) => typeof value === "string" ? value : "";
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** An index of the current canvas only. Never reads a library or a different project. */
export function canvasOutlineEntries(nodes: readonly OutlineNode[]): CanvasOutlineEntry[] {
  const seen = new Set<string>();
  return nodes.flatMap(node => {
    if (!node.id || seen.has(node.id)) return [];
    seen.add(node.id);
    const d = node.data;
    const kind: CanvasOutlineKind = node.type === "workflowGroup" ? "group"
      : node.type === "text" || d.nodeKind === "text" ? "text"
      : node.type === "videoGeneration" || !!d.videoUrl ? "video"
      : node.type === "pend" || d.pending === true ? "pending" : "image";
    const title = (text(d.title) || text(d.label) || text(d.name) || text(d.content).split("\n")[0] || "").trim()
      || ({ image: "图片", text: "文本", video: "视频", pending: "待创作", group: "分组" }[kind]);
    const prompt = text(d.prompt), content = text(d.content);
    const running = d.generating === true || d.uploading === true || ["queued", "running", "submitting", "processing"].includes(text(d.status));
    const failed = !!d.generationFailure || d.needsAttention === true || ["failed", "error", "needs_attention"].includes(text(d.status));
    const state = failed ? "failed" : running ? "running" : kind === "pending" ? "draft" : "ready";
    const settings = d.settings as { locked?: boolean } | undefined;
    return [{ id: node.id, title: title.slice(0, 180), kind, detail: (prompt || content).replace(/\s+/g, " ").slice(0, 140),
      searchText: normalize([title, prompt, content, node.id].join(" ")), locked: settings?.locked === true || d.locked === true, state }];
  });
}

export function filterCanvasOutline(entries: readonly CanvasOutlineEntry[], query: string, kind: CanvasOutlineKind | "all" = "all") {
  const words = normalize(query).split(" ").filter(Boolean);
  return entries.filter(entry => (kind === "all" || entry.kind === kind) && words.every(word => entry.searchText.includes(word)));
}

export function canvasOutlineCounts(entries: readonly CanvasOutlineEntry[]) {
  const result = { all: entries.length, image: 0, text: 0, video: 0, pending: 0, group: 0 };
  for (const entry of entries) result[entry.kind]++;
  return result;
}
