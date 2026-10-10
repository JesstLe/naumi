export const ORB_STATES = [
  { key: "idle", id: "02", label: "待机", en: "Idle" },
  { key: "curious", id: "03", label: "好奇", en: "Curious" },
  { key: "happy", id: "10", label: "开心", en: "Happy" },
  { key: "thinking", id: "30", label: "思考", en: "Thinking" },
  { key: "searching", id: "40", label: "检索", en: "Searching" },
  { key: "working", id: "32", label: "处理中", en: "Working" },
  { key: "done", id: "33", label: "完成", en: "Done" },
  { key: "error", id: "34", label: "出错", en: "Error" },
] as const;

export type OrbState = typeof ORB_STATES[number]["key"];
export const ORB_THEMES = {
  naumi: { label: "石墨", en: "Graphite", body: "#181b23", eyes: "#e8ff6f", accent: "#e8ff6f" },
  indigo: { label: "靛蓝", en: "Indigo", body: "#4f46e5", eyes: "#f8f7ff", accent: "#bdb8ff" },
  pearl: { label: "珍珠", en: "Pearl", body: "#e5e6e9", eyes: "#282b36", accent: "#e5e6e9" },
} as const;
export type OrbTheme = keyof typeof ORB_THEMES;

export function gazeFromPoint(x: number, y: number, rect: { left: number; top: number; width: number; height: number }) {
  const finite = (n: number) => Number.isFinite(n) ? n : 0;
  const clamp = (n: number) => Math.max(-1, Math.min(1, finite(n)));
  // A broad target range keeps the movement gentle even in the 64px companion.
  return {
    x: clamp((x - rect.left - rect.width / 2) / Math.max(rect.width, 200)),
    y: clamp((y - rect.top - rect.height / 2) / Math.max(rect.height, 200)),
  };
}

export function orbCanAnimate(motion: boolean, reduced: boolean, visible: boolean, pageVisible: boolean, thumbnail: boolean) {
  return motion && !reduced && visible && pageVisible && !thumbnail;
}
