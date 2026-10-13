"use client";
// 次级管理中心（企业主）：面向团队负责人的精简管理台。
// 数据全部来自已审计的 /api/team/*（入口授权 + 字段白名单）；业务记录仅开放
// 图片与操作内容两个分区（用户确认），对话/积分流水/操作记录不在此暴露；
// 内容接口本身不含真实模型列，模型红线由 SQL 白名单结构性保证。
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, Clock3, Eye, ImageIcon, KeyRound, LayoutDashboard, RefreshCw, ShieldCheck, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { loginIdentifierToEmail, USERNAME_DOMAIN } from "@/lib/account-identity";
import type { ContentPage, ContentRow, TeamMember, TeamSnapshot } from "@/lib/teams/contracts";
import styles from "./enterprise.module.css";

type View = "overview" | "members" | "records";
type Section = "artworks" | "tasks";
type Editor = { kind: "expiry" | "password"; member: TeamMember } | null;

const datetime = (v: string | null | undefined) => v ? new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "不限期";
function inputDate(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const identity = (email: string) => email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, email.lastIndexOf("@")) : email;
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init }); const body = await r.json();
  if (!r.ok) throw new Error(body.error || "读取失败"); return body;
}

export function EnterpriseConsole() {
  const { user } = useAuth();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("overview");
  useEffect(() => {
    const controller = new AbortController();
    json<{ allowed: boolean }>("/api/team/access", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setGranted(!!data.allowed); })
      .catch(() => { if (!controller.signal.aborted) setGranted(false); });
    return () => controller.abort();
  }, [user?.email]);
  if (!granted) return <main className={styles.page}><div className={styles.empty}>{granted === null ? "加载中…" : "企业管理中心需要站点管理员开通团队入口授权后才能访问。"}</div></main>;
  return <TeamWorkspace />;
}

