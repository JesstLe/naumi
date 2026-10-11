import type { OrbState } from "../../components/naumi-orb/orb-model";

export type AgentOrbOutcome = "idle" | "running" | "done" | "error" | "stopped";
export interface AgentOrbStep { id: string; tool?: string; label: string; status: "running" | "done" | "error" }
export function agentOrbState(busy: boolean, outcome: AgentOrbOutcome, steps: AgentOrbStep[]): OrbState {
  if (!busy) return outcome === "done" ? "done" : outcome === "error" ? "error" : "idle";
  const running = [...steps].reverse().find(step => step.status === "running");
  return running ? running.tool === "search_templates" ? "searching" : "working" : "thinking";
}
export function restoredOrbOutcome(session: { running?: boolean; status?: string; error?: unknown }): AgentOrbOutcome {
  if (session.running) return "running";
  if (session.status === "stopped") return "stopped";
  if (session.error || session.status === "failed") return "error";
  return session.status === "completed" ? "done" : "idle";
}

export interface OrbPoint { x: number; y: number }
export interface OrbBounds { left: number; top: number; right: number; bottom: number }
export const ORB_WIDTH = 88;
export const ORB_HEIGHT = 112;
export const ORB_EDGE_GAP = 8;
// Use the whole canvas viewport. Keep only a small edge gap and the full status label visible.
export function orbBounds(width: number, height: number): OrbBounds {
  const right = Math.max(0, width - ORB_WIDTH - ORB_EDGE_GAP), left = Math.min(ORB_EDGE_GAP, right);
  const bottom = Math.max(0, height - ORB_HEIGHT - ORB_EDGE_GAP);
  return { left, right, top: Math.min(ORB_EDGE_GAP, bottom), bottom };
}
export function clampOrb(point: OrbPoint, bounds: OrbBounds): OrbPoint {
  return { x: Math.max(bounds.left, Math.min(bounds.right, point.x)), y: Math.max(bounds.top, Math.min(bounds.bottom, point.y)) };
}
export function orbPixels(point: OrbPoint, bounds: OrbBounds): OrbPoint {
  return { x: bounds.left + point.x * (bounds.right - bounds.left), y: bounds.top + point.y * (bounds.bottom - bounds.top) };
}
export function orbFraction(point: OrbPoint, bounds: OrbBounds): OrbPoint {
  const clamped = clampOrb(point, bounds);
  return { x: (clamped.x - bounds.left) / (bounds.right - bounds.left || 1), y: (clamped.y - bounds.top) / (bounds.bottom - bounds.top || 1) };
}
export function readOrbPosition(raw: string | null): OrbPoint {
  try {
    const point = JSON.parse(raw || "null");
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) return { x: point.x, y: point.y };
  } catch { /* Unavailable or outdated storage must not break the canvas. */ }
  return { x: 1, y: .18 };
}
export function orbPositionKey(email: string) { return `naumi:canvas-agent-orb:v1:${encodeURIComponent(email.toLowerCase())}`; }
