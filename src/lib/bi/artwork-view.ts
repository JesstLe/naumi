import type { BiRow } from "./contracts";

/** One column order for admin and enterprise artwork views and CSV. */
export const ARTWORK_COLUMNS = [
  { key: "created_at", label: "创建时间", format: "time" as const },
  { key: "email", label: "账户" },
  { key: "title", label: "作品" },
  { key: "operation_label", label: "创建操作" },
  { key: "dimensions", label: "图片尺寸" },
  { key: "source_label", label: "创建来源" },
  { key: "provenance_status", label: "溯源状态" },
  { key: "provenance_ref", label: "来源编号" },
  { key: "prompt_display", label: "提示词 / 操作内容" },
];
export function artworkValue(value: unknown, time = false): string {
  if (value === null || value === undefined || value === "" || value === "unrecorded") return "未记录";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (time) { const date = new Date(String(value)); return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "未记录"; }
  return String(value);
}
export const ARTWORK_DETAIL_LABELS: Record<string, string> = {
  id: "记录 ID", email: "账户", title: "作品", created_at: "创建时间", prompt: "原始提示词", prompt_display: "提示词 / 操作内容",
  operation_label: "创建操作", source_label: "创建来源", dimensions: "实际图片尺寸", image_width: "图片宽度", image_height: "图片高度",
  provenance_status: "溯源状态", provenance_ref: "来源事件 / 任务编号", provenance_evidence: "溯源证据", source_artwork_id: "复制源作品编号",
  origin: "当前画布标记（非创建来源）", category: "类别", status: "状态", ratio: "比例", resolution: "分辨率", deleted_at: "回收时间",
  parent_id: "上游作品 ID", batch_id: "批次 ID", job_id: "任务 ID", canvas_task_id: "画布任务 ID", video_task_id: "视频任务 ID", template_id: "模板编号",
};
export const artworkDetailEntries = (row: BiRow) => Object.entries(row).filter(([key]) => !["has_image", "has_video"].includes(key));

/** Same status/category labels used by the admin detail drawer. */
export const ARTWORK_DETAIL_VALUES: Record<string, string> = {
  generate: "生图", suite: "套图", aplus: "A+", video: "视频", "canvas-text-edit": "画布改字",
  main: "商品主图", scene: "场景图", detail: "详情图", retouch: "商品精修", upload: "导入图片",
  queued: "排队", processing: "执行中", pending: "处理中", done: "完成", completed: "完成", error: "失败", failed: "失败", needs_attention: "待核查",
};
export function artworkDetailValue(field: string, value: unknown): string {
  return ["category", "status"].includes(field) && ARTWORK_DETAIL_VALUES[String(value)] || artworkValue(value, field.endsWith("_at"));
}
