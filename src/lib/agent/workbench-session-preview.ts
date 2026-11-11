import { agentMediaUrl } from "./media-policy";
import type { WorkbenchMessage, WorkbenchSessionSummary } from "./workbench-contract";

export type WorkbenchSessionPreview = {
  image?: string;
  status: "empty" | "reference" | "ready" | "generating" | "failed" | "stopped";
};
const imageTools = /^(?:generate_image|edit_image|retouch_product|recolor_product|replicate_hot|remove_background|upscale_image|cutout_image|inpaint_image|fuse_images|try_on_clothes)$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function imageUrl(value: unknown): string {
  return typeof value === "string" && !/\.(?:mp4|webm|mov|m4v|mp3|wav)(?:\?|$)/i.test(value) ? agentMediaUrl(value) : "";
}

/** One read-only projection for persisted events and live message steps. Never
 * starts jobs, uses arbitrary external URLs, or treats a reference as a result. */
export function workbenchSessionPreview(messages: unknown, events: unknown = []): WorkbenchSessionPreview {
  let image = "", reference = "";
  let status: WorkbenchSessionPreview["status"] = "empty";
  const visit = (step: Record<string, unknown>) => {
    if (step.type === "error" && status === "generating") { status = "failed"; return; }
    if (step.type === "agent_end" && status === "generating") { status = "stopped"; return; }
    const tool = typeof step.tool === "string" ? step.tool : "";
    const urls = Array.isArray(step.outputs) ? step.outputs.map(imageUrl).filter(Boolean) : [];
    if (urls.length) { image = urls.at(-1)!; status = "ready"; }
    if (!imageTools.test(tool)) return;
    if (step.type === "tool_start" || step.status === "running") status = "generating";
    else if (step.isError === true || step.status === "error") status = "failed";
    else if (step.status === "stopped") status = "stopped";
    else if (step.type === "tool_end" || step.status === "done") status = image ? "ready" : "empty";
  };
  for (const value of Array.isArray(messages) ? messages : []) {
    if (!record(value)) continue;
    const content = typeof value.content === "string" ? value.content : "";
    if (value.role === "user") {
      for (const match of content.matchAll(/^\[商品图\]\s*(\S+)$/gm)) reference = imageUrl(match[1]) || reference;
      continue;
    }
    if (value.role !== "assistant") continue;
    for (const match of content.matchAll(/!\[[^\]]*\]\(([^\s)]+)\)/g)) {
      const url = imageUrl(match[1]);
      if (url) { image = url; status = "ready"; }
    }
    for (const step of Array.isArray(value.steps) ? value.steps : []) if (record(step)) visit(step);
  }
  for (const event of Array.isArray(events) ? events : []) if (record(event)) visit(event);
  return { ...(image || reference ? { image: image || reference } : {}), status: status === "empty" && reference ? "reference" : status };
}

export function sortWorkbenchSessions(sessions: WorkbenchSessionSummary[]): WorkbenchSessionSummary[] {
  const time = (value?: string | null) => value ? new Date(value).getTime() || 0 : 0;
  return [...sessions].sort((a, b) => Number(!!b.pinnedAt) - Number(!!a.pinnedAt) || time(b.pinnedAt) - time(a.pinnedAt) || time(b.updatedAt) - time(a.updatedAt) || a.id.localeCompare(b.id));
}

export function liveWorkbenchSessions(sessions: WorkbenchSessionSummary[], id: string, messages: WorkbenchMessage[], lifecycle?: {running:boolean;busy:boolean;unavailable:boolean}) {
  return sortWorkbenchSessions(sessions.map(session => {
    if (session.id !== id || !messages.length) return session;
    const preview = workbenchSessionPreview(messages);
    // A successful stop/recovery can leave a tool_start in the display snapshot.
    // Only a known idle owner may terminate that badge; lost observation is not completion.
    if (preview.status === "generating" && lifecycle && !lifecycle.running && !lifecycle.busy && !lifecycle.unavailable && !messages.some(message => message.pending)) preview.status = "stopped";
    return {...session,preview};
  }));
}
