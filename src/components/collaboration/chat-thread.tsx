"use client";
import { useEffect, useRef, useState } from "react";
import { BellOff, Check, ChevronDown, File, MoreHorizontal, Pin, Reply, Search, Users, X } from "lucide-react";
import type { CollaborationConversation, CollaborationMessage, CollaborationPage } from "@/lib/collaboration/contracts";
import { useCollaborationState } from "./collaboration-provider";
import { MessageContent } from "./message-content";
import { MessageComposer } from "./message-composer";
import { MemberAvatar } from "./members-panel";
import { isAbort } from "./transport";

export function ChatThread({ conversation }: { conversation: CollaborationConversation }) {
  const { client, state } = useCollaborationState();
  const [tab, setTab] = useState<"chat" | "files">("chat"), [menu, setMenu] = useState(false), [query, setQuery] = useState(""), [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CollaborationPage<CollaborationMessage>>({ items: [], nextCursor: null });
  const [selected, setSelected] = useState<string[]>([]), [forward, setForward] = useState(false), [targets, setTargets] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(conversation.title), [addMembers, setAddMembers] = useState<string[]>([]);
  const scroll = useRef<HTMLDivElement>(null), started = useRef(false), atBottom = useRef(false);
  const [unreadAnchor] = useState(conversation.lastReadMessageId), [initialUnread] = useState(conversation.unread);
  const page = state[tab === "files" ? "files" : "messages"][conversation.id];
  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { if (!isAbort(e)) client.report(e); } finally { setBusy(false); } };
  useEffect(() => { if (tab === "files") void client.loadMessages(conversation.id, false, true).catch(e => client.report(e)); }, [client, conversation.id, tab]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => { if (!query.trim()) { setResults({ items: [], nextCursor: null }); return; } void client.searchMessages(conversation.id, query).then(data => { if (active) setResults(data); }).catch(e => { if (active) client.report(e); }); }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [client, conversation.id, query]);
  useEffect(() => {
    const el = scroll.current; if (!el || !page?.items.length || tab !== "chat" || searching) return;
    if (!started.current) { started.current = true; const unread = el.querySelector<HTMLElement>("[data-unread-marker]"); if (unread) unread.scrollIntoView({ block: "start" }); else el.scrollTop = el.scrollHeight; }
    else if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [page?.items, tab, searching]);
  const messages = searching && query.trim() ? results.items.map(item => state.messages[conversation.id]?.items.find(m => m.id === item.id) || item) : page?.items || [];
  const anchorIndex = unreadAnchor ? messages.findIndex(m => m.id === unreadAnchor) : -1;
  const unreadIndex = unreadAnchor ? (anchorIndex >= 0 ? anchorIndex + 1 : page?.nextCursor ? -1 : 0) : page?.nextCursor ? -1 : 0;
  const locateUnread = () => void run(async () => {
    // Last-read may be older than the initial 50 rows. Walk opaque cursors in a
    // bounded user-initiated batch, preserving history instead of inventing an anchor.
    for (let count = 0; count < 20; count++) {
      const current = client.state.messages[conversation.id];
      if (!current?.nextCursor || unreadAnchor && current.items.some(m => m.id === unreadAnchor)) break;
      await client.loadMessages(conversation.id, true);
    }
    requestAnimationFrame(() => scroll.current?.querySelector<HTMLElement>("[data-unread-marker]")?.scrollIntoView({ block: "start" }));
  });
  const memberName = (id: string) => state.members.find(m => m.id === id)?.name || id;
  const markRead = () => { const latest = state.messages[conversation.id]?.items.at(-1); if (latest) void run(() => client.markRead(conversation.id, latest.id)); };
  return <section className="co-thread">
    <header className="co-thread-header"><MemberAvatar name={client.conversationTitle(conversation)} /><div><h2>{client.conversationTitle(conversation)}</h2><small>{conversation.kind === "group" ? `${conversation.memberIds.length} 位成员` : state.members.find(m => m.id === conversation.memberIds.find(id => id !== state.bootstrap?.actorId))?.presence === "online" ? "在线" : ""}</small></div>
      <button aria-label="搜索聊天记录" aria-pressed={searching} onClick={() => setSearching(!searching)}><Search size={18} /></button><button aria-label="会话设置" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={20} /></button></header>
    <div className="co-thread-tabs"><button aria-pressed={tab === "chat"} onClick={() => setTab("chat")}>消息</button><button aria-pressed={tab === "files"} onClick={() => setTab("files")}><File size={14} />文件</button>{conversation.muted && <BellOff size={14} />}{conversation.pinned && <Pin size={14} />}</div>
    {menu && <div className="co-conversation-settings"><div><button disabled={busy} onClick={() => void run(() => client.patchConversation(conversation.id, { pinned: !conversation.pinned }))}><Pin size={14} />{conversation.pinned ? "取消置顶" : "置顶"}</button><button disabled={busy} onClick={() => void run(() => client.patchConversation(conversation.id, { muted: !conversation.muted }))}><BellOff size={14} />{conversation.muted ? "取消免打扰" : "免打扰"}</button></div>
      <h3><Users size={15} />成员</h3>{conversation.memberIds.map(id => <div className="co-group-member" key={id}><span>{memberName(id)}</span>{conversation.kind === "group" && conversation.ownerId === state.bootstrap?.actorId && id !== conversation.ownerId && <button disabled={busy} aria-label={`移除 ${memberName(id)}`} onClick={() => void run(() => client.patchConversation(conversation.id, { removeMemberIds: [id] }))}><X size={14} /></button>}</div>)}
      {conversation.kind === "group" && <>{conversation.ownerId === state.bootstrap?.actorId && <><form onSubmit={e => { e.preventDefault(); void run(() => client.patchConversation(conversation.id, { title: title.trim() })); }}><input aria-label="重命名群聊" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} /><button disabled={busy || !title.trim()}>保存名称</button></form><input aria-label="查找群成员" maxLength={100} placeholder="搜索成员" onChange={e=>void client.loadMembers(e.target.value).catch(error=>client.report(error))} />{state.memberCursor&&<button onClick={()=>void client.loadMembers(state.memberQuery,true).catch(error=>client.report(error))}>更多成员</button>}<select aria-label="添加群成员" multiple value={addMembers} onChange={e => setAddMembers(Array.from(e.target.selectedOptions).map(o => o.value))}>{state.members.filter(m => !conversation.memberIds.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><button disabled={busy || !addMembers.length} onClick={() => void run(async () => { await client.patchConversation(conversation.id, { addMemberIds: addMembers }); setAddMembers([]); })}>添加成员</button></>}<button className="co-danger" disabled={busy} onClick={() => void run(() => client.patchConversation(conversation.id, { leave: true }))}>离开群聊</button></>}
    </div>}
    {searching && <div className="co-search"><Search size={16} /><input maxLength={100} aria-label="搜索消息" placeholder="搜索聊天记录" value={query} onChange={e => setQuery(e.target.value)} /><button aria-label="关闭搜索" onClick={() => { setSearching(false); setQuery(""); }}><X size={16} /></button></div>}
    <div className="co-message-scroll" ref={scroll} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30; }}>
      {page?.nextCursor && !query && <button className="co-load-history" disabled={page.loading} onClick={() => { const el = scroll.current, height = el?.scrollHeight || 0, top = el?.scrollTop || 0; void run(async () => { await client.loadMessages(conversation.id, true, tab === "files"); requestAnimationFrame(() => { if (el) el.scrollTop = top + el.scrollHeight - height; }); }); }}>加载更早消息</button>}
      {page?.error && <div role="alert" className="co-inline-error">{page.error}<button onClick={() => void client.loadMessages(conversation.id, false, tab === "files").catch(e => client.report(e))}>重试</button></div>}
      {!messages.length && <div className="co-empty">{page?.loading ? "加载中…" : query ? "没有匹配的记录" : tab === "files" ? "暂无文件" : "暂无消息"}</div>}
      {messages.map((message, index) => <div key={message.id}>
        {!searching && tab === "chat" && initialUnread > 0 && index === unreadIndex && <div className="co-unread-marker" data-unread-marker>以下为未读消息</div>}
        <article className={`co-message ${message.senderId === state.bootstrap?.actorId ? "co-own" : ""}`} data-message-id={message.id}>
          <input type="checkbox" aria-label={`选择消息 ${message.id}`} checked={selected.includes(message.id)} disabled={!!message.withdrawnAt} onChange={e => setSelected(ids => e.target.checked ? [...ids, message.id] : ids.filter(id => id !== message.id))} />
          <MemberAvatar name={memberName(message.senderId)} /><div className="co-message-main"><div className="co-message-meta"><strong>{memberName(message.senderId)}</strong><time>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></div>
            {message.replyTo && <blockquote className="co-reference">{state.messages[conversation.id]?.items.find(m => m.id === message.replyTo)?.withdrawnAt ? "原消息已撤回" : state.messages[conversation.id]?.items.find(m => m.id === message.replyTo)?.body.slice(0, 100) || "引用历史消息"}</blockquote>}
            <div className="co-bubble"><MessageContent message={message} /></div>
            {!message.withdrawnAt && <div className="co-message-actions"><button aria-label={`引用消息 ${message.id}`} onClick={() => client.draft(conversation.id, { replyTo: message.id })}><Reply size={13} />回复</button>{message.senderId === state.bootstrap?.actorId && <button disabled={busy} onClick={() => void run(() => client.withdraw(message.id))}>撤回</button>}</div>}
          </div>
        </article>
      </div>)}
      {query && results.nextCursor && <button onClick={() => void run(async () => { const next = await client.searchMessages(conversation.id, query, results.nextCursor!); setResults({ items: [...results.items, ...next.items], nextCursor: next.nextCursor }); })}>更多搜索结果</button>}
      {state.outbox.filter(o => o.conversationId === conversation.id).map(out => <div className="co-pending" key={out.payload.clientId}><span>{out.payload.body || "附件 / 分享卡片"}</span><small>{out.status === "sending" ? "发送中…" : out.status === "uncertain" ? "送达状态待确认" : "发送失败"}</small>{out.error && <span role="status">{out.error}</span>}{out.status !== "sending" && <button onClick={() => void client.send(conversation.id, out.payload)}>使用原消息重试</button>}</div>)}
    </div>
    {conversation.unread > 0 && <div className="co-unread-controls"><button onClick={locateUnread} disabled={busy}><ChevronDown size={14} />定位未读 ({conversation.unread})</button><button onClick={markRead} disabled={busy}><Check size={14} />标为已读</button></div>}
    {selected.length > 0 && <div className="co-selection"><span>已选 {selected.length} 条</span><button onClick={() => setForward(!forward)}>转发</button><button onClick={() => { setSelected([]); setForward(false); }}>取消</button></div>}
    {forward && <div className="co-forward"><strong>转发到</strong>{state.conversations.filter(c => c.id !== conversation.id).map(c => <label key={c.id}><input type="checkbox" checked={targets.includes(c.id)} onChange={e => setTargets(ids => e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))} />{client.conversationTitle(c)}</label>)}<button className="co-primary" disabled={busy || !targets.length} onClick={() => void run(async () => { await client.forward(selected, targets); setForward(false); setSelected([]); setTargets([]); })}>确认转发</button></div>}
    {tab === "chat" && <MessageComposer conversationId={conversation.id} />}
  </section>;
}
