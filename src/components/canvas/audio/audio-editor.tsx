"use client";
import {useCallback, useEffect, useRef, useState} from "react";
import {Download, Loader2, Music2, Pause, Play, Redo2, Save, Scissors, Undo2, Upload, X} from "lucide-react";
import {audioProjectSchema, effectiveAudioEdit, hasUnappliedAudioEdit, newAudioProject, withAudioSource, type AudioProject} from "@/lib/audio/project";
import type {CanvasAudioNode} from "@/lib/canvas/audio-node-schema";
import type {VideoInputChoice} from "@/lib/video/client-settings";
import type {PublicMediaJob} from "@/lib/video/media-job-schema";
import {mediaDownloadHref} from "../video/player";
import {useAudioPreview} from "./use-audio-preview";
import s from "./audio-editor.module.css";

type Props = {node: CanvasAudioNode; sources: VideoInputChoice[]; jobs: PublicMediaJob[]; draftScope: string; english?: boolean; readOnly: boolean;
  onSave: (audio: AudioProject, revision: number) => Promise<CanvasAudioNode>; onUpload: (files: File[]) => Promise<VideoInputChoice[]>;
  onRender: (revision: number) => Promise<{node: CanvasAudioNode; job: PublicMediaJob}>; onCancel: (id: string) => Promise<void>;
  onAdopt: (job: PublicMediaJob) => Promise<CanvasAudioNode>; onQuote: () => Promise<{version: number; credits: number}>; onClose: () => void;};
