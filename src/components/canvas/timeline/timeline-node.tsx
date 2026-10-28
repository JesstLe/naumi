"use client";
import {memo} from "react";
import {Handle,Position} from "@xyflow/react";
import {Film,LockKeyhole} from "lucide-react";
import type {CanvasTimelineNode} from "@/lib/canvas/timeline-node-schema";
import {VideoPlayer} from "../video/player";

export const TimelineCanvasNode=memo(function TimelineCanvasNode({data}:{data:Record<string,any>}){
  const node=data.node as CanvasTimelineNode,L=(zh:string,en:string)=>data.english?en:zh,clips=node.timeline.tracks.flatMap(track=>track.clips),duration=Math.max(0,...clips.map(clip=>clip.position+clip.duration)),changed=node.adopted&&JSON.stringify(node.adopted.project)!==JSON.stringify(node.timeline);
  return <div className={`canvas-ui-light canvas-ui-surface flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-sm ${data.selected?"ring-2 ring-indigo-400":""}`} data-testid="timeline-canvas-node" data-revision={node.revision}>
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 text-xs font-medium"><Film size={15}/><span className="min-w-0 flex-1 truncate">{node.title}</span>{data.locked&&<LockKeyhole size={13}/>}<button type="button" className="nodrag flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100" aria-label={L("编辑多轨","Edit multitrack")} onClick={event=>{event.stopPropagation();data.onEdit(node.id);}}><Film size={13}/>{L("编辑","Edit")}</button></div>
    <div className="nodrag min-h-0 flex-1 p-3" onDoubleClick={event=>{event.stopPropagation();data.onEdit(node.id);}}>{data.url?<VideoPlayer url={data.url} title={node.title} kind="video" compact selected={!!data.selected} canProcess={false} allowExpand={false}/>:<button type="button" className="flex h-full w-full items-center justify-center gap-2 rounded-lg bg-slate-50 text-xs text-slate-500" onClick={()=>data.onEdit(node.id)}><Film size={20}/>{L("添加素材","Add media")}</button>}</div>
    <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-t px-3 text-[11px] text-slate-500"><span>{node.timeline.tracks.length} {L("轨道","tracks")} · {duration.toFixed(1)}s</span><span>{changed?L("未应用","Unapplied"):data.url?L("已采用","Selected"):""}</span></div>
    <Handle type="target" id="in" position={Position.Left} style={{background:"#818cf8",width:10,height:10}}/><Handle type="source" id="out" position={Position.Right} style={{background:"#818cf8",width:10,height:10}}/>
  </div>;
});
