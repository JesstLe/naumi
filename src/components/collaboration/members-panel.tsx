"use client";
import { useEffect, useState } from "react";
import { MessageCircle, Search, Users } from "lucide-react";
import { useCollaborationState } from "./collaboration-provider";
import { isAbort } from "./transport";

export function MemberAvatar({ name, presence }: { name: string; presence?: string }) {
  return <span className="co-avatar">{name.slice(0, 1).toUpperCase()}{presence && <i className={`co-presence ${presence}`} />}</span>;
}
export function MembersPanel() {
  const { client, state } = useCollaborationState();
  const [query, setQuery] = useState(""), [presence, setPresence] = useState("all"), [selected, setSelected] = useState<string[]>([]), [title, setTitle] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { void client.loadMembers(query).catch(e => client.report(e)); }, 250); return () => clearTimeout(timer); }, [client, query]);
  const members = state.members.filter(m => (presence === "all" || m.presence === presence));
  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { if (!isAbort(e)) client.report(e); } finally { setBusy(false); } };
  return <section className="co-members-panel"><header><h2>企业成员</h2><span>{state.members.length}{state.memberCursor ? "+" : ""}</span></header>
    <div className="co-search"><Search size={16} /><input aria-label="搜索姓名或岗位" maxLength={100} placeholder="姓名、岗位" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="在线状态" value={presence} onChange={e => setPresence(e.target.value)}><option value="all">全部状态</option><option value="online">在线</option><option value="away">离开</option><option value="offline">离线</option></select></div>
    <div className="co-members-list">{members.map(member => <article key={member.id} className="co-member">
      {member.id !== state.bootstrap?.actorId && <input type="checkbox" aria-label={`选择 ${member.name}`} checked={selected.includes(member.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, member.id] : ids.filter(id => id !== member.id))} />}
      <MemberAvatar name={member.name} presence={member.presence} /><div><strong>{member.name}</strong><small>{member.roleName}</small></div>
      {member.id !== state.bootstrap?.actorId && <div className="co-member-actions"><button aria-label={`私聊 ${member.name}`} disabled={busy} onClick={() => void run(() => client.createConversation([member.id], "direct"))}><MessageCircle size={17} /></button><button disabled={busy} onClick={() => void run(async () => { await client.createShare({ action: "request", authorId: member.id }); client.open({ section: "requests" }); })}>申请画布</button></div>}
    </article>)}</div>
    {state.memberCursor && <button disabled={busy} onClick={() => void run(() => client.loadMembers(query, true))}>加载更多成员</button>}
    {selected.length > 0 && <form className="co-group-create" onSubmit={e => { e.preventDefault(); void run(() => client.createConversation(selected, "group", title.trim() || "新群聊")); }}><Users size={18} /><span>已选 {selected.length} 人</span><input aria-label="群聊名称" placeholder="群聊名称" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} /><button className="co-primary" disabled={busy}>创建群聊</button></form>}
  </section>;
}
