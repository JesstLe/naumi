"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpRight, BookOpen, Check, Download, Image, Layers, Loader2, Paintbrush, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { authHeader } from "@/lib/supabase";
import { OFFICIAL_IMAGE_SKILLS, SKILL_CATEGORIES, validateSkillDraft, type ImageSkill } from "@/lib/image-skills/catalog";
import styles from "./skill-book.module.css";

type Props = { selected: ImageSkill | null; onSelect: (skill: ImageSkill | null) => void; accountKey: string; busy?: boolean; sessionId?: string; hasConversation?: boolean; onUse?: (prompt: string) => void; compact?: boolean };
const empty = () => ({ name: "", description: "", category: "电商" as ImageSkill["category"], instructions: "" });
const categoryIcon = { "电商": Image, "营销": Sparkles, "品牌": Paintbrush, "社媒": Layers, "创作": Sparkles, "编辑": Paintbrush, "图解": Layers };
async function api(method: string, body?: unknown) {
  const response = await fetch("/api/image-skills", { method, headers: { "content-type": "application/json", ...await authHeader() }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "技能操作失败，请重试");
  return data;
}
export function SkillBook({ selected, onSelect, accountKey, busy, sessionId, hasConversation, onUse, compact }: Props) {
  const [open, setOpen] = useState(false), [items, setItems] = useState<ImageSkill[]>(OFFICIAL_IMAGE_SKILLS);
  const [tab, setTab] = useState<"official" | "personal">("official"), [category, setCategory] = useState("全部"), [query, setQuery] = useState("");
  const [detail, setDetail] = useState<ImageSkill | null>(null), [draft, setDraft] = useState<ReturnType<typeof empty> | null>(null), [editing, setEditing] = useState<ImageSkill | null>(null);
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [remove, setRemove] = useState(false);
  const file = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), epoch = useRef(0), alive = useRef(true);
  const previousAccount = useRef(accountKey);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (previousAccount.current === accountKey) return; previousAccount.current = accountKey; epoch.current++; setItems(OFFICIAL_IMAGE_SKILLS); setOpen(false); setDetail(null); setDraft(null); setError(""); setSaving(false); setLoading(false); selectRef.current(null); }, [accountKey]);
  useEffect(() => {
    if (!open) return;
    const id = ++epoch.current; setLoading(true); setError("");
    void api("GET").then(data => { if (id === epoch.current && alive.current) setItems(data.skills); }).catch(err => { if (id === epoch.current && alive.current) setError(err.message); }).finally(() => { if (id === epoch.current && alive.current) setLoading(false); });
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siblings = Array.from(document.body.children).filter(node => !node.contains(dialog.current));
    const inert = siblings.map(node => node.hasAttribute("inert"));
    siblings.forEach(node => node.setAttribute("inert", ""));
    const timer = window.setTimeout(() => dialog.current?.querySelector<HTMLElement>("button,input")?.focus(), 0);
    return () => { window.clearTimeout(timer); document.body.style.overflow = overflow; siblings.forEach((node, index) => { if (!inert[index]) node.removeAttribute("inert"); }); previous?.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => { setRemove(false); }, [detail]);
  function close() { if (saving) return; setOpen(false); setDraft(null); setDetail(null); setError(""); }
  async function mutate(action: () => Promise<void>) {
    if (saving) return; const id = epoch.current; setSaving(true); setError("");
    try { await action(); } catch (err) { if (alive.current && id === epoch.current) setError(err instanceof Error ? err.message : "操作失败"); }
    finally { if (alive.current && id === epoch.current) setSaving(false); }
  }
  function edit(skill?: ImageSkill, copy = false) {
    setEditing(skill?.source === "personal" && !copy ? skill : null);
    setDraft(skill ? { name: copy ? `${skill.name}副本`.slice(0, 48) : skill.name, description: skill.description, category: skill.category, instructions: skill.instructions } : empty());
    setError("");
  }
  function exportSkill(skill: ImageSkill) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "naumi-image-skill", version: 1, definition: validateSkillDraft(skill) }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${skill.name.replace(/[\\/:*?"<>|]/g, "_")}.skill.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function save() {
    const id = epoch.current;
    await mutate(async () => {
      const definition = validateSkillDraft(draft);
      const data = await api(editing ? "PATCH" : "POST", { definition, selection: editing ? { id: editing.id, revision: editing.revision } : undefined });
      if (id !== epoch.current || !alive.current) return;
      setItems(current => [data.skill, ...current.filter(item => item.id !== data.skill.id)]);
      if (selected?.id === data.skill.id) onSelect(data.skill);
      setDraft(null); setDetail(data.skill); setTab("personal");
    });
  }
  const visible = items.filter(item => item.source === tab && (category === "全部" || item.category === category) && `${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const view = open && <div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) close(); }} onPointerDown={event => event.stopPropagation()}>
    <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="创作 Skills" ref={dialog} data-testid="skill-book-dialog" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="file"]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]');
        if (!nodes?.length) return; const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <header className={styles.header}>
        <div className={styles.heading}>{(detail || draft) ? <button aria-label="返回技能库" disabled={saving} onClick={() => { setDetail(null); setDraft(null); setError(""); }}><ArrowLeft size={18} /></button> : <BookOpen size={21} />}<h2>{draft ? editing ? "编辑 Skill" : "创建 Skill" : detail ? detail.name : "创作 Skills"}</h2></div>
        <button aria-label="关闭技能库" disabled={saving} onClick={close}><X size={19} /></button>
      </header>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.body}>
        {draft ? <form id="image-skill-form" className={styles.form} onSubmit={event => { event.preventDefault(); void save(); }}>
          <div className={styles.formRow}><label>名称<input disabled={saving} required maxLength={48} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>分类<select disabled={saving} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as ImageSkill["category"] })}>{SKILL_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label></div>
          <label>简介<input disabled={saving} required maxLength={140} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
          <label>创作流程<textarea disabled={saving} required minLength={10} maxLength={6000} rows={10} value={draft.instructions} placeholder="写下需要的参考素材、创作步骤和结果要求" onChange={event => setDraft({ ...draft, instructions: event.target.value })} /></label>
          <span className={styles.count}>{draft.instructions.length}/6000</span>
        </form> : detail ? <section className={styles.detail}>
          <SkillCover skill={detail} large />
          <div className={styles.meta}><span>{detail.category}</span><span>{detail.source === "official" ? "内置" : "我的 Skills"}</span><span>v{detail.revision}</span></div>
          <p className={styles.description}>{detail.description}</p>
          <h3>创作流程</h3><p className={styles.workflow}>{detail.instructions}</p>
          <div className={styles.detailActions}><button onClick={() => edit(detail, detail.source === "official")}><Paintbrush size={15} />{detail.source === "official" ? "另存为我的 Skill" : "编辑"}</button><button onClick={() => exportSkill(detail)}><Download size={15} />导出</button>
            {detail.source === "personal" && <button className={styles.danger} disabled={saving} onClick={() => {
              if (!remove) { setRemove(true); return; } const id = epoch.current;
              void mutate(async () => { await api("DELETE", { selection: { id: detail.id, revision: detail.revision } }); if (id !== epoch.current || !alive.current) return; setItems(current => current.filter(item => item.id !== detail.id)); if (selected?.id === detail.id) onSelect(null); setDetail(null); });
            }}><Trash2 size={15} />{remove ? "确认移除" : "移除"}</button>}
          </div>
        </section> : <>
          <div className={styles.toolbar}><div className={styles.tabs}>{(["official", "personal"] as const).map(t => <button role="tab" aria-selected={tab === t} key={t} className={tab === t ? styles.activeTab : ""} onClick={() => setTab(t)}>{t === "official" ? "精选 Skills" : "我的 Skills"}</button>)}</div>
            <div className={styles.actions}><button aria-label="导入 Skill" title="导入 Skill" onClick={() => file.current?.click()}><Upload size={17} /></button><button className={styles.create} onClick={() => edit()}><Plus size={16} />创建</button></div></div>
          <label className={styles.search}><Search size={17} /><input aria-label="搜索技能" placeholder="搜索 Skills" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <div className={styles.categories}>{["全部", ...SKILL_CATEGORIES].map(c => <button aria-pressed={category === c} key={c} className={category === c ? styles.activeCategory : ""} onClick={() => setCategory(c)}>{c}</button>)}</div>
          {loading ? <div className={styles.empty} role="status"><Loader2 size={22} className={styles.spin} />加载中</div> : <div className={styles.grid}>{visible.map(skill => <button data-testid={`skill-card-${skill.id}`} className={styles.card} key={skill.id} onClick={() => setDetail(skill)}><SkillCover skill={skill} /><div className={styles.cardText}><div><strong>{skill.name}</strong>{selected?.id === skill.id ? <Check size={16} /> : <ArrowUpRight size={15} />}</div><p>{skill.description}</p><span>{skill.category}</span></div></button>)}</div>}
          {!loading && !visible.length && <div className={styles.empty}>{query ? "未找到匹配的 Skill" : tab === "personal" ? "暂无个人 Skills" : "此分类暂无 Skills"}</div>}
          {tab === "personal" && <button className={styles.fromChat} disabled={!hasConversation || !sessionId || saving} onClick={() => {
            const id = epoch.current; void mutate(async () => { const data = await api("POST", { action: "conversation-draft", sessionId }); if (id !== epoch.current || !alive.current) return; setEditing(null); setDraft({ ...empty(), name: "我的创作流程", description: "复用这次对话的创作要求", instructions: data.instructions }); });
          }}><Sparkles size={16} />从当前对话创建</button>}
        </>}
      </div>
      {(draft || detail) && <footer className={styles.footer}>{draft ? <><button disabled={saving} onClick={() => setDraft(null)}>取消</button><button className={styles.primary} type="submit" form="image-skill-form" disabled={saving}>{saving ? "保存中…" : "保存 Skill"}</button></> : detail && <><button onClick={close}>取消</button><button className={styles.primary} disabled={busy || saving} onClick={() => { onSelect(detail); onUse?.(`使用「${detail.name}」，`); close(); }}>使用 Skill<ArrowUpRight size={16} /></button></>}</footer>}
      <input ref={file} type="file" accept=".json,application/json" className={styles.hidden} onChange={event => {
        const uploaded = event.target.files?.[0]; event.target.value = ""; if (!uploaded) return;
        const id = epoch.current; void mutate(async () => { if (uploaded.size > 32768) throw new Error("技能文件不超过 32KB"); const data = JSON.parse(await uploaded.text()); if (data.format !== "naumi-image-skill" || data.version !== 1) throw new Error("请选择 Naumi 导出的 Skill JSON 文件"); const definition = validateSkillDraft(data.definition); if (id !== epoch.current || !alive.current) return; setDraft(definition); setEditing(null); });
      }} />
    </div>
  </div>;
  return <div className={styles.entry} data-testid="image-skills-entry">
    <button ref={trigger} type="button" disabled={busy} className={`${styles.trigger} ${compact ? styles.compact : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setDetail(null); setDraft(null); setOpen(true); }}><BookOpen size={16} /><span>Skills</span></button>
    {selected && <span className={styles.selected} title={selected.name}><span>{selected.name}</span><button type="button" aria-label="取消技能选择" disabled={busy} onClick={() => onSelect(null)}><X size={12} /></button></span>}
    {view && createPortal(view, document.body)}
  </div>;
}
function SkillCover({ skill, large }: { skill: ImageSkill; large?: boolean }) {
  const Icon = categoryIcon[skill.category];
  return <div className={`${styles.cover} ${large ? styles.largeCover : ""}`} data-category={skill.category} aria-hidden="true"><div className={styles.paper}><Icon strokeWidth={1.3} /><span /><span /></div><div className={styles.coverBadge}><Sparkles size={14} /></div></div>;
}
