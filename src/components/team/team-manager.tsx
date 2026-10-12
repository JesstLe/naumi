"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, Clock3, Eye, KeyRound, Plus, RefreshCw, ShieldCheck, Users, X } from "lucide-react";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useAuth } from "@/lib/auth-context";
import { loginIdentifierToEmail, USERNAME_DOMAIN } from "@/lib/account-identity";
import type { ContentPage, ContentRow, ContentSection, Team, TeamMember, TeamSnapshot } from "@/lib/teams/contracts";
import styles from "./team-manager.module.css";

const sections: { id: ContentSection; name: string }[] = [{ id: "artworks", name: "作品" }, { id: "tasks", name: "任务" }, { id: "conversations", name: "对话" }, { id: "ledger", name: "积分流水" }, { id: "audit", name: "操作记录" }];
const datetime = (v: string | null | undefined) => v ? new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "不限期";
function inputDate(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const identity = (email: string) => email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, email.lastIndexOf("@")) : email;
function media(v: unknown): string | undefined { return typeof v === "string" && (/^https:\/\//i.test(v) || /^\/media\/[A-Za-z0-9/_\-.]+$/.test(v)) ? v : undefined; }
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init }); const body = await r.json();
  if (!r.ok) throw new Error(body.error || "读取失败"); return body;
}
type Editor = { kind: "expiry" | "password" | "create" | "attach" | "team"; member?: TeamMember } | null;
export function TeamManager({ admin = false }: { admin?: boolean }) {
  const { openAuth } = useAuthModal();
  const { user } = useAuth();
  const [data, setData] = useState<TeamSnapshot>({ team: null, members: [] });
  const [teams, setTeams] = useState<Team[]>([]), [teamId, setTeamId] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true), [pending, setPending] = useState(false);
  const [editor, setEditor] = useState<Editor>(null), [password, setPassword] = useState(""), [expiry, setExpiry] = useState("");
  const [name, setName] = useState(""), [account, setAccount] = useState(""), [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState<TeamMember | null>(null), [section, setSection] = useState<ContentSection>("artworks"), [page, setPage] = useState(1);
  const [content, setContent] = useState<ContentPage | null>(null), [contentError, setContentError] = useState(""), [contentLoading, setContentLoading] = useState(false);
  const [conversation, setConversation] = useState<{ row: ContentRow; page: number } | null>(null);
  const [messages, setMessages] = useState<{ total: number; messages: { role: string; text: string; truncated: boolean }[]; page: number; size: number } | null>(null);
  const command = useRef<{ payload: string; id: string } | null>(null), loadSeq = useRef(0);
  const createTeamId = useRef("");
  const selectedEmail = selected?.email, scopeId = data.team?.id;
  const invalidateLoads = useCallback(() => { ++loadSeq.current; }, []);
  const load = useCallback(async (id = teamId) => {
    const seq = ++loadSeq.current; setLoading(true); setError("");
    try {
      if (admin) {
        const list = await json<TeamSnapshot>("/api/admin/teams"); if (seq !== loadSeq.current) return;
        setTeams(list.teams || []);
        if (!id) id = list.teams?.[0]?.id || "";
      }
      const result = await json<TeamSnapshot>(`/api/team${id ? `?teamId=${id}` : ""}`);
      if (seq !== loadSeq.current) return;
      setData(result); setTeamId(result.team?.id || id);
      setSelected(old => old ? result.members.find(m => m.email === old.email) || null : null);
    } catch (e) { if (seq === loadSeq.current) { setError((e as Error).message); setData({ team: null, members: [] }); setSelected(null); setContent(null); setConversation(null); setMessages(null); } }
    finally { if (seq === loadSeq.current) setLoading(false); }
  }, [admin, teamId]);
  useEffect(() => { void load(); return invalidateLoads; }, [load, invalidateLoads, user?.email]);
  useEffect(() => { setData({ team: null, members: [] }); setSelected(null); setContent(null); setConversation(null); setMessages(null); setEditor(null); setPassword(""); }, [user?.email]);
  useEffect(() => {
    if (!selectedEmail || !scopeId) { setContent(null); return; }
    const controller = new AbortController(); setContentLoading(true); setContentError(""); setContent(null); setConversation(null); setMessages(null);
    const q = new URLSearchParams({ teamId: scopeId, email: selectedEmail, section, page: String(page) });
    json<ContentPage>(`/api/team/users?${q}`, { signal: controller.signal }).then(r => { if (!controller.signal.aborted) setContent(r); }).catch(e => { if (!controller.signal.aborted) setContentError(e.message); }).finally(() => { if (!controller.signal.aborted) setContentLoading(false); });
    return () => controller.abort();
  }, [selectedEmail, scopeId, section, page]);
  useEffect(() => {
    if (!conversation || !selectedEmail || !scopeId) return;
    const controller = new AbortController(); setMessages(null); setContentError("");
    const q = new URLSearchParams({ teamId: scopeId, email: selectedEmail, id: String(conversation.row.id), kind: String(conversation.row.source), page: String(conversation.page) });
    json<NonNullable<typeof messages>>(`/api/team/conversation?${q}`, { signal: controller.signal }).then(r => { if (!controller.signal.aborted) setMessages(r); }).catch(e => { if (!controller.signal.aborted) setContentError(e.message); });
    return () => controller.abort();
  }, [conversation, selectedEmail, scopeId]);
  async function mutate(body: Record<string, unknown>, endpoint = "/api/team/users") {
    if (pending) return;
    const payload = JSON.stringify(body);
    if (command.current?.payload !== payload) command.current = { payload, id: crypto.randomUUID() };
    setPending(true); setError(""); setNotice("");
    try {
      await json(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id: command.current.id }) });
      command.current = null; setEditor(null); setPassword(""); setNotice("已保存");
      await load(String(body.teamId || teamId));
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  function openEditor(next: NonNullable<Editor>) {
    setEditor(next); setError(""); setPassword(""); command.current = null;
    createTeamId.current = crypto.randomUUID();
    setExpiry(inputDate(next.member?.account_expires_at || data.team?.authorized_until || new Date(Date.now() + 15 * 86400000).toISOString()));
    setName(next.kind === "team" ? data.team?.name || "" : ""); setAccount(""); setEnabled(data.team?.enabled ?? true);
  }
  const expired = (member: TeamMember) => !!member.account_expires_at && new Date(member.account_expires_at).getTime() <= Date.now();
  const memberBody = (m: TeamMember) => ({ teamId: data.team?.id, email: m.email, expectedVersion: m.management_version });
  const select = (m: TeamMember) => { setSelected(m); setSection("artworks"); setPage(1); setContent(null); setConversation(null); };
  return <main className={styles.page} data-testid="team-manager">
    <header className={styles.header}><div>{!admin && <Link className={styles.back} href="/dashboard"><ArrowLeft size={16} />工作台</Link>}<h1><Building2 size={25} />{admin ? "团队与子账号" : data.team?.name || "团队管理"}</h1></div><div className={styles.actions}><button onClick={() => void load()} disabled={loading || pending}><RefreshCw size={16} />刷新</button>{admin && <button className={styles.primary} onClick={() => openEditor({ kind: "create" })}><Plus size={16} />新建团队</button>}</div></header>
    {error && <div role="alert" className={styles.error}>{error}{error === "请先登录" && <button onClick={() => openAuth()}>登录</button>}</div>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {admin && teams.length > 0 && <label className={styles.teamSelect}>团队<select aria-label="选择团队" value={teamId} disabled={pending} onChange={e => { setSelected(null); setData({ team: null, members: [] }); setTeamId(e.target.value); }}>{teams.map(t => <option key={t.id} value={t.id}>{t.name} · {identity(t.owner_email)}</option>)}</select></label>}
    {loading ? <div className={styles.empty}>加载中…</div> : data.team ? <>
      <div className={styles.stats}><div><Users size={20} /><span>子账号<strong>{data.members.length}</strong></span></div><div><ShieldCheck size={20} /><span>负责人<strong>{identity(data.team.owner_email)}</strong></span></div><div><Clock3 size={20} /><span>授权上限<strong>{datetime(data.team.authorized_until)}</strong></span></div></div>
      {admin && <div className={styles.actions}><button onClick={() => openEditor({ kind: "team" })}>编辑授权{!data.team.enabled && "（已停用）"}</button><button onClick={() => openEditor({ kind: "attach" })}><Plus size={16} />绑定账号</button></div>}
      <div className={styles.tableWrap}><table><thead><tr><th>账号</th><th>状态</th><th>账号有效期</th><th>可用积分</th><th>已消耗</th><th>作品</th><th>操作</th></tr></thead><tbody>{data.members.map(m => <tr key={m.email}><td><strong>{m.name || identity(m.email)}</strong>{m.name !== identity(m.email) && <small>{identity(m.email)}</small>}</td><td><span className={`${styles.badge} ${m.banned || expired(m) ? styles.inactive : ""}`}>{m.banned ? "已停用" : expired(m) ? "已到期" : "正常"}</span></td><td>{datetime(m.account_expires_at)}</td><td>{m.available.toLocaleString()}</td><td>{m.consumed.toLocaleString()}</td><td>{m.artworks}</td><td><div className={styles.rowActions}><button disabled={pending} onClick={() => select(m)}><Eye size={14} />查看内容</button><button disabled={pending} onClick={() => openEditor({ kind: "expiry", member: m })}>有效期</button><button disabled={pending} onClick={() => openEditor({ kind: "password", member: m })}><KeyRound size={14} />重置密码</button><button disabled={pending} onClick={() => { if (window.confirm(`${m.banned ? "启用" : "停用"}${m.name}？`)) void mutate({ ...memberBody(m), action: "status", banned: !m.banned }); }}>{m.banned ? "启用" : "停用"}</button>{admin && <button disabled={pending} onClick={() => { if (window.confirm(`移除${m.name}的团队归属？账号和积分将保留。`)) void mutate({ ...memberBody(m), action: "detach" }, "/api/admin/teams"); }}>移除归属</button>}</div></td></tr>)}</tbody></table>{!data.members.length && <div className={styles.empty}>暂无子账号</div>}</div>
      {selected && <section className={styles.content}><div className={styles.contentHead}><h2>{selected.name} · 内容记录</h2><button aria-label="关闭内容" onClick={() => setSelected(null)}><X size={18} /></button></div><nav className={styles.tabs}>{sections.map(s => <button key={s.id} aria-pressed={section === s.id} className={section === s.id ? styles.active : ""} onClick={() => { setSection(s.id); setPage(1); }}>{s.name}</button>)}</nav>
        {contentError && <p role="alert" className={styles.error}>{contentError}</p>}
        {contentLoading ? <div className={styles.empty}>加载中…</div> : content && <><div className={section === "artworks" ? styles.gallery : styles.records}>{content.rows.map(row => <article key={String(row.id)} className={styles.record}>
          {section === "artworks" && (media(row.video_url) ? <video src={media(row.video_url)} controls preload="metadata" /> : row.image_url ? <img src={`/api/team/media?${new URLSearchParams({teamId: data.team!.id, email: selected.email, id: String(row.id)})}`} alt={String(row.title || "作品")} loading="lazy" /> : <div className={styles.empty}>无媒体</div>)}
          <h3>{String(row.title || row.reason || row.action || row.kind || row.id)}</h3><small>{datetime(String(row.created_at))}{row.status ? ` · ${row.status}` : ""}</small>
          {row.prompt && <p>{String(row.prompt)}</p>}
          {section === "tasks" && <p>预估积分：{row.cost}</p>}
          {section === "ledger" && <p className={styles.amount}>{Number(row.delta) > 0 ? "+" : ""}{row.delta}<small>积分到期：{datetime(row.expires_at as string | null)}</small></p>}
          {section === "audit" && <p>{identity(String(row.actor))} · {String(row.changes)}</p>}
          {section === "conversations" && <button onClick={() => setConversation({ row, page: 1 })}>查看对话</button>}
        </article>)}</div>{!content.rows.length && <div className={styles.empty}>暂无记录</div>}<div className={styles.pager}><span>共{content.total}条</span><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>{page}</span><button disabled={page * 20 >= content.total} onClick={() => setPage(p => p + 1)}>下一页</button></div></>}
        {conversation && <div className={styles.conversation}><div className={styles.contentHead}><h3>{String(conversation.row.title || "对话")}</h3><button onClick={() => setConversation(null)}>关闭对话</button></div>{!messages ? <p>加载中…</p> : <>{messages.messages.map((m, i) => <div className={`${styles.message} ${m.role === "user" ? styles.userMessage : ""}`} key={i}><strong>{m.role === "user" ? selected.name : "助手"}</strong><p>{m.text}{m.truncated && "（内容较长，已截断）"}</p></div>)}<div className={styles.pager}><button disabled={conversation.page <= 1} onClick={() => setConversation(c => c && { ...c, page: c.page - 1 })}>上一页</button><span>{conversation.page}</span><button disabled={conversation.page * 20 >= messages.total} onClick={() => setConversation(c => c && { ...c, page: c.page + 1 })}>下一页</button></div></>}</div>}
      </section>}
    </> : !error && <div className={styles.empty}>{admin ? "暂无团队" : "当前账号未关联团队"}</div>}
    {editor && <div className={styles.overlay} onKeyDown={e => { if (e.key === "Escape" && !pending) setEditor(null); }}><section role="dialog" aria-modal="true" aria-labelledby="team-editor-title" className={styles.dialog}><div className={styles.contentHead}><h2 id="team-editor-title">{({ expiry: "修改账号有效期", password: "重置密码", create: "新建团队", attach: "绑定子账号", team: "编辑团队授权" })[editor.kind]}</h2><button disabled={pending} aria-label="关闭编辑" onClick={() => { setEditor(null); setPassword(""); }}><X size={18} /></button></div>
      <form onSubmit={e => { e.preventDefault(); if (editor.kind === "password") void mutate({ ...memberBody(editor.member!), action: "reset-password", password }); else if (editor.kind === "expiry") void mutate({ ...memberBody(editor.member!), action: "expiry", expiresAt: new Date(expiry).toISOString() }); else if (editor.kind === "create") void mutate({ action: "create", teamId: createTeamId.current, ownerEmail: loginIdentifierToEmail(account), name, authorizedUntil: new Date(expiry).toISOString() }, "/api/admin/teams"); else if (editor.kind === "attach") void mutate({ action: "attach", teamId, email: loginIdentifierToEmail(account), expiresAt: new Date(expiry).toISOString() }, "/api/admin/teams"); else void mutate({ action: "update", teamId, expectedVersion: data.team!.version, name, authorizedUntil: new Date(expiry).toISOString(), enabled }, "/api/admin/teams"); }}>
        {editor.member && <p>{editor.member.name}</p>}
        {(editor.kind === "create" || editor.kind === "team") && <label>团队名称<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>}
        {(editor.kind === "create" || editor.kind === "attach") && <label>{editor.kind === "create" ? "负责人账号" : "子账号"}<input required value={account} onChange={e => setAccount(e.target.value)} /></label>}
        {editor.kind === "password" ? <label>新密码<input autoFocus type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /><small>保存后原登录会话失效</small></label> : <label>{editor.kind === "create" || editor.kind === "team" ? "授权截止时间" : "账号截止时间"}<input type="datetime-local" required value={expiry} onChange={e => setExpiry(e.target.value)} />{editor.kind !== "create" && editor.kind !== "team" && <small>授权上限：{datetime(data.team?.authorized_until)}；积分有效期保持不变</small>}</label>}
        {editor.kind === "team" && <label className={styles.check}><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />启用团队管理权限</label>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}><button type="button" disabled={pending} onClick={() => { setEditor(null); setPassword(""); }}>取消</button><button className={styles.primary} disabled={pending} type="submit">{pending ? "保存中…" : "保存"}</button></div>
      </form></section></div>}
  </main>;
}
