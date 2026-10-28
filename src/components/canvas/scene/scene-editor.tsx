"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Redo2, Save, Sparkles, Star, Trash2, Undo2, Upload, Mountain, X } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import { browserRandomUUID } from "@/lib/browser-crypto";
import { sceneStateWithReferences, sceneProjectSchema, type SceneState, type SceneProject } from "@/lib/scene/project";
import type { CanvasSceneNode } from "@/lib/canvas/scene-node-schema";
import type { VideoInputChoice } from "@/lib/video/client-settings";
import s from "./scene-editor.module.css";

type Props = {
  node: CanvasSceneNode; images: VideoInputChoice[]; english?: boolean; readOnly: boolean; draftScope: string;
  onSave: (scene: SceneProject, revision: number) => Promise<CanvasSceneNode>;
  onUpload: (files: File[]) => Promise<VideoInputChoice[]>;
  onGenerate?: (scene: SceneProject, stateId: string) => Promise<void>;
  onClose: () => void;
};
export function SceneEditor({ node, images, english = false, readOnly, draftScope, onSave, onUpload, onGenerate, onClose }: Props) {
  const L = (zh: string, en: string) => english ? en : zh;
  const cacheKey = `naumi:scene-draft:${draftScope}:${node.id}`;
  const restored = useRef<{ scene: SceneProject; revision: number } | null | undefined>(undefined);
  if (restored.current === undefined) {
    restored.current = null;
    try { const value = !readOnly && JSON.parse(sessionStorage.getItem(cacheKey) || "null"); if (value && Number.isSafeInteger(value.revision) && value.revision > 0) restored.current = { scene: sceneProjectSchema.parse(value.scene), revision: value.revision }; } catch {}
  }
  const [draft, setDraft] = useState(() => structuredClone(restored.current?.scene || node.scene));
  const [stateId, setStateId] = useState(draft.defaultStateId);
  const [busy, setBusy] = useState<"save" | "upload" | "generate" | null>(null), [error, setError] = useState(""), [historyVersion, setHistoryVersion] = useState(0);
  const dialog = useRef<HTMLDivElement>(null), upload = useRef<HTMLInputElement>(null), current = useRef(draft), saved = useRef(JSON.stringify(node.scene));
  type EditSnapshot = { scene: SceneProject; stateId: string };
  const revision = useRef(restored.current?.revision || node.revision), undo = useRef<EditSnapshot[]>([]), redo = useRef<EditSnapshot[]>([]), alive = useRef(true), lock = useRef(false);
  current.current = draft;
  const state = draft.states.find(item => item.id === stateId) || draft.states[0];
  const dirty = JSON.stringify(draft) !== saved.current, disabled = readOnly || !!busy;
  const cover = images.find(image => image.nodeId === (state.background?.artworkId || state.referenceArtworkIds[0]));
  const change = useCallback((update: (scene: SceneProject) => SceneProject) => {
    const before = current.current, next = update(before);
    if (JSON.stringify(before) === JSON.stringify(next)) return;
    undo.current = [...undo.current.slice(-49), { scene: before, stateId }]; redo.current = [];
    current.current = next; setDraft(next); setError(""); setHistoryVersion(value => value + 1);
  }, [stateId]);
  function patchState(patch: Partial<SceneState>) { change(scene => ({ ...scene, states: scene.states.map(item => item.id === state.id ? { ...(patch.referenceArtworkIds ? sceneStateWithReferences(item, patch.referenceArtworkIds) : item), ...patch } : item) })); }
  function history(forward: boolean) {
    const source = forward ? redo : undo, target = forward ? undo : redo, next = source.current.pop();
    if (!next) return;
    target.current.push({ scene: current.current, stateId });
    current.current = next.scene; setDraft(next.scene);
    setStateId(next.scene.states.some(item => item.id === next.stateId) ? next.stateId : next.scene.defaultStateId);
    setHistoryVersion(historyVersion + 1); setError("");
  }
  useEffect(() => {
    if (readOnly) return;
    const cache = () => { try { if (JSON.stringify(current.current) !== saved.current) sessionStorage.setItem(cacheKey, JSON.stringify({ scene: current.current, revision: revision.current })); else sessionStorage.removeItem(cacheKey); } catch {} };
    const timer = setTimeout(cache, 300); return () => { clearTimeout(timer); cache(); };
  }, [draft, cacheKey, readOnly]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function persist() {
    if (readOnly || JSON.stringify(current.current) === saved.current) return;
    const parsed = sceneProjectSchema.safeParse(current.current);
    if (!parsed.success) throw new Error(L("请填写有效的场景名称、状态及参考素材", "Enter a valid scene name, state and references"));
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
  return <div ref={dialog} className={s.overlay} role="dialog" aria-modal="true" aria-label={L("场景", "Scene")} data-testid="scene-editor" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <section className={s.dialog}>
      <header className={s.header}><Mountain size={17}/><h2>{L("场景", "Scene")}</h2><span className={s.spacer}/><div className={s.tools}>
        <button type="button" className={s.button} disabled={disabled || !undo.current.length} aria-label={L("撤销场景编辑", "Undo scene edit")} onClick={() => history(false)}><Undo2 size={14}/></button>
        <button type="button" className={s.button} disabled={disabled || !redo.current.length} aria-label={L("重做场景编辑", "Redo scene edit")} onClick={() => history(true)}><Redo2 size={14}/></button>
      </div><button type="button" className={s.button} disabled={!!busy} aria-label={L("保存并关闭场景", "Save and close scene")} onClick={() => void close()}><X size={16}/></button></header>
      <div className={s.body}>
        <aside className={s.preview}><div className={s.hero}>{cover ? <CachedImage src={cover.value} alt={draft.name}/> : <Mountain size={72} strokeWidth={1}/>}</div><div className={s.previewName}><span>{draft.name}</span><span>{state.name}</span></div>
          {onGenerate && <button type="button" className={s.button} disabled={disabled} onClick={() => void act("generate", async () => { await persist(); await onGenerate(current.current, state.id); onClose(); })}><Sparkles size={14}/>{L("生成参考图", "Generate reference")}</button>}
        </aside>
        <main className={s.main}><fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <label className={s.field}>{L("名称", "Name")}<input aria-label={L("场景名称", "Scene name")} value={draft.name} maxLength={100} onChange={event => change(scene => ({ ...scene, name: event.target.value }))}/></label>
          <label className={s.field}>{L("场景设定", "Scene identity")}<textarea aria-label={L("场景设定", "Scene identity")} rows={3} value={draft.description} maxLength={8000} onChange={event => change(scene => ({ ...scene, description: event.target.value }))}/></label>
        </fieldset>
          <div className={s.section}><div className={s.heading}><span>{L("状态", "States")}</span><button type="button" className={s.button} disabled={disabled} aria-label={L("添加状态", "Add state")} onClick={() => { const id = browserRandomUUID(); change(scene => ({ ...scene, states: [...scene.states, { id, name: `${L("状态", "State")} ${scene.states.length + 1}`, description: "", referenceArtworkIds: [...state.referenceArtworkIds], background: state.background ? {...state.background} : null }] })); setStateId(id); }}><Plus size={13}/></button></div>
            <div className={s.states}>{draft.states.map(item => <button type="button" key={item.id} className={`${s.button} ${item.id === state.id ? s.active : ""}`} disabled={!!busy} onClick={() => setStateId(item.id)}>{item.id === draft.defaultStateId && <Star size={11}/>}<span>{item.name}</span></button>)}</div>
            <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><div className={s.stateHeader}><label className={s.field}>{L("状态名称", "State name")}<input aria-label={L("状态名称", "State name")} value={state.name} maxLength={80} onChange={event => patchState({ name: event.target.value })}/></label><button type="button" className={s.button} aria-label={L("设为默认状态", "Set default state")} disabled={disabled || state.id === draft.defaultStateId} onClick={() => change(scene => ({ ...scene, defaultStateId: state.id }))}><Star size={13}/></button><button type="button" className={s.button} aria-label={L("删除当前状态", "Delete state")} disabled={disabled || draft.states.length === 1} onClick={() => { change(scene => ({ ...scene, defaultStateId: scene.defaultStateId === state.id ? scene.states.find(item => item.id !== state.id)!.id : scene.defaultStateId, states: scene.states.filter(item => item.id !== state.id) })); setStateId(draft.states.find(item => item.id !== state.id)!.id); }}><Trash2 size={13}/></button></div>
              <label className={s.field}>{L("状态设定", "State details")}<textarea aria-label={L("状态设定", "State details")} rows={2} value={state.description} maxLength={4000} onChange={event => patchState({ description: event.target.value })}/></label>
            </fieldset>
          </div>
          <div className={s.section}><div className={s.heading}><span>{L("参考图片", "Reference images")}</span><button type="button" className={s.button} disabled={disabled} onClick={() => upload.current?.click()}><Upload size={13}/>{L("上传", "Upload")}</button></div>
            <div className={s.images}>{state.referenceArtworkIds.map((id, index) => { const image = images.find(item => item.nodeId === id); return <div key={id} className={s.image}>{image ? <CachedImage src={image.value} alt={image.title}/> : <Mountain size={24}/>}<button type="button" className={s.remove} disabled={disabled} aria-label={`${L("移除场景参考图", "Remove scene reference")} ${index + 1}`} onClick={() => patchState({ referenceArtworkIds: state.referenceArtworkIds.filter(item => item !== id) })}><X size={12}/></button><button type="button" className={s.cover} disabled={disabled || state.background?.artworkId === id} aria-label={`${L("设为场景主图", "Set scene cover")} ${index + 1}`} onClick={() => patchState({ referenceArtworkIds: [id, ...state.referenceArtworkIds.filter(item => item !== id)], background: {artworkId: id, projection: state.background?.artworkId === id ? state.background.projection : "image"} })}>{state.background?.artworkId === id ? <Check size={11}/> : <Star size={11}/>}</button></div>; })}</div>
            <label className={s.field}>{L("背景图片", "Background image")}<select aria-label={L("场景背景图片", "Scene background image")} disabled={disabled} value={state.background?.artworkId || ""} onChange={event => patchState({background: event.target.value ? {artworkId: event.target.value, projection: "image"} : null})}><option value="">{L("无", "None")}</option>{state.referenceArtworkIds.map(id => {const image=images.find(item=>item.nodeId===id);return <option key={id} value={id} disabled={!image?.available}>{image?.title || L("素材已不可用","Asset unavailable")}</option>;})}</select></label>
            {state.background && <label className={s.field}>{L("背景方式", "Background mode")}<select aria-label={L("场景背景方式", "Scene background mode")} disabled={disabled} value={state.background.projection} onChange={event => patchState({background:{...state.background!,projection:event.target.value as "image"|"panorama"}})}><option value="image">{L("图片", "Image")}</option><option value="panorama">{L("全景", "Panorama")}</option></select></label>}
            <label className={s.field}>{L("添加图片", "Add image")}<select aria-label={L("添加场景参考图", "Add scene reference")} disabled={disabled} value="" onChange={event => { if (event.target.value) patchState({ referenceArtworkIds: [...state.referenceArtworkIds, event.target.value] }); }}><option value="">{L("选择素材", "Choose asset")}</option>{images.filter(image => image.kind === "image" && !state.referenceArtworkIds.includes(image.nodeId)).map(image => <option key={image.nodeId} value={image.nodeId} disabled={!image.available}>{image.title}</option>)}</select></label>
          </div>
        </main>
      </div>
      <footer className={s.footer}>{error && <span className={s.error} role="status">{error}</span>}{error && node.revision !== revision.current && <button type="button" className={s.button} disabled={!!busy} onClick={() => { const latest = structuredClone(node.scene); change(() => latest); revision.current = node.revision; saved.current = JSON.stringify(latest); setStateId(latest.defaultStateId); setError(""); }}>{L("读取最新场景", "Read latest scene")}</button>}<span className={s.spacer}/>{busy && <Loader2 size={15} className="animate-spin"/>}<button type="button" className={s.button} disabled={!!busy} onClick={() => void close()}>{L("完成", "Done")}</button><button type="button" className={`${s.button} ${s.primary}`} aria-label={L("保存场景", "Save scene")} disabled={disabled || !dirty} onClick={() => void act("save", persist)}><Save size={14}/>{L("保存", "Save")}</button></footer>
      <input ref={upload} className={s.hidden} disabled={disabled} type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label={L("上传场景参考图", "Upload scene references")} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; if (!files.length || disabled) return; const target = state.id; void act("upload", async () => { const choices = await onUpload(files); if (alive.current) change(scene => ({ ...scene, states: scene.states.map(item => item.id === target ? { ...sceneStateWithReferences(item, [...item.referenceArtworkIds, ...choices.map(choice => choice.nodeId)]) } : item) })); }); }}/>
    </section>
  </div>;
}