const time = (value: number) => `${Math.floor(value / 60)}:${(value % 60).toFixed(2).padStart(5, "0")}`;
export function AudioEditor({node, sources, jobs, draftScope, english = false, readOnly, onSave, onUpload, onRender, onCancel, onAdopt, onQuote, onClose}: Props) {
  const L = (zh: string, en: string) => english ? en : zh, cacheKey = `naumi:audio-draft:${draftScope}:${node.id}`;
  const restored = useRef<{audio: AudioProject; revision: number} | null | undefined>(undefined);
  if (restored.current === undefined) {restored.current = null; try {const value = !readOnly && JSON.parse(sessionStorage.getItem(cacheKey) || "null"); if (value && Number.isSafeInteger(value.revision) && value.revision > 0) restored.current = {audio: audioProjectSchema.parse(value.audio), revision: value.revision};} catch {}}
  const [draft, setDraft] = useState<AudioProject>(() => structuredClone(restored.current?.audio || node.audio)), [busy, setBusy] = useState(false), [error, setError] = useState(""), [, setHistory] = useState(0);
  const current = useRef(draft), saved = useRef(JSON.stringify(node.audio)), revision = useRef(restored.current?.revision || node.revision), undo = useRef<AudioProject[]>([]), redo = useRef<AudioProject[]>([]);
  const alive = useRef(true), lock = useRef(false), dialog = useRef<HTMLDivElement>(null), upload = useRef<HTMLInputElement>(null), wave = useRef<HTMLCanvasElement>(null); current.current = draft;
  const source = sources.find(choice => choice.nodeId === draft.sourceArtworkId), adopted = sources.find(choice => choice.nodeId === draft.adopted?.artworkId), preview = useAudioPreview(source?.value, draft.edit);
  const job = jobs.find(value => value.operationId === draft.render?.operationId), processing = job?.status === "queued" || job?.status === "processing", disabled = readOnly || busy;
  const [quote, setQuote] = useState<number | null>(null), quoteRef = useRef(onQuote); quoteRef.current = onQuote;
  useEffect(() => {let live = true; if (!readOnly) void quoteRef.current().then(value => {if (live) setQuote(value.credits);}).catch(() => {}); return () => {live = false;};}, [readOnly, cacheKey]);
  useEffect(() => {
    if (node.revision > revision.current && JSON.stringify(current.current) === saved.current) {revision.current = node.revision; saved.current = JSON.stringify(node.audio); current.current = structuredClone(node.audio); setDraft(current.current);}
  }, [node]);
  const change = useCallback((audio: AudioProject) => {undo.current.push(structuredClone(current.current)); redo.current = []; current.current = audio; setDraft(audio); setError(""); setHistory(value => value + 1);}, []);
  function history(forward: boolean) {const from = forward ? redo : undo, to = forward ? undo : redo, value = from.current.pop(); if (!value) return; to.current.push(structuredClone(current.current)); value.render = value.sourceArtworkId === current.current.sourceArtworkId ? current.current.render : null; current.current = value; setDraft(value); setHistory(n => n + 1); setError("");}
  useEffect(() => {if (!readOnly && JSON.stringify(draft) !== saved.current) try {sessionStorage.setItem(cacheKey, JSON.stringify({audio: draft, revision: revision.current}));} catch {}}, [draft, cacheKey, readOnly]);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  useEffect(() => {
    const canvas = wave.current, context = canvas?.getContext("2d"); if (!canvas || !context) return;
    const width = canvas.width, height = canvas.height; context.clearRect(0, 0, width, height); context.fillStyle = "#7181c5";
    preview.peaks.forEach((peak, index) => {const h = Math.max(1, peak * (height - 20)), x = index * width / preview.peaks.length; context.fillRect(x, (height - h) / 2, Math.max(1, width / preview.peaks.length - 1.5), h);});
  }, [preview.peaks]);
  async function act(action: () => Promise<void>) {if (lock.current) return; lock.current = true; setBusy(true); setError(""); try {await action();} catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : L("操作未完成", "Action did not complete"));} finally {lock.current = false; if (alive.current) setBusy(false);}}
  function accept(result: CanvasAudioNode) {revision.current = result.revision; saved.current = JSON.stringify(result.audio); current.current = structuredClone(result.audio); if (alive.current) setDraft(current.current); try {sessionStorage.removeItem(cacheKey);} catch {}}
  async function persist() {
    if (readOnly || JSON.stringify(current.current) === saved.current) return node;
    const parsed = audioProjectSchema.safeParse(current.current);
    if (!parsed.success) throw new Error(L(parsed.error.issues[0]?.message || "请检查音频编辑设定", "Check the audio source, selection and fades"));
    const audio = parsed.data; if (audio.sourceArtworkId && preview.duration) effectiveAudioEdit(audio.edit, preview.duration);
    const result = await onSave(audio, revision.current); accept(result); return result;
  }
  const closeRef = useRef<() => void>(() => {}); closeRef.current = () => {void act(async () => {await persist(); onClose();});};
  useEffect(() => {
    const previous = document.activeElement; dialog.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const key = (event: KeyboardEvent) => {if (event.key === "Escape") {event.preventDefault(); event.stopImmediatePropagation(); closeRef.current();} if (event.key === "Tab") {const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]') || []).filter(item => item.getClientRects().length); if (event.shiftKey && document.activeElement === items[0]) {event.preventDefault(); items.at(-1)?.focus();} else if (!event.shiftKey && document.activeElement === items.at(-1)) {event.preventDefault(); items[0]?.focus();}}};
    window.addEventListener("keydown", key, true); return () => {window.removeEventListener("keydown", key, true); if (previous instanceof HTMLElement && previous.isConnected) previous.focus();};
  }, []);
  function editField(key: keyof AudioProject["edit"], value: number | null) {change({...current.current, edit: {...current.current.edit, [key]: value}});}
  const start = Math.max(0, draft.edit.start), end = draft.edit.end ?? preview.duration, jobLabels = {queued: L("排队中", "Queued"), processing: L("处理中", "Processing"), completed: L("已完成", "Completed"), failed: L("失败", "Failed"), cancelled: L("已停止", "Stopped")};
  return <div ref={dialog} className={s.overlay} role="dialog" aria-modal="true" aria-label={L("音频编辑", "Audio editor")} data-testid="audio-editor" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <section className={s.dialog}><header className={s.header}><Music2 size={17}/><h2>{node.title}</h2><span className={s.spacer}/><button className={s.button} type="button" disabled={disabled || !undo.current.length} aria-label={L("撤销音频编辑", "Undo audio edit")} onClick={() => history(false)}><Undo2 size={14}/></button><button className={s.button} type="button" disabled={disabled || !redo.current.length} aria-label={L("重做音频编辑", "Redo audio edit")} onClick={() => history(true)}><Redo2 size={14}/></button><button className={s.button} type="button" disabled={busy} aria-label={L("保存并关闭音频", "Save and close audio")} onClick={() => closeRef.current()}><X size={16}/></button></header>
      <main className={s.main}>
        <div className={s.source}><select aria-label={L("音频素材", "Audio source")} disabled={disabled} value={draft.sourceArtworkId || ""} onChange={event => change(event.target.value ? withAudioSource(event.target.value) : newAudioProject())}><option value="">{L("选择音频", "Choose audio")}</option>{draft.sourceArtworkId && !source && <option value={draft.sourceArtworkId}>{L("来源已不可用", "Source unavailable")}</option>}{sources.filter(choice => choice.available).map(choice => <option key={choice.nodeId} value={choice.nodeId}>{choice.title}</option>)}</select><button type="button" className={s.button} disabled={disabled} onClick={() => upload.current?.click()}><Upload size={14}/>{L("导入", "Import")}</button><input ref={upload} type="file" aria-label={L("导入音频文件", "Import audio file")} accept="audio/*" className={s.hidden} disabled={disabled} onChange={event => {const file = event.target.files?.[0]; event.target.value = ""; if (file) void act(async () => {const choices = await onUpload([file]); if (choices[0]) change(withAudioSource(choices[0].nodeId));});}}/></div>
        <div className={s.wave} data-testid="audio-waveform" data-peaks={preview.peaks.length}><canvas ref={wave} width={900} height={150}/>{preview.duration > 0 && <div className={s.selection} style={{left: `${start / preview.duration * 100}%`, width: `${Math.max(0, end - start) / preview.duration * 100}%`}}/>}{!source && <Music2 size={44} strokeWidth={1}/>}</div>
        <audio ref={preview.media} src={source?.value} preload="metadata" onLoadedMetadata={preview.metadata} onEnded={preview.ended}/>
        <div className={s.transport}><button type="button" className={s.button} disabled={!source || !preview.duration} onClick={() => void preview.toggle()}>{preview.playing ? <Pause size={15}/> : <Play size={15}/>} {preview.playing ? L("暂停", "Pause") : L("播放", "Play")}</button><input type="range" aria-label={L("音频播放进度", "Audio playback position")} min={0} max={preview.duration || 1} step={0.01} value={Math.min(preview.current, preview.duration || 1)} disabled={!preview.duration} onChange={event => preview.seek(Number(event.target.value))}/><span>{time(preview.current)} / {time(preview.duration)}</span></div>
        <div className={s.fields}><label>{L("开始", "Start")}<input aria-label={L("音频开始秒数", "Audio start seconds")} type="number" min={0} step={0.01} disabled={disabled || !source} value={draft.edit.start} onChange={event => editField("start", Number(event.target.value))}/></label><label>{L("结束", "End")}<input aria-label={L("音频结束秒数", "Audio end seconds")} type="number" min={0} step={0.01} disabled={disabled || !source} value={draft.edit.end ?? (preview.duration || "")} onChange={event => editField("end", event.target.value ? Number(event.target.value) : null)}/></label><label>{L("淡入", "Fade in")}<input aria-label={L("音频淡入秒数", "Audio fade in seconds")} type="number" min={0} step={0.01} disabled={disabled || !source} value={draft.edit.fadeIn} onChange={event => editField("fadeIn", Number(event.target.value))}/></label><label>{L("淡出", "Fade out")}<input aria-label={L("音频淡出秒数", "Audio fade out seconds")} type="number" min={0} step={0.01} disabled={disabled || !source} value={draft.edit.fadeOut} onChange={event => editField("fadeOut", Number(event.target.value))}/></label></div>
        <label className={s.volume}>{L("音量", "Volume")}<input aria-label={L("音频音量", "Audio gain")} type="range" min={0} max={4} step={0.01} disabled={disabled || !source} value={draft.edit.gain} onChange={event => editField("gain", Number(event.target.value))}/><span>{Math.round(draft.edit.gain * 100)}%</span></label>
        <div className={s.status}>{hasUnappliedAudioEdit(draft) && <span>{L("未应用", "Unapplied")}</span>}{job && <span>{jobLabels[job.status]}{job.cost ? ` · ${job.cost} ${L("积分", "credits")}` : ""}</span>}{processing && job && <button className={s.button} type="button" disabled={disabled} onClick={() => void act(() => onCancel(job.id))}>{L("停止处理", "Stop processing")}</button>}{job?.status === "completed" && <button className={s.button} type="button" disabled={disabled} onClick={() => void act(async () => accept(await onAdopt(job)))}>{L("采用结果", "Use result")}</button>}{adopted?.value && <a className={s.button} href={mediaDownloadHref(adopted.value, "audio.wav")}><Download size={14}/>{L("下载已采用音频", "Download selected audio")}</a>}</div>
      </main><footer className={s.footer}><span className={s.error} role="status">{error || job?.error || preview.error}</span><span className={s.spacer}/><button type="button" className={s.button} disabled={disabled || JSON.stringify(draft) === saved.current} onClick={() => void act(async () => {await persist();})}><Save size={14}/>{L("保存", "Save")}</button><button type="button" className={`${s.button} ${s.primary}`} disabled={disabled || !source?.available || !preview.duration || processing || !hasUnappliedAudioEdit(draft)} onClick={() => void act(async () => {await persist(); const result = await onRender(revision.current); accept(result.node);})}>{busy ? <Loader2 size={14} className={s.spin}/> : <Scissors size={14}/>} {L("应用剪辑", "Apply edit")}{quote !== null ? ` · ${quote} ${L("积分", "credits")}` : ""}</button></footer>
    </section>
  </div>;
}
