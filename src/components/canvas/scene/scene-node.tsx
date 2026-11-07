"use client";
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { LockKeyhole, Maximize2, Mountain } from "lucide-react";
import { CanvasCardImage } from "@/components/canvas/canvas-image";
import type { CanvasSceneNode } from "@/lib/canvas/scene-node-schema";

export const SceneCanvasNode = memo(function SceneCanvasNode({ data }: { data: Record<string, any> }) {
  const node = data.node as CanvasSceneNode;
  return <div className={`canvas-ui-light canvas-ui-surface flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-sm ${data.selected ? "ring-2 ring-indigo-400" : ""}`} data-testid="scene-canvas-node" data-revision={node.revision}>
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 text-xs font-medium"><Mountain size={15}/><span className="min-w-0 flex-1 truncate">{node.title}</span>{data.locked && <LockKeyhole size={13}/>}<button type="button" className="nodrag rounded p-1 hover:bg-slate-100" aria-label={data.english ? "Edit scene" : "编辑场景"} onClick={event => { event.stopPropagation(); data.onEdit(node.id); }}><Maximize2 size={14}/></button></div>
    <button type="button" className="nodrag relative min-h-0 flex-1 overflow-hidden bg-[#f1f3f8]" aria-label={data.english ? "Edit scene" : "编辑场景"} onDoubleClick={event => { event.stopPropagation(); data.onEdit(node.id); }}>
      {data.preview ? <CanvasCardImage source={data.preview} className="h-full w-full object-contain"/> : <div className="flex h-full items-center justify-center"><Mountain size={52} strokeWidth={1} className="text-slate-400"/></div>}
    </button>
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t px-3 text-[11px] text-slate-500"><span className="truncate">{node.scene.description || node.scene.name}</span><span className="shrink-0">{node.scene.states.length} {data.english ? "states" : "状态"}</span></div>
    <Handle type="target" id="in" position={Position.Left} style={{ background: "#818cf8", width: 10, height: 10 }}/>
    <Handle type="source" id="out" position={Position.Right} style={{ background: "#818cf8", width: 10, height: 10 }}/>
  </div>;
});
