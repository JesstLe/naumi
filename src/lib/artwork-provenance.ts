/** Creation provenance is immutable and independent from mutable canvas origin. */
export type ArtworkProvenance = {
  version: 1;
  operation: string;
  entry: string;
  ref: string;
  sourceArtworkId?: string;
  evidence: string;
};

export const operationLabels: Record<string, string> = {
  generate: "生成图片", suite: "生成套图", aplus: "A+ 详情图", upload: "上传图片",
  copy: "复制作品", import: "导入图片", template: "模板导入", restore: "恢复作品",
  cutout: "智能抠图", upscale: "高清放大", printfile: "印花文件", extract: "提取印花",
  retouch: "商品精修", recolor: "产品换色", replicate: "图片复刻", style: "风格转换",
  garment: "服装精修", garment3d: "3D 服装图", avatar: "生成模特", dewrinkle: "服装去皱",
  dewatermark: "去水印", inpaint: "局部重绘", tryon: "模特试穿", packaging3d: "3D 包装",
  "title-gen": "文案生成", "canvas-text-edit": "画布改字", "canvas-expand": "画布扩图",
  "canvas-annotate": "画布标注", "canvas-stitch": "画布拼图", video: "生成视频",
  "video-extract": "视频提帧", comfyui: "工作流生成", "server-save": "保存作品",
  "canvas-add": "加入画布（操作待核验）",
  "canvas-crop": "本地裁剪", "canvas-replace": "替换图片版本",
  derived: "派生操作（具体操作待核验）",
  "print-operation": "印花处理（具体工具待核验）",
};
export const entryLabels: Record<string, string> = {
  canvas: "画布", generate: "生图页", toolbox: "工具箱", agent: "智能助手",
  genchat: "生图对话", works: "作品库", competitor: "竞品素材", template: "模板库",
  video: "视频工作台", restore: "恢复接口", server: "服务端",
};
export function provenanceEntry(value: unknown, fallback = "server"): string {
  return typeof value === "string" && Object.hasOwn(entryLabels, value) ? value : fallback;
}
export function creationProvenance(input: {
  id: string; batchId?: string | null; templateId?: string | null;
  explicit?: ArtworkProvenance | null; path?: string; operationId?: string;
  entry?: string;
}): ArtworkProvenance {
  const p = input.explicit;
  if (p?.version === 1 && p.operation && p.entry && p.ref && p.evidence) return p;
  const batch = String(input.batchId || "");
  const prefixOperations: Record<string, string> = { "b-": "generate", "suite-": "suite", "aplus-": "aplus", "retouch-": "retouch", "recolor-": "recolor", "up-": "upscale", "dwk-": "dewrinkle", "dwm-": "dewatermark", "avt-": "avatar", "d3d-": "garment3d", "prt-": "print-operation", "txtedit-": "canvas-text-edit", "vid-": "video", "comfy-": "comfyui" };
  const prefix = Object.keys(prefixOperations).find(key => batch.startsWith(key));
  const operation = input.path?.replace(/^\/api\//, "").replace(/\//g, "-") || (prefix ? prefixOperations[prefix] : undefined) || (input.templateId ? "template" : "server-save");
  const entry = input.entry || (input.path?.startsWith("/api/canvas/") ? "canvas" : input.path?.includes("generate-image") ? "generate" : input.path ? "toolbox" : "server");
  return {
    version: 1,
    operation,
    entry: provenanceEntry(entry),
    ref: input.operationId || input.batchId || input.templateId || input.id,
    evidence: input.path ? "server-route" : "server-save",
  };
}

/** Only exact, owner-scoped job joins and unambiguous stored markers count. */
export function resolveArtworkProvenance(row: Record<string, unknown>): ArtworkProvenance | null {
  const p = row.creation_provenance as ArtworkProvenance | null;
  if (p?.version === 1 && p.operation && p.entry && p.ref && p.evidence) return p;
  const id = String(row.id), source = String(row.source_url || "");
  const image = String(row.image_url || "");
  const uploadedFilename = /(?:^|\/)canvas-uploads\/([^/?]+)\.[a-z0-9]+(?:\?|$)/i.exec(image)?.[1];
  if (source === "upload" || uploadedFilename === id)
    return { version: 1, operation: "upload", entry: "canvas", ref: id, evidence: "legacy-upload-marker" };
  if (row.job_id) {
    const origin = row.job_origin;
    // A historical blank origin does not prove which page made the request.
    const entry = origin === "canvas" ? "canvas" : provenanceEntry(row.job_entry, "server");
    return { version: 1, operation: String(row.job_kind), entry, ref: String(row.job_id), evidence: "legacy-owner-job-join" };
  }
  if (row.canvas_task_id)
    return { version: 1, operation: `canvas-${row.canvas_task_kind}`, entry: "canvas", ref: String(row.canvas_task_id), evidence: "legacy-owner-canvas-task-join" };
  if (row.video_task_id)
    return { version: 1, operation: "video", entry: provenanceEntry(row.video_task_source, "video"), ref: String(row.video_task_id), evidence: "legacy-owner-video-task-join" };
  if (row.template_id && id.startsWith("tplroot-"))
    return { version: 1, operation: "template", entry: "template", ref: String(row.template_id), evidence: "legacy-template-root" };
  if (source === "derived")
    return { version: 1, operation: "derived", entry: "canvas", ref: id, evidence: "legacy-derived-marker" };
  if (source === "canvas-add")
    return { version: 1, operation: "canvas-add", entry: "canvas", ref: id, evidence: "legacy-canvas-add-marker" };
  const batch = String(row.batch_id || "");
  // These prefixes are emitted by the matching server routes, not UI titles.
  const prefixes: Record<string, string> = { "retouch-": "retouch", "recolor-": "recolor", "up-": "upscale", "dwk-": "dewrinkle", "dwm-": "dewatermark", "avt-": "avatar", "d3d-": "garment3d", "prt-": "print-operation" };
  const prefix = Object.keys(prefixes).find(key => batch.startsWith(key));
  if (prefix) return { version: 1, operation: prefixes[prefix], entry: "server", ref: batch, evidence: "legacy-server-batch-prefix" };
  return null;
}

export function artworkBiPresentation(row: Record<string, unknown>) {
  const p = resolveArtworkProvenance(row);
  const w = Number(row.image_width), h = Number(row.image_height);
  const pixels = Number.isInteger(w) && w > 0 && Number.isInteger(h) && h > 0 ? `${w}×${h}` : "";
  const grade = String(row.resolution || "");
  const operation = p ? operationLabels[p.operation] || p.operation : "历史操作待核验";
  const entry = p ? entryLabels[p.entry] || p.entry : "";
  const upload = p?.operation === "upload";
  return {
    operation_label: operation,
    source_label: p ? p.entry === "server" ? `${operation}（入口待核验）` : `${entry} · ${operation}` : row.origin === "canvas" ? "画布归属 · 创建来源待核验" : "历史记录待核验",
    provenance_ref: p?.ref || String(row.id),
    provenance_evidence: p?.evidence || "legacy-insufficient-evidence",
    provenance_status: p?.evidence === "server-route" || p?.evidence === "server-save" ? "创建时记录" : p ? "历史证据识别" : "待核验",
    source_artwork_id: p?.sourceArtworkId || null,
    dimensions: pixels ? grade && !upload ? `${pixels}（${grade}）` : pixels : grade || "尺寸待核验",
    prompt_display: row.prompt || (upload ? "不适用：上传文件" : p?.operation === "copy" || p?.operation === "import" || p?.operation === "template" ? "不适用：导入 / 复制" : "未保存提示词"),
  };
}
