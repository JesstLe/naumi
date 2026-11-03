"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, BellOff, Maximize2, MessageCircle, Minimize2, Pin, Plus, Share2, Users, X } from "lucide-react";
import { useCollaborationState } from "./collaboration-context";
import { MembersPanel, MemberAvatar } from "./members-panel";
import { SharePanel } from "./share-panel";
import { ChatThread } from "./chat-thread";

export function CollaborationWindow() {
  const { client, state } = useCollaborationState();
  const [mounted, setMounted] = useState(false), [position, setPosition] = useState<{ x: number; y: number } | null>(null), [conversationQuery, setConversationQuery] = useState("");
  const [listVisible, setListVisible] = useState(true);
  const panel = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  useEffect(() => { setMounted(true); const clamp = () => { setPosition(p => p ? { x: Math.max(8, Math.min(p.x, window.innerWidth - (panel.current?.offsetWidth || 540) - 8)), y: Math.max(8, Math.min(p.y, window.innerHeight - 100)) } : p); }; window.addEventListener("resize", clamp); return () => window.removeEventListener("resize", clamp); }, []);
  useEffect(() => { setConversationQuery(""); setListVisible(true); }, [state.account, state.bootstrap?.enterpriseId]);
  useEffect(() => { if (state.activeId) setListVisible(false); }, [state.activeId]);
  if (!mounted || !state.visible) return null;
  const active = state.conversations.find(c => c.id === state.activeId);
  const unread = state.unreadTotal ?? state.conversations.reduce((n, c) => n + c.unread, 0);
  return createPortal(<div ref={panel} role="dialog" aria-label="企业消息" aria-modal="false" data-canvas-hotkeys-blocked="true" data-collaboration-window className={`co-window ${state.expanded ? "co-expanded" : ""} ${!listVisible ? "co-mobile-thread" : ""}`} style={!state.expanded && position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}
    onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} onPaste={e => e.stopPropagation()} onCopy={e => e.stopPropagation()} onCut={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onDragOver={e => e.stopPropagation()} onDrop={e => e.stopPropagation()}>
    <header className="co-window-header" onPointerDown={e => { if (state.expanded || (e.target as Element).closest("button,select")) return; const rect = panel.current!.getBoundingClientRect(); drag.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top }; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); }} onPointerMove={e => { const origin = drag.current; if (!origin) return; const box = panel.current!; setPosition({ x: Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, origin.left + e.clientX - origin.x)), y: Math.max(8, Math.min(window.innerHeight - 80, origin.top + e.clientY - origin.y)) }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <span className="co-window-icon"><MessageCircle size={19} /></span><strong>消息</strong>{unread > 0 && <span className="co-total-unread">{unread}</span>}
      {state.bootstrap && state.bootstrap.enterprises.length > 1 ? <select aria-label="切换通讯企业" value={state.bootstrap.enterpriseId || ""} onChange={e => client.switchEnterprise(e.target.value)}>{state.bootstrap.enterprises.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}</select> : <span className="co-enterprise-name">{state.bootstrap?.enterprises.find(e => e.id === state.bootstrap?.enterpriseId)?.name}</span>}
      <span className={`co-connection ${state.connected ? "connected" : ""}`} title={state.connected ? "已连接" : "未连接"} />
      <button aria-label={state.expanded ? "还原聊天窗口" : "展开聊天窗口"} onClick={() => client.expand()}>{state.expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button><button aria-label="收起聊天" onClick={() => client.close()}><X size={19} /></button>
    </header>
    <div className="co-window-nav"><button aria-pressed={state.section === "conversations"} onClick={() => client.open()}><MessageCircle size={16} />聊天</button><button aria-pressed={state.section === "members"} onClick={() => client.open({ section: "members" })}><Users size={16} />成员</button><button aria-pressed={state.section === "requests"} onClick={() => client.open({ section: "requests" })}><Share2 size={16} />申请</button></div>
    {state.error && <div className="co-error" role="alert"><span>{state.error}</span><button aria-label="关闭消息错误" onClick={() => client.dismissError()}><X size={14} /></button></div>}
    {state.streamError && <div className="co-stream-error" role="status">{state.streamError}</div>}
    {state.status !== "ready" ? <div className="co-empty"><MessageCircle size={32} /><p>{state.status === "loading" ? "连接企业通讯…" : state.status === "signed-out" ? "请先登录" : "企业通讯暂未连接"}</p>{state.status === "error" && <button className="co-primary" onClick={() => client.retryBootstrap()}>重新连接</button>}</div> : !state.bootstrap?.enterpriseId ? <div className="co-empty"><Users size={32} /><p>当前账户暂无企业</p></div> : <div className="co-window-body" key={`${client.generation}:${state.account}:${state.bootstrap.enterpriseId}`}>
      {state.section === "members" ? <MembersPanel /> : state.section === "requests" ? <SharePanel /> : <>
        <aside className="co-conversations"><div className="co-conversation-search"><input aria-label="搜索会话" placeholder="搜索会话" value={conversationQuery} onChange={e => setConversationQuery(e.target.value)} /><button aria-label="创建聊天" onClick={() => client.open({ section: "members" })}><Plus size={18} /></button></div>
          <div className="co-conversation-list">{state.conversations.filter(c => client.conversationTitle(c).toLowerCase().includes(conversationQuery.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)).map(c => <button key={c.id} className={`co-conversation ${c.id === state.activeId ? "selected" : ""}`} aria-current={c.id === state.activeId ? "true" : undefined} onClick={() => { client.selectConversation(c.id); setListVisible(false); }}><MemberAvatar name={client.conversationTitle(c)} /><span><strong>{client.conversationTitle(c)}</strong><small>{c.lastMessage?.withdrawnAt ? "消息已撤回" : c.lastMessage?.body || (c.lastMessage?.shareId ? "[画布分享]" : c.lastMessage?.attachments.length ? "[附件]" : "")}</small></span><div>{c.pinned && <Pin size={11} />}{c.muted && <BellOff size={11} />}{c.unread > 0 && <b className={`co-count ${c.muted ? "muted" : ""}`}>{c.unread > 99 ? "99+" : c.unread}</b>}</div></button>)}
          {!state.conversations.length && <div className="co-empty"><MessageCircle size={25} /><button onClick={() => client.open({ section: "members" })}>找同事聊聊</button></div>}</div>
          {state.conversationCursor && <button onClick={() => void client.loadConversations(true).catch(e => client.report(e))}>更多会话</button>}
        </aside><div className="co-thread-area"><button className="co-back-list" onClick={() => setListVisible(true)}><ArrowLeft size={15} />会话</button>{active ? <ChatThread key={active.id} conversation={active} /> : <div className="co-empty"><MessageCircle size={36} /><p>选择会话</p></div>}</div>
      </>}
    </div>}
  </div>, document.body);
}
