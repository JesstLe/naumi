/** Untrusted editor-next clipboard -> inert, bounded canvas data. Never execute imported tools. */
export const WORKFLOW_CLIPBOARD_LIMIT = 8 * 1024 * 1024;
export const WORKFLOW_ELEMENT_LIMIT = 200;
type Raw = Record<string, unknown>;
export type ImportedElement = {
  sourceId: string; kind: "text" | "image" | "svg" | "path"; title: string;
  x: number; y: number; width: number; height: number; rotation: number; flipX: boolean; opacity: number;
  content: string; prompt: string; url: string; svg: string; path: string; fill: string; stroke: string; strokeWidth: number;
  previous: string[]; groupIds: string[]; modelLabel: string; parameters: Record<string, string | boolean | number>;
  textStyle: { fontSize: number; fontWeight: "400" | "600" | "700"; color: string | null; align: "left" | "center" | "right"; lineHeight: number };
};
export type WorkflowClipboard = {
  source: "gaoding"; version: string; nodes: ImportedElement[];
  groups: { sourceId: string; title: string; members: string[] }[];
  edges: { source: string; target: string }[]; missingReferences: number; scale: number;
};
export type ImportedManifest = {
  operationId: string; projectKey: string; source: "gaoding"; version: string;
  groups: { id: string; title: string; members: string[] }[];
  decorations: { id: string; image: string; x: number; y: number; width: number; height: number; rotation: number; flipX: boolean; opacity: number; groups: string[] }[];
  origins: { id: string; sourceId: string; modelLabel: string; parameters: ImportedElement["parameters"]; groups: string[]; rotation: number; flipX: boolean; opacity: number; missingAsset?: string; sourceWidth?: number; sourceHeight?: number }[];
};
const record = (v: unknown): Raw => v && typeof v === "object" && !Array.isArray(v) ? v as Raw : {};
const str = (v: unknown) => typeof v === "string" ? v : "";
const number = (v: unknown, fallback: number) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bound = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
function limited(v: unknown, max: number, field: string) { const s = str(v); if (s.length > max) throw new Error(`${field}过长，请分批复制`); return s; }
const sourceId = (n: Raw) => { const clip = record(record(n.metaInfo).$clipboard); return str(clip.sourceUuid) || str(record(clip.origin).uuid) || str(n.uuid); };

export function gaodingAssetUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
    !["dancf.com", "gaoding.com", "gaoding.art"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error("稿定素材地址不受支持");
  }
  url.hash = "";
  return url.href;
}

