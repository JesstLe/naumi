export const ORB_STATES = [
  { key: "sleeping", id: "00", label: "睡眠", en: "Sleeping" },
  { key: "waking", id: "01", label: "唤醒", en: "Waking" },
  { key: "idle", id: "02", label: "待机", en: "Idle" },
  { key: "curious", id: "03", label: "好奇", en: "Curious" },
  { key: "daydreaming", id: "04", label: "放空", en: "Daydreaming" },
  { key: "booting", id: "05", label: "苏醒", en: "Booting" },
  { key: "drowsy", id: "06", label: "休眠", en: "Drowsy" },
  { key: "jolted", id: "07", label: "抖动唤醒", en: "Jolted" },
  { key: "happy", id: "10", label: "开心", en: "Happy" },
  { key: "puzzled", id: "11", label: "疑惑", en: "Puzzled" },
  { key: "sad", id: "12", label: "失落", en: "Sad" },
  { key: "surprised", id: "13", label: "惊喜", en: "Surprised" },
  { key: "shy", id: "14", label: "害羞", en: "Shy" },
  { key: "tired", id: "15", label: "疲惫", en: "Tired" },
  { key: "focused", id: "16", label: "专注", en: "Focused" },
  { key: "flustered", id: "17", label: "慌张", en: "Flustered" },
  { key: "resigned", id: "18", label: "无奈", en: "Resigned" },
  { key: "content", id: "19", label: "满意", en: "Content" },
  { key: "confused", id: "20", label: "困惑", en: "Confused" },
  { key: "frustrated", id: "21", label: "懊恼", en: "Frustrated" },
  { key: "thinking", id: "30", label: "思考", en: "Thinking" },
  { key: "receiving", id: "31", label: "接收任务", en: "Receiving" },
  { key: "working", id: "32", label: "处理中", en: "Working" },
  { key: "done", id: "33", label: "完成", en: "Done" },
  { key: "error", id: "34", label: "出错", en: "Error" },
  { key: "waiting", id: "35", label: "等待输入", en: "Waiting" },
  { key: "connecting", id: "36", label: "连接中", en: "Connecting" },
  { key: "remembering", id: "37", label: "回忆", en: "Remembering" },
  { key: "restricted", id: "38", label: "受限", en: "Restricted" },
  { key: "replying", id: "39", label: "回复中", en: "Replying" },
  { key: "searching", id: "40", label: "检索", en: "Searching" },
  { key: "stopped", id: "41", label: "已停止", en: "Stopped" },
] as const;

export type OrbState = typeof ORB_STATES[number]["key"];
export const ORB_THEMES = {
  naumi: { label: "石墨", en: "Graphite", body: "#181b23", eyes: "#f5f5f7", accent: "#d9dce5" },
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
