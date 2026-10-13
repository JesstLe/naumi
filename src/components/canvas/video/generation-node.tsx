"use client";
import {Handle,NodeResizer,Position,type NodeProps} from "@xyflow/react";
import {useEffect,useRef,useState} from "react";
import {Settings2,Video,Lock,Loader2} from "lucide-react";
import type {CanvasVideoNode} from "@/lib/canvas/video-node-schema";
import type {PublicVideoTaskView} from "@/lib/video/service";
import {videoButtonClass} from "./form-controls";
import {VideoPlayer,type VideoPlayerAction} from "./player";
export type VideoGenerationNodeData={node:CanvasVideoNode;lightCanvas:boolean;locked:boolean;readOnly:boolean;task?:PublicVideoTaskView;onEdit:(id:string)=>void;onHistory:(id:string)=>void;onGenerate:(id:string)=>void;onCancel:(id:string)=>void;onProcess:(id:string,action:VideoPlayerAction)=>void;onPrompt:(id:string,prompt:string)=>Promise<void>;onResize:(id:string,size:{x:number;y:number;width:number;height:number})=>void;resultUrl?:string};
const statusLabels:Record<string,string>={queued:"排队中",processing:"生成中",creating:"提交中",submitted:"已提交",running:"生成中",creation_unknown:"等待核查",needs_attention:"等待核查",completed:"已完成",failed:"失败",cancelled:"已停止"};
export function VideoGenerationNode({data,selected}:NodeProps){
  const d=data as unknown as VideoGenerationNodeData,{node,task}=d;
  const [prompt,setPrompt]=useState(node.config.prompt||""),[dirty,setDirty]=useState(false),[error,setError]=useState("");
  const editRevision=useRef(0);
  useEffect(()=>{if(!dirty)setPrompt(node.config.prompt||"");},[node.config.prompt,dirty]);
  const active=!!task&&!['completed','failed','cancelled','needs_attention'].includes(task.status);
  const blocked=d.readOnly||d.locked;
  async function save(){if(!dirty||blocked)return;const revision=editRevision.current;try{await d.onPrompt(node.id,prompt);if(revision===editRevision.current)setDirty(false);setError("");}catch(cause){setError(cause instanceof Error?cause.message:"保存失败");}}
  return <div data-testid="canvas-video-node" className={`h-full w-full overflow-hidden rounded-xl border shadow-lg ${d.lightCanvas?"bg-white text-slate-800":"bg-[#171d25] text-slate-100"} ${selected?"border-teal-500 ring-2 ring-teal-500/20":"border-current/15"}`}>
    <NodeResizer isVisible={!!selected&&!blocked} minWidth={280} minHeight={250} onResizeEnd={(_,size)=>d.onResize(node.id,size)}/>
    <Handle type="target" id="in" position={Position.Left}/><Handle type="source" id="out" position={Position.Right}/>
    <div className="flex h-9 items-center gap-2 border-b border-current/10 px-3"><Video size={14}/><span className="min-w-0 flex-1 truncate text-xs font-semibold">{node.title}</span>{d.locked&&<Lock size={12}/>}<button type="button" aria-label="视频节点设置" className={`${videoButtonClass} nodrag nowheel nokey`} onClick={()=>d.onEdit(node.id)}><Settings2 size={13}/></button></div>
    <div className="nodrag nowheel nokey flex h-[calc(100%-36px)] flex-col gap-2 p-3" onKeyDown={event=>event.stopPropagation()}>
      {d.resultUrl?<div className="min-h-0 flex-1"><VideoPlayer url={d.resultUrl} title={node.title} compact selected={!!selected} onProcess={action=>d.onProcess(node.id,action)} canProcess={!blocked}/></div>:<textarea aria-label="视频节点描述" value={prompt} readOnly={blocked} onChange={event=>{editRevision.current++;setPrompt(event.target.value);setDirty(true);}} onBlur={()=>void save()} className="min-h-0 w-full flex-1 resize-none rounded-lg bg-current/5 p-2 text-xs leading-relaxed outline-none"/>}
      <div className="flex items-center gap-2 text-[10px] opacity-70"><span className="truncate">{node.config.modelId||"未选择模型"}</span>{node.config.durationSeconds!==undefined&&<span>{node.config.durationSeconds===-1?"自动":`${node.config.durationSeconds}s`}</span>}<span>{node.inputs.length} 引用</span></div>
      {task&&<div className="flex items-center gap-2 text-xs" data-testid="video-node-task-status">{active&&<Loader2 size={12} className="animate-spin"/>}<span>{statusLabels[task.status]||task.status}</span>{task.progress>0&&task.progress<100&&active&&<span>{task.progress}%</span>}</div>}
      {(error||task?.error)&&<p role="alert" className="line-clamp-2 text-[11px] text-red-500">{error||task?.error}</p>}
      <div className="flex gap-2"><button type="button" className={videoButtonClass} disabled={blocked} onClick={()=>d.onEdit(node.id)}>参数与引用</button><button type="button" className={videoButtonClass} onClick={()=>d.onHistory(node.id)}>历史</button>{active?<button type="button" className={videoButtonClass} disabled={blocked||!!task?.cancellationRequestedAt} onClick={()=>d.onCancel(node.id)}>{task?.cancellationRequestedAt?"正在停止":"停止"}</button>:<button type="button" className="ml-auto rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" disabled={blocked||dirty} onClick={()=>d.onGenerate(node.id)}>生成视频</button>}</div>
    </div>
  </div>;
}
