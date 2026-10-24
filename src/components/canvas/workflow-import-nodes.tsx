"use client";
import { CanvasImage } from "./canvas-image";
import { memo, useEffect, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { ImagePlus } from "lucide-react";

export const WorkflowDecorationNode = memo(function WorkflowDecorationNode({ data, selected }: NodeProps) {
  const [original,setOriginal]=useState(false);
  useEffect(()=>setOriginal(false),[data.image]);
  return <div className={`h-full w-full ${selected ? "outline outline-2 outline-indigo-400" : ""}`} data-testid="workflow-decoration" style={{ opacity: Number(data.opacity ?? 1) }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <CanvasImage source={String(data.image)} forceOriginal={!!selected||original} hasDimensions={Number(data.intrinsicWidth)>0&&Number(data.intrinsicHeight)>0} onError={event=>{if(event.currentTarget.dataset.mediaVariant!=='original')setOriginal(true);}} alt="" draggable={false} className="h-full w-full" style={{ transform: `rotate(${Number(data.rotation || 0)}deg) scaleX(${data.flipX ? -1 : 1})` }} />
    {Boolean(data.missingAsset) && <button type="button" data-testid="workflow-missing-asset" className="nodrag nopan absolute inset-0 flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500"
      disabled={Boolean(data.readOnly)} onClick={event=>{event.stopPropagation();(data.onFill as ((id:string)=>void)|undefined)?.(String(data.id));}}><ImagePlus className="h-4 w-4" />待补图片</button>}
  </div>;
});

export const WorkflowGroupNode = memo(function WorkflowGroupNode({ data }: NodeProps) {
  return <div data-testid="workflow-group" className="pointer-events-none h-full w-full rounded-lg border border-dashed border-slate-300/80">
    <button type="button" className="nodrag nopan pointer-events-auto absolute -top-7 left-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
      onClick={event => { event.stopPropagation(); (data.onSelect as ((ids:string[]) => void) | undefined)?.(data.members as string[]); }} title="选择分组">{String(data.title)}</button>
  </div>;
});
