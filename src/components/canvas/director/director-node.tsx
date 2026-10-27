"use client";
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Clapperboard, LockKeyhole, Maximize2 } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import type { CanvasDirectorNode } from "@/lib/canvas/director-node-schema";

export const DirectorCanvasNode = memo(function DirectorCanvasNode({ data }: { data: Record<string, any> }) {
  const node = data.node as CanvasDirectorNode;
  return <div className={`canvas-ui-light canvas-ui-surface relative flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-sm ${data.selected ? "ring-2 ring-indigo-400" : ""}`} data-testid="director-canvas-node" data-revision={node.revision}>
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 text-xs font-medium"><Clapperboard size={15}/><span className="min-w-0 flex-1 truncate">{node.title}</span>{data.locked && <LockKeyhole size={13}/>}<button type="button" className="nodrag rounded p-1 hover:bg-slate-100" aria-label={data.english ? "Open 3D director" : "打开3D导演台"} onClick={event => { event.stopPropagation(); data.onEdit(node.id); }}><Maximize2 size={14}/></button></div>
    <button type="button" className="nodrag relative min-h-0 flex-1 overflow-hidden bg-[#edf0f5]" aria-label={data.english ? "Open 3D director" : "打开3D导演台"} onDoubleClick={event => { event.stopPropagation(); data.onEdit(node.id); }}>
      {data.preview ? <CachedImage src={data.preview} alt="" className="h-full w-full object-contain"/> : <div className="flex h-full items-center justify-center"><Clapperboard size={48} strokeWidth={1} className="text-slate-400"/></div>}
    </button>
    <div className="flex h-8 shrink-0 items-center justify-between border-t px-3 text-[11px] text-slate-500"><span>{node.project.entities.filter(entity => entity.kind === "character").length} {data.english ? "characters" : "角色"} · {node.project.cameras.length} {data.english ? "cameras" : "机位"}</span><span>{node.project.duration}s</span></div>
    <Handle type="target" id="in" position={Position.Left} style={{ background: "#818cf8", width: 10, height: 10 }}/>
    <Handle type="source" id="out" position={Position.Right} isConnectable={node.outputs.length>0} style={{ background: "#818cf8", width: 10, height: 10 }}/>
  </div>;
});
