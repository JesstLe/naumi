"use client";
import { CachedImage } from "@/components/cached-image";
import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { ImagePlus } from "lucide-react";

export const WorkflowDecorationNode = memo(function WorkflowDecorationNode({ data, selected }: NodeProps) {
  return <div className={`h-full w-full ${selected ? "outline outline-2 outline-indigo-400" : ""}`} data-testid="workflow-decoration" style={{ opacity: Number(data.opacity ?? 1) }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <CachedImage alt="" draggable={false} src={String(data.image)} className="h-full w-full" style={{ transform: `rotate(${Number(data.rotation || 0)}deg) scaleX(${data.flipX ? -1 : 1})` }} />
    {Boolean(data.missingAsset) && <button type="button" data-testid="workflow-missing-asset" className="nodrag nopan absolute inset-0 flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500"
      disabled={Boolean(data.readOnly)} onClick={event=>{event.stopPropagation();(data.onFill as (()=>void)|undefined)?.();}}><ImagePlus className="h-4 w-4" />待补图片</button>}
  </div>;
});

export const WorkflowGroupNode = memo(function WorkflowGroupNode({ data }: NodeProps) {
  return <div data-testid="workflow-group" className="pointer-events-none h-full w-full rounded-lg border border-dashed border-slate-300/80">
    <button type="button" className="nodrag nopan pointer-events-auto absolute -top-7 left-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
      onClick={event => { event.stopPropagation(); (data.onSelect as (() => void) | undefined)?.(); }} title="选择分组">{String(data.title)}</button>
  </div>;
});
