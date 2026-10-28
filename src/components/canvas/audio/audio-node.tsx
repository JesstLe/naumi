"use client";
import {memo} from "react";
import {Handle, Position} from "@xyflow/react";
import {LockKeyhole, Music2, Scissors} from "lucide-react";
import type {CanvasAudioNode} from "@/lib/canvas/audio-node-schema";
import {VideoPlayer} from "../video/player";
import {hasUnappliedAudioEdit} from "@/lib/audio/project";

export const AudioCanvasNode = memo(function AudioCanvasNode({data}: {data: Record<string, any>}) {
  const node = data.node as CanvasAudioNode, L = (zh: string, en: string) => data.english ? en : zh;
  return <div className={`canvas-ui-light canvas-ui-surface flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-sm ${data.selected ? "ring-2 ring-indigo-400" : ""}`} data-testid="audio-canvas-node" data-revision={node.revision}>
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 text-xs font-medium"><Music2 size={15}/><span className="min-w-0 flex-1 truncate">{node.title}</span>{data.locked && <LockKeyhole size={13}/>}<button type="button" className="nodrag flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100" aria-label={L("编辑音频", "Edit audio")} onClick={event => {event.stopPropagation(); data.onEdit(node.id);}}><Scissors size={13}/>{L("编辑", "Edit")}</button></div>
    <div className="nodrag min-h-0 flex-1 p-3" onDoubleClick={event => {event.stopPropagation(); data.onEdit(node.id);}}>{data.url ? <VideoPlayer url={data.url} title={node.title} kind="audio" compact selected={!!data.selected} canProcess={false} allowExpand={false}/> : <button type="button" className="flex h-full w-full items-center justify-center gap-2 rounded-lg bg-slate-50 text-xs text-slate-500" onClick={() => data.onEdit(node.id)}><Music2 size={20}/>{L("导入音频", "Import audio")}</button>}</div>
    <div className="flex h-8 shrink-0 items-center gap-2 border-t px-3 text-[11px] text-slate-500">{hasUnappliedAudioEdit(node.audio) ? L("未应用", "Unapplied") : data.url ? L("已采用", "Selected") : ""}</div>
    <Handle type="target" id="in" position={Position.Left} style={{background: "#818cf8", width: 10, height: 10}}/><Handle type="source" id="out" position={Position.Right} style={{background: "#818cf8", width: 10, height: 10}}/>
  </div>;
});
