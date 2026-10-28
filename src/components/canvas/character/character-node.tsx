"use client";
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { LockKeyhole, Maximize2, UserRound } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import type { CanvasCharacterNode } from "@/lib/canvas/character-node-schema";

export const CharacterCanvasNode = memo(function CharacterCanvasNode({ data }: { data: Record<string, any> }) {
  const node = data.node as CanvasCharacterNode;
  return <div className={`canvas-ui-light canvas-ui-surface flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-sm ${data.selected ? "ring-2 ring-indigo-400" : ""}`} data-testid="character-canvas-node" data-revision={node.revision}>
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 text-xs font-medium"><UserRound size={15}/><span className="min-w-0 flex-1 truncate">{node.title}</span>{data.locked && <LockKeyhole size={13}/>}<button type="button" className="nodrag rounded p-1 hover:bg-slate-100" aria-label={data.english ? "Edit character" : "编辑角色"} onClick={event => { event.stopPropagation(); data.onEdit(node.id); }}><Maximize2 size={14}/></button></div>
    <button type="button" className="nodrag relative min-h-0 flex-1 overflow-hidden bg-[#f1f3f8]" aria-label={data.english ? "Edit character" : "编辑角色"} onDoubleClick={event => { event.stopPropagation(); data.onEdit(node.id); }}>
      {data.preview ? <CachedImage src={data.preview} alt="" className="h-full w-full object-contain"/> : <div className="flex h-full items-center justify-center"><UserRound size={52} strokeWidth={1} className="text-slate-400"/></div>}
    </button>
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t px-3 text-[11px] text-slate-500"><span className="truncate">{node.character.description || node.character.name}</span><span className="shrink-0">{node.character.appearances.length} {data.english ? "looks" : "外观"}</span></div>
    <Handle type="target" id="in" position={Position.Left} style={{ background: "#818cf8", width: 10, height: 10 }}/>
    <Handle type="source" id="out" position={Position.Right} style={{ background: "#818cf8", width: 10, height: 10 }}/>
  </div>;
});