/** Does not read the system clipboard: only a user-initiated paste event supplies HTML. */
export function readWorkflowClipboard(html: string): WorkflowClipboard | null {
  if (!/data-app\s*=\s*["']editor-next["']/i.test(html)) return null;
  if (html.length > WORKFLOW_CLIPBOARD_LIMIT) throw new Error("工作流过大，请分批复制");
  const attr = /data-clipboard\s*=\s*["']([A-Za-z0-9+/=]+)["']/i.exec(html);
  if (!attr) throw new Error("工作流剪贴板数据不完整，请重新复制");
  let data: Raw;
  try {
    const bytes = Uint8Array.from(atob(attr[1]), c => c.charCodeAt(0));
    data = record(JSON.parse(decodeURIComponent(new TextDecoder("utf-8", { fatal: true }).decode(bytes))));
  } catch { throw new Error("工作流剪贴板格式不正确，请重新复制"); }
  if (!Array.isArray(data.elements) || !data.elements.length || !/^\d+\.\d+\.\d+$/.test(str(data.version))) throw new Error("工作流版本或节点列表不受支持");
  const nodes: ImportedElement[] = [], groups: WorkflowClipboard["groups"] = [], allIds = new Set<string>();
  let count = 0, totalText = 0;
  function visit(elements: unknown[], parents: string[], parentX = 0, parentY = 0, depth = 0) {
    if (depth > 16) throw new Error("工作流分组层级过深");
    for (const item of elements) {
      if (++count > WORKFLOW_ELEMENT_LIMIT) throw new Error("一次最多导入 200 个元素，请分批复制");
      const n = record(item), id = limited(sourceId(n), 200, "节点编号");
      if (!id || allIds.has(id)) throw new Error("工作流包含缺失或重复节点编号");
      allIds.add(id);
      const clip = record(record(n.metaInfo).$clipboard), absolute = record(clip.absolutePosition);
      const x = number(absolute.left, parentX + number(n.left, 0)), y = number(absolute.top, parentY + number(n.top, 0));
      const width = number(n.width, 300), height = number(n.height, 180);
      if (Math.abs(x) > 1e7 || Math.abs(y) > 1e7 || width <= 0 || height <= 0 || width > 1e6 || height > 1e6) throw new Error("工作流节点尺寸或坐标异常");
      const title = str(n.title).slice(0, 80), kind = str(n.type);
      if (kind === "group") {
        if (!Array.isArray(n.elements) || !n.elements.length) throw new Error("工作流包含空分组");
        const start = nodes.length;
        visit(n.elements, [...parents, id], x, y, depth + 1);
        groups.push({ sourceId: id, title: title || "分组", members: nodes.slice(start).map(node => node.sourceId) });
        continue;
      }
      if (!["text", "image", "svg", "path"].includes(kind)) throw new Error(`暂未适配节点类型：${kind || "未知"}`);
      const workflow = record(record(n.metaInfo).workflow), metadata = record(record(workflow.tool).metadata), parameters = record(metadata.parameters);
      const prompt = Array.isArray(metadata.prompt) ? metadata.prompt.map(v => { const p = record(v); return p.type === "text" ? str(p.content) : ""; }).filter(Boolean).join("\n") : str(parameters.prompt);
      const content = limited(n.content, kind === "svg" ? 300000 : 20000, "节点内容");
      totalText += content.length + prompt.length;
      if (totalText > 1000000) throw new Error("工作流文字过多，请分批复制");
      if (prompt.length > 4000) throw new Error("单节点提示词超过 4000 字，请缩短后复制");
      const previous = Array.isArray(workflow.previous) ? workflow.previous : [];
      if (previous.length > 200 || previous.some(p => typeof p !== "string" || p.length > 200)) throw new Error("工作流连线数据异常");
      const snapshot: ImportedElement["parameters"] = {};
      for (const key of ["resolution", "quality", "ratio", "mode", "duration", "sceneCode", "isNetwork", "skill", "styleCode"]) {
        const v = parameters[key];
        if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 200)) snapshot[key] = v;
      }
      const matrix = record(absolute.transform || n.transform), a = number(matrix.a, 1), b = number(matrix.b, 0), c = number(matrix.c, 0), d = number(matrix.d, 1);
      // Clipboard transforms operate around the element centre. Keep rotation/reflection as presentation only.
      if (Math.abs(a * c + b * d) > 0.01) throw new Error("倾斜变换暂未适配，请先取消倾斜");
      const flipX = a * d - b * c < 0, rotation = Math.atan2(flipX ? -b : b, flipX ? -a : a) * 180 / Math.PI;
      const effect = Array.isArray(n.pathEffects) ? record(n.pathEffects.find(e => record(e).enable === true)) : {};
      const color = /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(str(n.color)) ? str(n.color).slice(0, 7) : null;
      nodes.push({ sourceId: id, kind: kind as ImportedElement["kind"], title: title || (kind === "text" ? "文字" : "图片"),
        x, y, width, height, rotation, flipX, opacity: bound(number(n.opacity, 1), 0, 1),
        content: kind === "text" ? content : "", prompt, url: str(n.url) ? gaodingAssetUrl(limited(n.url, 4096, "素材地址")) : "",
        svg: kind === "svg" ? content : "", path: limited(n.path, 200000, "矢量路径"),
        fill: str(record(effect.filling).color) || "#ffffff", stroke: str(effect.color) || "#000000", strokeWidth: bound(number(effect.width, 0), 0, 1000),
        previous: [...new Set(previous as string[])], groupIds: [...parents], modelLabel: str(metadata.sceneCode).slice(0, 200), parameters: snapshot,
        textStyle: { fontSize: number(n.fontSize, 90), fontWeight: number(n.fontWeight, 400) >= 700 ? "700" : number(n.fontWeight, 400) >= 600 ? "600" : "400",
          color, align: n.textAlign === "right" || n.textAlign === "center" ? n.textAlign : "left", lineHeight: bound(number(n.lineHeight, 1.65), 1.2, 2.4) } });
    }
  }
  visit(data.elements, []);
  if (!nodes.length) throw new Error("工作流没有可导入的节点");
  const widths = nodes.filter(n => n.kind === "text").map(n => n.width).sort((a, b) => a - b);
  const scale = Math.min(1, widths.length ? 320 / widths[Math.floor(widths.length / 2)] : 320 / Math.max(...nodes.map(n => n.width)), 4096 / Math.max(...nodes.map(n => n.width)));
  const left = Math.min(...nodes.map(n => n.x)), top = Math.min(...nodes.map(n => n.y));
  for (const node of nodes) { node.x = (node.x - left) * scale; node.y = (node.y - top) * scale; node.width *= scale; node.height *= scale;
    if (node.width < 8 || node.height < 8 || node.width > 100000 || node.height > 100000) throw new Error("缩放后的节点尺寸超出范围");
    node.textStyle.fontSize = Math.round(bound(node.textStyle.fontSize * scale, 12, 72));
  }
  const leafIds = new Set(nodes.map(n => n.sourceId)), edges: WorkflowClipboard["edges"] = [];
  let missingReferences = 0;
  for (const node of nodes) for (const p of node.previous) { if (leafIds.has(p) && p !== node.sourceId) edges.push({ source: p, target: node.sourceId }); else missingReferences++; }
  // Parent/lineage data in Naumi is acyclic; do not silently invent or remove a cycle.
  const outgoing = new Map<string, string[]>(); for (const edge of edges) outgoing.set(edge.source, [...outgoing.get(edge.source) || [], edge.target]);
  const visiting = new Set<string>(), done = new Set<string>();
  function check(id: string) { if (visiting.has(id)) throw new Error("工作流包含循环连线，请解除循环后复制"); if (done.has(id)) return; visiting.add(id); for (const child of outgoing.get(id) || []) check(child); visiting.delete(id); done.add(id); }
  for (const id of leafIds) check(id);
  return { source: "gaoding", version: str(data.version), nodes, groups, edges, missingReferences, scale };
}