function TeamWorkspace() {
  const [data, setData] = useState<TeamSnapshot>({ team: null, members: [] });
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("overview");
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const [section, setSection] = useState<Section>("artworks"), [page, setPage] = useState(1);
  const [content, setContent] = useState<ContentPage | null>(null), [contentLoading, setContentLoading] = useState(false), [contentError, setContentError] = useState("");
  const [editor, setEditor] = useState<Editor>(null), [password, setPassword] = useState(""), [expiry, setExpiry] = useState("");
  const command = useRef<{ payload: string; id: string } | null>(null);
  const teamId = data.team?.id;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await json<TeamSnapshot>("/api/team")); }
    catch (e) { setError((e as Error).message); setData({ team: null, members: [] }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setSelected(old => old ? data.members.find(m => m.email === old.email) || null : null);
  }, [data.members]);

  // 业务记录：选中成员后拉取分区内容（仅 artworks / tasks 两个分区）
  useEffect(() => {
    if (view !== "records" || !selected || !teamId) { setContent(null); return; }
    const controller = new AbortController();
    setContentLoading(true); setContentError(""); setContent(null);
    const q = new URLSearchParams({ teamId, email: selected.email, section, page: String(page) });
    json<ContentPage>(`/api/team/users?${q}`, { signal: controller.signal })
      .then(r => { if (!controller.signal.aborted) setContent(r); })
      .catch(e => { if (!controller.signal.aborted) setContentError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setContentLoading(false); });
    return () => controller.abort();
  }, [view, selected, teamId, section, page]);

  async function mutate(body: Record<string, unknown>) {
    if (pending) return;
    const payload = JSON.stringify(body);
    if (command.current?.payload !== payload) command.current = { payload, id: crypto.randomUUID() };
    setPending(true); setError(""); setNotice("");
    try {
      await json("/api/team/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id: command.current!.id }) });
      command.current = null; setEditor(null); setPassword(""); setNotice("已保存");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  const memberBody = (m: TeamMember) => ({ teamId, email: m.email, expectedVersion: m.management_version });
  const expired = (m: TeamMember) => !!m.account_expires_at && new Date(m.account_expires_at).getTime() <= Date.now();
  const totals = {
    members: data.members.length,
    available: data.members.reduce((s, m) => s + (m.available || 0), 0),
    consumed: data.members.reduce((s, m) => s + (m.consumed || 0), 0),
    artworks: data.members.reduce((s, m) => s + (m.artworks || 0), 0),
  };
  const pickMember = (m: TeamMember) => { setSelected(m); setSection("artworks"); setPage(1); setContent(null); setView("records"); };

  const nav: { group: string; items: { id: View; label: string; icon: typeof Users }[] }[] = [
    { group: "运营概览", items: [{ id: "overview", label: "数据概览", icon: LayoutDashboard }] },
    { group: "团队管理", items: [{ id: "members", label: "团队与子账号", icon: Users }] },
    { group: "业务记录", items: [{ id: "records", label: "图片与操作内容", icon: ImageIcon }] },
  ];

  return <main className={styles.page} data-testid="enterprise-console">
    <aside className={styles.sidebar}>
      <div className={styles.brand}><Building2 size={20} /><span>Naumi</span><small>企业管理中心</small></div>
      <p className={styles.private}><ShieldCheck size={14} />仅团队负责人可见</p>
      <nav>{nav.map(group => <section key={group.group}>
        <p className={styles.groupLabel}>{group.group}</p>
        {group.items.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? styles.active : ""} aria-pressed={view === item.id} onClick={() => setView(item.id)}><Icon size={16} />{item.label}</button>; })}
      </section>)}</nav>
      <div className={styles.sideFoot}>
        <Link href="/dashboard"><ArrowLeft size={15} />返回工作台</Link>
      </div>
    </aside>
    <section className={styles.main}>
      <header className={styles.header}>
        <h1>{data.team?.name || "企业管理中心"}</h1>
        <div className={styles.actions}>
          {data.team && <span className={styles.expiry}><Clock3 size={15} />授权上限：{datetime(data.team.authorized_until)}</span>}
          <button onClick={() => void load()} disabled={loading || pending}><RefreshCw size={15} />刷新</button>
        </div>
      </header>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {loading ? <div className={styles.empty}>加载中…</div> : !data.team ? <div className={styles.empty}>当前账号未关联团队</div> : <>
        {view === "overview" && <div className={styles.pane} data-testid="enterprise-overview">
          <div className={styles.cards}>
            <div><Users size={18} /><span>子账号<strong>{totals.members}</strong></span></div>
            <div><ShieldCheck size={18} /><span>可用积分合计<strong>{totals.available.toLocaleString()}</strong></span></div>
            <div><Clock3 size={18} /><span>累计消耗积分<strong>{totals.consumed.toLocaleString()}</strong></span></div>
            <div><ImageIcon size={18} /><span>作品总数<strong>{totals.artworks}</strong></span></div>
          </div>
          <h2>成员积分一览</h2>
          <div className={styles.tableWrap}><table><thead><tr><th>账号</th><th>状态</th><th>账号有效期</th><th>可用积分</th><th>已消耗</th><th>作品</th></tr></thead><tbody>
            {data.members.map(m => <tr key={m.email}>
              <td><strong>{m.name || identity(m.email)}</strong>{m.name !== identity(m.email) && <small>{identity(m.email)}</small>}</td>
              <td><span className={`${styles.badge} ${m.banned || expired(m) ? styles.inactive : ""}`}>{m.banned ? "已停用" : expired(m) ? "已到期" : "正常"}</span></td>
              <td>{datetime(m.account_expires_at)}</td><td>{m.available.toLocaleString()}</td><td>{m.consumed.toLocaleString()}</td><td>{m.artworks}</td>
            </tr>)}
            {!data.members.length && <tr><td colSpan={6} className={styles.empty}>暂无子账号（子账号由站点管理员绑定）</td></tr>}
          </tbody></table></div>
        </div>}
        {view === "members" && <div className={styles.pane} data-testid="enterprise-members">
          <div className={styles.tableWrap}><table><thead><tr><th>账号</th><th>状态</th><th>账号有效期</th><th>可用积分</th><th>已消耗</th><th>作品</th><th>操作</th></tr></thead><tbody>
            {data.members.map(m => <tr key={m.email}>
              <td><strong>{m.name || identity(m.email)}</strong>{m.name !== identity(m.email) && <small>{identity(m.email)}</small>}</td>
              <td><span className={`${styles.badge} ${m.banned || expired(m) ? styles.inactive : ""}`}>{m.banned ? "已停用" : expired(m) ? "已到期" : "正常"}</span></td>
              <td>{datetime(m.account_expires_at)}</td><td>{m.available.toLocaleString()}</td><td>{m.consumed.toLocaleString()}</td><td>{m.artworks}</td>
              <td><div className={styles.rowActions}>
                <button disabled={pending} onClick={() => pickMember(m)}><Eye size={14} />查看内容</button>
                <button disabled={pending} onClick={() => { setEditor({ kind: "expiry", member: m }); setExpiry(inputDate(m.account_expires_at || data.team!.authorized_until)); }}>有效期</button>
                <button disabled={pending} onClick={() => { setEditor({ kind: "password", member: m }); setPassword(""); }}><KeyRound size={14} />重置密码</button>
                <button disabled={pending} onClick={() => { if (window.confirm(`${m.banned ? "启用" : "停用"}${m.name}？`)) void mutate({ ...memberBody(m), action: "status", banned: !m.banned }); }}>{m.banned ? "启用" : "停用"}</button>
              </div></td>
            </tr>)}
            {!data.members.length && <tr><td colSpan={7} className={styles.empty}>暂无子账号（子账号由站点管理员绑定）</td></tr>}
          </tbody></table></div>
          <p className={styles.hint}>新增/绑定子账号与团队授权调整由站点管理员操作；负责人可在授权上限内调整子账号有效期。</p>
        </div>}
        {view === "records" && <div className={styles.pane} data-testid="enterprise-records">
          {!data.members.length ? <div className={styles.empty}>暂无子账号</div> : <>
            <div className={styles.recordsBar}>
              <label>成员<select aria-label="选择成员" value={selected?.email || ""} onChange={e => { const m = data.members.find(x => x.email === e.target.value) || null; setSelected(m); setPage(1); }}>{data.members.map(m => <option key={m.email} value={m.email}>{m.name || identity(m.email)}</option>)}</select></label>
              <div className={styles.tabs}>
                <button aria-pressed={section === "artworks"} className={section === "artworks" ? styles.active : ""} onClick={() => { setSection("artworks"); setPage(1); }}>图片</button>
                <button aria-pressed={section === "tasks"} className={section === "tasks" ? styles.active : ""} onClick={() => { setSection("tasks"); setPage(1); }}>操作任务</button>
              </div>
            </div>
            {!selected ? <div className={styles.empty}>请选择成员</div> : contentLoading ? <div className={styles.empty}>加载中…</div> : contentError ? <p role="alert" className={styles.error}>{contentError}</p> : content && <>
              <div className={section === "artworks" ? styles.gallery : styles.records}>{content.rows.map((row, i) => <article key={String(row.id) || i} className={styles.record}>
                {section === "artworks" && (row.image_url ? <img src={`/api/team/media?${new URLSearchParams({ teamId: teamId!, email: selected.email, id: String(row.id) })}`} alt={String(row.title || "作品")} loading="lazy" /> : <div className={styles.empty}>无媒体</div>)}
                <h3>{String(row.title || row.kind || row.id)}</h3>
                <small>{datetime(String(row.created_at))}{row.status ? ` · ${row.status}` : ""}</small>
                {section === "tasks" && row.prompt ? <p>{String(row.prompt)}</p> : null}
                {section === "tasks" && <p className={styles.amount}>预估积分：{row.cost}</p>}
              </article>)}
              {!content.rows.length && <div className={styles.empty}>暂无记录</div>}
            </div>
              <div className={styles.pager}><span>共{content.total}条</span><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>{page}</span><button disabled={page * 20 >= content.total} onClick={() => setPage(p => p + 1)}>下一页</button></div>
            </>}
          </>}
        </div>}
      </>}
    </section>
    {editor && <div className={styles.overlay} onKeyDown={e => { if (e.key === "Escape" && !pending) setEditor(null); }}><section role="dialog" aria-modal="true" aria-labelledby="ent-editor-title" className={styles.dialog}>
      <div className={styles.dialogHead}><h2 id="ent-editor-title">{editor.kind === "expiry" ? "修改账号有效期" : "重置密码"}</h2><button disabled={pending} aria-label="关闭编辑" onClick={() => setEditor(null)}><X size={18} /></button></div>
      <form onSubmit={e => { e.preventDefault(); if (!editor) return; if (editor.kind === "password") void mutate({ ...memberBody(editor.member), action: "reset-password", password }); else void mutate({ ...memberBody(editor.member), action: "expiry", expiresAt: new Date(expiry).toISOString() }); }}>
        <p>{editor.member.name || identity(editor.member.email)}</p>
        {editor.kind === "password" ? <label>新密码<input autoFocus type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /><small>保存后该账号的登录会话将失效</small></label>
          : <label>账号截止时间<input type="datetime-local" required value={expiry} onChange={e => setExpiry(e.target.value)} /><small>授权上限：{datetime(data.team?.authorized_until)}；不影响积分有效期</small></label>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.dialogActions}><button type="button" disabled={pending} onClick={() => setEditor(null)}>取消</button><button className={styles.primary} disabled={pending} type="submit">{pending ? "保存中…" : "保存"}</button></div>
      </form></section></div>}
  </main>;
}
