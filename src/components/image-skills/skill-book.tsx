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
const MAX_IMPORT_BYTES = 512 * 1024;
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
  const [importing, setImporting] = useState(false), [dragging, setDragging] = useState(false), [notice, setNotice] = useState("");
  const file = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), epoch = useRef(0), alive = useRef(true);
  const importRequest = useRef<AbortController | null>(null), dragDepth = useRef(0), currentAccount = useRef(accountKey);
  currentAccount.current = accountKey;
  const previousAccount = useRef(accountKey);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  useEffect(() => { alive.current = true; return () => { alive.current = false; epoch.current++; importRequest.current?.abort(); importRequest.current = null; }; }, []);
  useEffect(() => { if (previousAccount.current === accountKey) return; previousAccount.current = accountKey; epoch.current++; importRequest.current?.abort(); importRequest.current = null; dragDepth.current = 0; setItems(OFFICIAL_IMAGE_SKILLS); setOpen(false); setDetail(null); setDraft(null); setEditing(null); setError(""); setNotice(""); setSaving(false); setImporting(false); setDragging(false); setLoading(false); selectRef.current(null); }, [accountKey]);
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
  function close() { if (saving || importRequest.current) return; dragDepth.current = 0; setDragging(false); setOpen(false); setDraft(null); setDetail(null); setError(""); setNotice(""); }
  async function mutate(action: () => Promise<void>) {
    if (saving || importRequest.current) return; const id = epoch.current; setSaving(true); setError(""); setNotice("");
    try { await action(); } catch (err) { if (alive.current && id === epoch.current) setError(err instanceof Error ? err.message : "操作失败"); }
    finally { if (alive.current && id === epoch.current) setSaving(false); }
  }
  function edit(skill?: ImageSkill, copy = false) {
    setEditing(skill?.source === "personal" && !copy ? skill : null);
    setDraft(skill ? { name: copy ? `${skill.name}副本`.slice(0, 48) : skill.name, description: skill.description, category: skill.category, instructions: skill.instructions } : empty());
    setError(""); setNotice("");
  }
  async function importFiles(files: FileList | File[]) {
    if (saving || importRequest.current || !alive.current) return;
    setError(""); setNotice("");
    if (files.length !== 1) { setError("请一次上传一个 Skill 文件"); return; }
    const uploaded = files[0];
    if (!/\.(md|zip|json)$/i.test(uploaded.name)) { setError("请选择 .md、.zip 或 .json Skill 文件"); return; }
    if (!uploaded.size) { setError("Skill 文件内容为空"); return; }
    if (uploaded.size > MAX_IMPORT_BYTES) { setError("Skill 文件不超过 512 KiB"); return; }
    // Acquire the mutex before any await; a second drop/change in the same tick must not submit again.
    const controller = new AbortController(); importRequest.current = controller;
    const id = ++epoch.current, account = currentAccount.current;
    const active = () => alive.current && id === epoch.current && currentAccount.current === account && importRequest.current === controller;
    setSaving(true); setImporting(true); setLoading(false);
    try {
      const headers = await authHeader();
      if (!active()) return;
      const body = new FormData(); body.append("file", uploaded);
      const response = await fetch("/api/image-skills/import", { method: "POST", headers, body, signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!active()) return;
      if (!response.ok) throw new Error(data.error || "Skill 导入失败，请重试");
      const skill: ImageSkill = data.skill;
      setItems(current => [skill, ...current.filter(item => item.id !== skill.id)]);
      setTab("personal"); setCategory("全部"); setQuery(""); setDraft(null); setEditing(null); setDetail(skill);
      const warnings = Array.isArray(data.warnings) ? data.warnings.filter((warning: unknown) => typeof warning === "string").join("；") : "";
      setNotice(`${data.duplicate ? "此 Skill 已在我的 Skills 中" : "已导入到我的 Skills"}${warnings ? `。${warnings}` : ""}`);
    } catch (err) {
      if (active() && !controller.signal.aborted) setError(err instanceof Error ? err.message : "Skill 导入失败，请重试");
    } finally {
      if (active()) { importRequest.current = null; setSaving(false); setImporting(false); }
    }
  }
  function showLibrary() { setDetail(null); setDraft(null); setNotice(""); setError(""); setOpen(true); }
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
  const view = open && <div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) close(); }} onPointerDown={event => event.stopPropagation()} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.stopPropagation(); } }} onDrop={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="创作 Skills" ref={dialog} data-testid="skill-book-dialog" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.stopPropagation(); } }} onDrop={event => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={event => {
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
      {notice && <div className={styles.notice} role="status"><Check size={15} /><span>{notice}</span></div>}
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
            <div className={styles.actions}><button aria-label="导入 Skill" title="导入 Skill" disabled={saving} onClick={() => file.current?.click()}><Upload size={17} /></button><button className={styles.create} disabled={saving} onClick={() => edit()}><Plus size={16} />创建</button></div></div>
          <button type="button" data-testid="skill-import-dropzone" className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`} disabled={saving} aria-busy={importing} onClick={() => file.current?.click()}
            onDragEnter={event => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); event.stopPropagation(); if (saving || importRequest.current) return; dragDepth.current++; setDragging(true); }}
            onDragOver={event => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = saving ? "none" : "copy"; }}
            onDragLeave={event => { event.preventDefault(); event.stopPropagation(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
            onDrop={event => { event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); void importFiles(event.dataTransfer.files); }}>
            <span className={styles.uploadIcon}>{importing ? <Loader2 size={21} className={styles.spin} /> : <Upload size={21} />}</span><span><strong>{importing ? "正在导入 Skill…" : "拖拽 Skill 文件到这里，或点击上传"}</strong><small>.md / .zip / .json · 单个文件，最多 512 KiB</small></span>
          </button>
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
      <input ref={file} type="file" accept=".md,.zip,.json,text/markdown,application/zip,application/json" aria-label="上传 Skill 文件" disabled={saving} className={styles.hidden} onChange={event => {
        const files = Array.from(event.target.files ?? []); event.target.value = ""; if (!files.length) return;
        void importFiles(files);
      }} />
    </div>
  </div>;
  return <div className={styles.entry} data-testid="image-skills-entry">
    <button ref={trigger} type="button" disabled={busy} className={`${styles.trigger} ${compact ? styles.compact : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={showLibrary}><BookOpen size={16} /><span>Skills</span></button>
    {!compact && <button type="button" disabled={busy || saving} className={`${styles.trigger} ${styles.importEntry}`} aria-haspopup="dialog" onClick={() => { setTab("personal"); setCategory("全部"); setQuery(""); showLibrary(); }}><Upload size={14} /><span>导入 Skill</span></button>}
    {selected && <span className={styles.selected} title={selected.name}><span>{selected.name}</span><button type="button" aria-label="取消技能选择" disabled={busy} onClick={() => onSelect(null)}><X size={12} /></button></span>}
    {view && createPortal(view, document.body)}
  </div>;
}
function SkillCover({ skill, large }: { skill: ImageSkill; large?: boolean }) {
  const Icon = categoryIcon[skill.category];
  return <div className={`${styles.cover} ${large ? styles.largeCover : ""}`} data-category={skill.category} aria-hidden="true"><div className={styles.paper}><Icon strokeWidth={1.3} /><span /><span /></div><div className={styles.coverBadge}><Sparkles size={14} /></div></div>;
}
