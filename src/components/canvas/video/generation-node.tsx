"use client";
import {useVideoI18n} from "./i18n";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { Settings2, Video, Lock, Loader2,Info } from "lucide-react";
import type { CanvasVideoNode } from "@/lib/canvas/video-node-schema";
import {type PublicVideoTaskView} from "@/lib/video/queries";
import { videoButtonClass } from "./form-controls";
import { VideoPlayer, type VideoPlayerAction } from "./player";
export type VideoGenerationNodeData = {
    node: CanvasVideoNode;
    lightCanvas: boolean;
    locked: boolean;
    readOnly: boolean;
    task?: PublicVideoTaskView;
    onEdit: (id: string) => void;
    onHistory: (id: string) => void;
    onGenerate: (id: string) => void;
    onCancel: (id: string) => void;
    onProcess: (id: string, action: VideoPlayerAction) => void;
    onPrompt: (id: string, prompt: string) => Promise<void>;
    onResize: (id: string, size: {
        x: number;
        y: number;
        width: number;
        height: number;
    }) => void;
    resultUrl?: string;
    externalDock?: boolean;
};
const statusLabels: Record<string, string> = { queued: "排队中", processing: "生成中", creating: "提交中", submitted: "已提交", running: "生成中", creation_unknown: "等待核查", needs_attention: "等待核查", completed: "已完成", failed: "失败", cancelled: "已停止" };
export function VideoGenerationNode({ data, selected }: NodeProps) {
    const V = useVideoI18n();
    const d = data as unknown as VideoGenerationNodeData, { node, task } = d;
    const [prompt, setPrompt] = useState(node.config.prompt || ""), [dirty, setDirty] = useState(false), [error, setError] = useState("");
    const editRevision = useRef(0);
    useEffect(() => { if (!dirty)
        setPrompt(node.config.prompt || ""); }, [node.config.prompt, dirty]);
    const active = !!task && !['completed', 'failed', 'cancelled', 'needs_attention'].includes(task.status);
    const blocked = d.readOnly || d.locked;
    async function save() { if (!dirty || blocked)
        return; const revision = editRevision.current; try {
        await d.onPrompt(node.id, prompt);
        if (revision === editRevision.current)
            setDirty(false);
        setError("");
    }
    catch (cause) {
        setError(cause instanceof Error ? cause.message : "保存失败");
    } }
    if(d.externalDock)return <div data-testid="canvas-video-node" className={`group relative flex h-full w-full flex-col ${d.lightCanvas?'canvas-ui-light':'canvas-ui-dark'}`}>
      <NodeResizer isVisible={!!selected&&!blocked} minWidth={280} minHeight={160} keepAspectRatio color="#315fc8" handleClassName="!h-3 !w-3 !border-2 !border-white !bg-[#315fc8]" lineClassName="!border-[#315fc8]" onResizeEnd={(_,size)=>d.onResize(node.id,size)}/>
      <div className="art-title absolute -top-[38px] left-0 right-0 z-10 flex h-[30px] items-center gap-1.5 truncate pl-0.5 text-[clamp(14px,0.85vw,18px)] font-semibold leading-none">
        <Video size={15} className="shrink-0"/><span className="min-w-0 flex-1 truncate" title={node.title}>{node.title}</span>{d.locked&&<Lock size={13}/>}
        {selected&&<span className={`h-2 w-2 shrink-0 rounded-full ${task?.status==='failed'?'bg-red-400':active?'animate-pulse bg-blue-500':'bg-[#315fc8]'}`} aria-label={V(task?statusLabels[task.status]||task.status:'视频节点')}/>}
        <button type="button" aria-label={V('视频节点设置')} title={V('视频节点设置')} className="canvas-ui-action nodrag nowheel nokey rounded p-1 opacity-0 focus:opacity-100 group-hover:opacity-100" onClick={()=>d.onEdit(node.id)}><Settings2 size={13}/></button>
      </div>
      <div className={`canvas-ui-node-card relative h-full w-full overflow-hidden rounded-[10px] border transition-all ${selected?'canvas-ui-selected ring-2 ring-[#315fc8] ring-offset-2 ring-offset-transparent':''}`}>
        {d.resultUrl?<VideoPlayer url={d.resultUrl} title={node.title} compact selected={!!selected} onProcess={action=>d.onProcess(node.id,action)} canProcess={!blocked}/>:<div data-testid="video-node-preview" className="flex h-full flex-col items-center justify-center gap-2 bg-[var(--canvas-ui-soft)] px-6 text-center canvas-ui-muted">
          {active?<Loader2 size={23} className="animate-spin opacity-60"/>:task?.status==='failed'||task?.status==='needs_attention'?<Info size={21} className="opacity-60"/>:<Video size={28} strokeWidth={1.3} className="opacity-35"/>}
          <span role="status" className="text-xs">{V(task?statusLabels[task.status]||task.status:'视频预览')}{active&&task&&task.progress>0?` · ${task.progress}%`:''}</span>
          {task?.error&&<p className="line-clamp-2 max-w-[90%] text-[11px] leading-5 opacity-70">{task.error}</p>}
          {task?.status==='failed'&&!blocked&&<button type="button" className="canvas-ui-action nodrag rounded-lg px-2 py-1 text-xs font-semibold" onClick={()=>d.onEdit(node.id)}>{V('编辑后重试')}</button>}
        </div>}
      </div>
      <Handle type="target" id="in" position={Position.Left} className="canvas-ui-port !h-6 !w-6 !border-2"><span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm canvas-ui-muted">+</span></Handle>
      <Handle type="source" id="out" position={Position.Right} className="canvas-ui-port !h-6 !w-6 !border-2"><span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm canvas-ui-muted">+</span></Handle>
    </div>;
    return <div data-testid="canvas-video-node" className={`h-full w-full overflow-hidden rounded-xl border shadow-lg ${d.lightCanvas ? "bg-white text-slate-800" : "bg-[#171d25] text-slate-100"} ${selected ? "border-teal-500 ring-2 ring-teal-500/20" : "border-current/15"}`}>
    <NodeResizer isVisible={!!selected && !blocked} minWidth={280} minHeight={250} onResizeEnd={(_, size) => d.onResize(node.id, size)}/>
    <Handle type="target" id="in" position={Position.Left}/><Handle type="source" id="out" position={Position.Right}/>
    <div className="flex h-9 items-center gap-2 border-b border-current/10 px-3"><Video size={14}/><span className="min-w-0 flex-1 truncate text-xs font-semibold">{node.title}</span>{d.locked && <Lock size={12}/>}<button type="button" aria-label={V("视频节点设置")} className={`${videoButtonClass} nodrag nowheel nokey`} onClick={() => d.onEdit(node.id)}><Settings2 size={13}/></button></div>
    <div className="nodrag nowheel nokey flex h-[calc(100%-36px)] flex-col gap-2 p-3" onKeyDown={event => event.stopPropagation()}>
      {d.resultUrl ? <div className="min-h-0 flex-1"><VideoPlayer url={d.resultUrl} title={node.title} compact selected={!!selected} onProcess={action => d.onProcess(node.id, action)} canProcess={!blocked}/></div> : d.externalDock ? <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-current/5 p-2 text-xs leading-relaxed">{node.config.prompt||V("视频描述")}</div> : <textarea aria-label={V("视频节点描述")} value={prompt} readOnly={blocked} onChange={event => { editRevision.current++; setPrompt(event.target.value); setDirty(true); }} onBlur={() => void save()} className="min-h-0 w-full flex-1 resize-none rounded-lg bg-current/5 p-2 text-xs leading-relaxed outline-none"/>}
      <div className="flex items-center gap-2 text-[10px] opacity-70"><span className="truncate">{node.config.modelId || V("未选择模型")}</span>{node.config.durationSeconds !== undefined && <span>{node.config.durationSeconds === -1 ? V("自动") : `${node.config.durationSeconds}s`}</span>}<span>{node.inputs.length}{V(" \u5F15\u7528")}</span></div>
      {task && <div className="flex items-center gap-2 text-xs" data-testid="video-node-task-status">{active && <Loader2 size={12} className="animate-spin"/>}<span>{V(statusLabels[task.status] || task.status)}</span>{task.progress > 0 && task.progress < 100 && active && <span>{task.progress}%</span>}</div>}
      {(error || task?.error) && <p role="alert" className="line-clamp-2 text-[11px] text-red-500">{error || task?.error}</p>}
      {!d.externalDock && <div className="flex gap-2"><button type="button" className={videoButtonClass} disabled={blocked} onClick={() => d.onEdit(node.id)}>{V("\u53C2\u6570\u4E0E\u5F15\u7528")}</button><button type="button" className={videoButtonClass} onClick={() => d.onHistory(node.id)}>{V("\u5386\u53F2")}</button>{active ? <button type="button" className={videoButtonClass} disabled={blocked || !!task?.cancellationRequestedAt} onClick={() => d.onCancel(node.id)}>{task?.cancellationRequestedAt ? V("正在停止") : V("停止")}</button> : <button type="button" className="ml-auto rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" disabled={blocked || dirty} onClick={() => d.onGenerate(node.id)}>{V("\u751F\u6210\u89C6\u9891")}</button>}</div>}
    </div>
  </div>;
}
