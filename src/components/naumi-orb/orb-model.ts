import {ORB_STATES,type OrbState} from "@/lib/canvas/orb-contract";
export {ORB_STATES,type OrbState};
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
