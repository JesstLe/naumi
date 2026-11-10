"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Redo2, Save, Sparkles, Star, Trash2, Undo2, Upload, UserRound, X } from "lucide-react";
import {CanvasGrowingTextarea} from "../growing-textarea";
import { CachedImage } from "@/components/cached-image";
import { browserRandomUUID } from "@/lib/browser-crypto";
import { characterProjectSchema, type CharacterAppearance, type CharacterProject } from "@/lib/character/project";
import type { CanvasCharacterNode } from "@/lib/canvas/character-node-schema";
import type { VideoInputChoice } from "@/lib/video/client-settings";
import s from "./character-editor.module.css";

type Props = {
  node: CanvasCharacterNode; images: VideoInputChoice[]; english?: boolean; readOnly: boolean; draftScope: string;
  onSave: (character: CharacterProject, revision: number) => Promise<CanvasCharacterNode>;
  onUpload: (files: File[]) => Promise<VideoInputChoice[]>;
  onGenerate?: (character: CharacterProject, appearanceId: string) => Promise<void>;
  onClose: () => void;
};
export function CharacterEditor({ node, images, english = false, readOnly, draftScope, onSave, onUpload, onGenerate, onClose }: Props) {
  const L = (zh: string, en: string) => english ? en : zh;
  const cacheKey = `naumi:character-draft:${draftScope}:${node.id}`;
  const restored = useRef<{ character: CharacterProject; revision: number } | null | undefined>(undefined);
  if (restored.current === undefined) {
    restored.current = null;
    try { const value = !readOnly && JSON.parse(sessionStorage.getItem(cacheKey) || "null"); if (value && Number.isSafeInteger(value.revision) && value.revision > 0) restored.current = { character: characterProjectSchema.parse(value.character), revision: value.revision }; } catch {}
  }
  const [draft, setDraft] = useState(() => structuredClone(restored.current?.character || node.character));
  const [appearanceId, setAppearanceId] = useState(draft.defaultAppearanceId);
  const [busy, setBusy] = useState<"save" | "upload" | "generate" | null>(null), [error, setError] = useState(""), [historyVersion, setHistoryVersion] = useState(0);
  const dialog = useRef<HTMLDivElement>(null), upload = useRef<HTMLInputElement>(null), current = useRef(draft), saved = useRef(JSON.stringify(node.character));
  type EditSnapshot = { character: CharacterProject; appearanceId: string };
  const revision = useRef(restored.current?.revision || node.revision), undo = useRef<EditSnapshot[]>([]), redo = useRef<EditSnapshot[]>([]), alive = useRef(true), lock = useRef(false);
  current.current = draft;
  const appearance = draft.appearances.find(item => item.id === appearanceId) || draft.appearances[0];
  const dirty = JSON.stringify(draft) !== saved.current, disabled = readOnly || !!busy;
  const cover = images.find(image => image.nodeId === appearance.referenceArtworkIds[0]);
  const change = useCallback((update: (character: CharacterProject) => CharacterProject) => {
    const before = current.current, next = update(before);
    if (JSON.stringify(before) === JSON.stringify(next)) return;
    undo.current = [...undo.current.slice(-49), { character: before, appearanceId }]; redo.current = [];
    current.current = next; setDraft(next); setError(""); setHistoryVersion(value => value + 1);
  }, [appearanceId]);
  function patchAppearance(patch: Partial<CharacterAppearance>) { change(character => ({ ...character, appearances: character.appearances.map(item => item.id === appearance.id ? { ...item, ...patch } : item) })); }
  function history(forward: boolean) {
    const source = forward ? redo : undo, target = forward ? undo : redo, next = source.current.pop();
    if (!next) return;
    target.current.push({ character: current.current, appearanceId });
    current.current = next.character; setDraft(next.character);
    setAppearanceId(next.character.appearances.some(item => item.id === next.appearanceId) ? next.appearanceId : next.character.defaultAppearanceId);
    setHistoryVersion(historyVersion + 1); setError("");
  }
  useEffect(() => {
    if (readOnly) return;
    const cache = () => { try { if (JSON.stringify(current.current) !== saved.current) sessionStorage.setItem(cacheKey, JSON.stringify({ character: current.current, revision: revision.current })); else sessionStorage.removeItem(cacheKey); } catch {} };
    const timer = setTimeout(cache, 300); return () => { clearTimeout(timer); cache(); };
  }, [draft, cacheKey, readOnly]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function persist() {
    if (readOnly || JSON.stringify(current.current) === saved.current) return;
    const parsed = characterProjectSchema.safeParse(current.current);
    if (!parsed.success) throw new Error(L("请填写有效的角色名称、外观及参考素材", "Enter a valid character name, look and references"));
    const result = await onSave(parsed.data, revision.current);
    revision.current = result.revision; saved.current = JSON.stringify(parsed.data);
    try { sessionStorage.removeItem(cacheKey); } catch {}
    if (alive.current) setHistoryVersion(value => value + 1);
  }
  async function act(kind: NonNullable<typeof busy>, action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(kind); setError("");
    try { await action(); } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : L("操作未完成", "Action did not complete")); }
    finally { lock.current = false; if (alive.current) setBusy(null); }
  }
  const close = async () => act("save", async () => { await persist(); onClose(); });
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement; dialog.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); void closeRef.current(); }
      if (event.key === "Tab") {
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') || []).filter(item => item.getClientRects().length > 0);
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <div ref={dialog} className={s.overlay} role="dialog" aria-modal="true" aria-label={L("角色", "Character")} data-testid="character-editor" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <section className={s.dialog}>
      <header className={s.header}><UserRound size={17}/><h2>{L("角色", "Character")}</h2><span className={s.spacer}/><div className={s.tools}>
        <button type="button" className={s.button} disabled={disabled || !undo.current.length} aria-label={L("撤销角色编辑", "Undo character edit")} onClick={() => history(false)}><Undo2 size={14}/></button>
        <button type="button" className={s.button} disabled={disabled || !redo.current.length} aria-label={L("重做角色编辑", "Redo character edit")} onClick={() => history(true)}><Redo2 size={14}/></button>
      </div><button type="button" className={s.button} disabled={!!busy} aria-label={L("保存并关闭角色", "Save and close character")} onClick={() => void close()}><X size={16}/></button></header>
      <div className={s.body}>
        <aside className={s.preview}><div className={s.hero}>{cover ? <CachedImage src={cover.value} alt={draft.name}/> : <UserRound size={72} strokeWidth={1}/>}</div><div className={s.previewName}><span>{draft.name}</span><span>{appearance.name}</span></div>
          {onGenerate && <button type="button" className={s.button} disabled={disabled} onClick={() => void act("generate", async () => { await persist(); await onGenerate(current.current, appearance.id); onClose(); })}><Sparkles size={14}/>{L("生成参考图", "Generate reference")}</button>}
        </aside>
        <main className={s.main}><fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <label className={s.field}>{L("名称", "Name")}<input aria-label={L("角色名称", "Character name")} value={draft.name} maxLength={100} onChange={event => change(character => ({ ...character, name: event.target.value }))}/></label>
          <label className={s.field}>{L("角色设定", "Character identity")}<CanvasGrowingTextarea aria-label={L("角色设定", "Character identity")} rows={3} value={draft.description} maxLength={8000} onChange={event => change(character => ({ ...character, description: event.target.value }))}/></label>
        </fieldset>
          <div className={s.section}><div className={s.heading}><span>{L("外观", "Looks")}</span><button type="button" className={s.button} disabled={disabled} aria-label={L("添加外观", "Add look")} onClick={() => { const id = browserRandomUUID(); change(character => ({ ...character, appearances: [...character.appearances, { id, name: `${L("外观", "Look")} ${character.appearances.length + 1}`, description: "", referenceArtworkIds: [...appearance.referenceArtworkIds] }] })); setAppearanceId(id); }}><Plus size={13}/></button></div>
            <div className={s.looks}>{draft.appearances.map(item => <button type="button" key={item.id} className={`${s.button} ${item.id === appearance.id ? s.active : ""}`} disabled={!!busy} onClick={() => setAppearanceId(item.id)}>{item.id === draft.defaultAppearanceId && <Star size={11}/>}<span>{item.name}</span></button>)}</div>
            <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><div className={s.lookHeader}><label className={s.field}>{L("外观名称", "Look name")}<input aria-label={L("外观名称", "Look name")} value={appearance.name} maxLength={80} onChange={event => patchAppearance({ name: event.target.value })}/></label><button type="button" className={s.button} aria-label={L("设为默认外观", "Set default look")} disabled={disabled || appearance.id === draft.defaultAppearanceId} onClick={() => change(character => ({ ...character, defaultAppearanceId: appearance.id }))}><Star size={13}/></button><button type="button" className={s.button} aria-label={L("删除当前外观", "Delete look")} disabled={disabled || draft.appearances.length === 1} onClick={() => { change(character => ({ ...character, defaultAppearanceId: character.defaultAppearanceId === appearance.id ? character.appearances.find(item => item.id !== appearance.id)!.id : character.defaultAppearanceId, appearances: character.appearances.filter(item => item.id !== appearance.id) })); setAppearanceId(draft.appearances.find(item => item.id !== appearance.id)!.id); }}><Trash2 size={13}/></button></div>
              <label className={s.field}>{L("外观设定", "Look details")}<CanvasGrowingTextarea aria-label={L("外观设定", "Look details")} rows={2} value={appearance.description} maxLength={4000} onChange={event => patchAppearance({ description: event.target.value })}/></label>
            </fieldset>
          </div>
          <div className={s.section}><div className={s.heading}><span>{L("参考图片", "Reference images")}</span><button type="button" className={s.button} disabled={disabled} onClick={() => upload.current?.click()}><Upload size={13}/>{L("上传", "Upload")}</button></div>
            <div className={s.images}>{appearance.referenceArtworkIds.map((id, index) => { const image = images.find(item => item.nodeId === id); return <div key={id} className={s.image}>{image ? <CachedImage src={image.value} alt={image.title}/> : <UserRound size={24}/>}<button type="button" className={s.remove} disabled={disabled} aria-label={`${L("移除角色参考图", "Remove character reference")} ${index + 1}`} onClick={() => patchAppearance({ referenceArtworkIds: appearance.referenceArtworkIds.filter(item => item !== id) })}><X size={12}/></button><button type="button" className={s.cover} disabled={disabled || index === 0} aria-label={`${L("设为角色主图", "Set character cover")} ${index + 1}`} onClick={() => patchAppearance({ referenceArtworkIds: [id, ...appearance.referenceArtworkIds.filter(item => item !== id)] })}>{index === 0 ? <Check size={11}/> : <Star size={11}/>}</button></div>; })}</div>
            <label className={s.field}>{L("添加图片", "Add image")}<select aria-label={L("添加角色参考图", "Add character reference")} disabled={disabled} value="" onChange={event => { if (event.target.value) patchAppearance({ referenceArtworkIds: [...appearance.referenceArtworkIds, event.target.value] }); }}><option value="">{L("选择素材", "Choose asset")}</option>{images.filter(image => image.kind === "image" && !appearance.referenceArtworkIds.includes(image.nodeId)).map(image => <option key={image.nodeId} value={image.nodeId} disabled={!image.available}>{image.title}</option>)}</select></label>
          </div>
        </main>
      </div>
      <footer className={s.footer}>{error && <span className={s.error} role="status">{error}</span>}{error && node.revision !== revision.current && <button type="button" className={s.button} disabled={!!busy} onClick={() => { const latest = structuredClone(node.character); change(() => latest); revision.current = node.revision; saved.current = JSON.stringify(latest); setAppearanceId(latest.defaultAppearanceId); setError(""); }}>{L("读取最新角色", "Read latest character")}</button>}<span className={s.spacer}/>{busy && <Loader2 size={15} className="animate-spin"/>}<button type="button" className={s.button} disabled={!!busy} onClick={() => void close()}>{L("完成", "Done")}</button><button type="button" className={`${s.button} ${s.primary}`} aria-label={L("保存角色", "Save character")} disabled={disabled || !dirty} onClick={() => void act("save", persist)}><Save size={14}/>{L("保存", "Save")}</button></footer>
      <input ref={upload} className={s.hidden} disabled={disabled} type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label={L("上传角色参考图", "Upload character references")} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; if (!files.length || disabled) return; const target = appearance.id; void act("upload", async () => { const choices = await onUpload(files); if (alive.current) change(character => ({ ...character, appearances: character.appearances.map(item => item.id === target ? { ...item, referenceArtworkIds: [...new Set([...item.referenceArtworkIds, ...choices.map(choice => choice.nodeId)])] } : item) })); }); }}/>
    </section>
  </div>;
}
