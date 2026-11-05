"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Share2, X } from "lucide-react";
import { useCollaborationState } from "./collaboration-context";
import { ShareCover, shareStatus } from "./message-content";
import { isAbort } from "./transport";
import type { CanvasShare } from "@/lib/collaboration/contracts";

export function SharePanel() {
  const { client, state } = useCollaborationState();
  const [recipient, setRecipient] = useState(""), [busy, setBusy] = useState(false), [direction, setDirection] = useState<"all" | "sent" | "received">("all");
  const actor = state.bootstrap?.actorId;
  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { if (!isAbort(e)) client.report(e); } finally { setBusy(false); } };
  const approve = (share: CanvasShare) => { client.chooseApproval(share); };
  return <section className="co-share-panel">
    <header><h2>画布申请</h2><button onClick={() => void run(() => client.loadShares())}>刷新</button></header>
    {state.pendingShare && <div className="co-share-compose"><div><Share2 size={18} /><strong>{state.pendingShare.title || "所选画布"}</strong><button aria-label="取消分享" onClick={() => client.clearShare()}><X size={17} /></button></div>
      <p>{state.pendingShare.nodeIds ? `已选择 ${state.pendingShare.nodeIds.length} 个节点` : "整个画布"}</p>
      {state.approval ? <><p>批准后将为申请者创建独立副本</p><button className="co-primary" disabled={busy} onClick={() => void run(async () => { const share = await client.changeShare(state.approval!, "approve", state.pendingShare!); await client.sendShareCard(share); })}><Check size={16} />批准所选内容</button></> : <>
        <label>接收成员<select aria-label="分享接收成员" value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">选择成员</option>{state.members.filter(m => m.id !== actor).map(m => <option key={m.id} value={m.id}>{m.name} · {m.roleName}</option>)}</select></label>
        <button className="co-primary" disabled={!recipient || busy} onClick={() => void run(async () => { const share = await client.createShare({ action: "offer", requesterId: recipient, source: state.pendingShare! }); await client.sendShareCard(share); })}>发送分享卡片</button>
      </>}
      {!state.approval && <div className="co-recipient-search"><input aria-label="查找分享成员" placeholder="搜索成员或岗位" onChange={e => void client.loadMembers(e.target.value).catch(error => client.report(error))} />{state.memberCursor && <button onClick={() => void client.loadMembers(state.memberQuery, true).catch(error => client.report(error))}>更多成员</button>}</div>}
    </div>}
    {state.approval && !state.pendingShare && <div className="co-share-compose"><p>在自己的画布中选择整项目或所选节点。</p><Link href="/canvas" onClick={() => client.close()}>选择来源画布 <ArrowUpRight size={14} /></Link><button onClick={() => client.clearShare()}>取消审批</button></div>}
    <div className="co-segment" aria-label="申请方向">{(["all", "received", "sent"] as const).map(d => <button key={d} aria-pressed={direction === d} onClick={() => setDirection(d)}>{d === "all" ? "全部" : d === "received" ? "收到的" : "我发出的"}</button>)}</div>
    <div className="co-share-list">{state.shares.filter(s => direction === "all" || state.shareDirections[direction].includes(s.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(share => <article key={share.id} className="co-request">
      <div className="co-request-icon"><Share2 size={20} /></div><div><ShareCover share={share} /><h3>{share.title || "画布复用申请"}</h3><p>{state.members.find(m => m.id === (share.authorId === actor ? share.requesterId : share.authorId))?.name || (share.authorId === actor ? share.requesterId : share.authorId)}</p><span>{shareStatus[share.status]}</span></div>
      <div className="co-request-actions">
        {share.status === "offered" && share.requesterId === actor && <button disabled={busy} className="co-primary" onClick={() => void run(() => client.changeShare(share, "request"))}>申请复用</button>}
        {share.status === "requested" && share.authorId === actor && <><button disabled={busy} className="co-primary" onClick={() => approve(share)}>选择来源并批准</button><button disabled={busy} onClick={() => void run(() => client.changeShare(share, "reject"))}>拒绝</button></>}
        {share.status === "approved" && share.requesterId === actor && share.resultProjectKey && <Link className="co-primary" href={`/canvas?project=${encodeURIComponent(share.resultProjectKey)}`}>打开独立画布 <ArrowUpRight size={14} /></Link>}
        {share.authorId === actor && ["offered", "requested", "approved"].includes(share.status) && <button disabled={busy} onClick={() => void run(() => client.changeShare(share, "revoke"))}>撤回分享</button>}
        {share.status === "approved" && share.authorId === actor && <small>撤回分享不删除已有副本</small>}
        <button disabled={busy} onClick={() => void run(() => client.sendShareCard(share))}>发送卡片</button>
      </div>
    </article>)}{!state.shares.length && <div className="co-empty"><Share2 size={30} /><p>暂无画布申请</p></div>}</div>
    <footer>{(["received", "sent"] as const).map(side => state.shareCursors[side] && <button key={side} disabled={busy} onClick={() => void run(() => client.loadShares(side, true))}>更多{side === "received" ? "收到的" : "发出的"}申请</button>)}</footer>
  </section>;
}
