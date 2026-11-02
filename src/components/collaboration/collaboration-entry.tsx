"use client";
import { MessageCircle, Share2 } from "lucide-react";
import type { CanvasShareSource } from "@/lib/collaboration/contracts";
import { useCollaboration, useCollaborationState } from "./collaboration-provider";

export function CollaborationEntry({ className = "", label = false }: { className?: string; label?: boolean }) {
  const { available, unread, open } = useCollaboration();
  // Errors remain discoverable, rather than silently replacing a missing API.
  return <button type="button" className={`co-entry ${className}`} aria-label={unread ? `消息，${unread} 条未读` : "消息"} title="消息" onClick={() => open()} data-collaboration-entry data-available={available}>
    <MessageCircle size={18} />{label && <span>消息</span>}{unread > 0 && <span className="co-badge">{unread > 99 ? "99+" : unread}</span>}
  </button>;
}

/** Receives verified native project/node IDs from Canvas; no project inference. */
export function CanvasCollaborationActions({ source, title, selection, selectionPending = false }: { source: CanvasShareSource | null; title?: string; selection?: CanvasShareSource | null; selectionPending?: boolean }) {
  const { available, share } = useCollaboration();
  const { client, state } = useCollaborationState();
  const approval = state.approval;
  const chosen = selection || source;
  return <>
    <CollaborationEntry />
    {source && available && <button type="button" className="co-entry" title="发送画布" aria-label="发送画布" onClick={() => share({ ...source, title })}><Share2 size={17} /></button>}
    {approval && source && available && <div className="co-approval-inline" data-canvas-hotkeys-blocked="true">
      <span>批准 {state.members.find(m => m.id === approval.requesterId)?.name || approval.requesterId} 的申请</span>
      <button disabled={selectionPending} title={selectionPending ? "请先保存所选节点" : undefined} onClick={() => { if (chosen && !selectionPending) client.share({ ...chosen, title }); client.open({ section: "requests" }); }}>选择{selection || selectionPending ? "所选节点" : "此画布"}</button>
      <button aria-label="取消选择来源" onClick={() => client.clearShare()}>取消</button>
    </div>}
  </>;
}
