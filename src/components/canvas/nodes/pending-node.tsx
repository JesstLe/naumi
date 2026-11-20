"use client";
import {createContext,useContext} from "react";
import {Handle,Position,type NodeProps} from "@xyflow/react";
import {Image as ImageIcon,AlertTriangle,Loader2,Upload} from "lucide-react";
import Link from "next/link";
import {cn} from "@/lib/utils";
import {PORT_Y} from "@/lib/canvas/node-geometry";
import type {CanvasPendingNodeData} from "@/lib/canvas/scene-types";
import {GenerationPlaceholder} from "../generation-placeholder";
type PendCtx = {
  onUpload: (id: string) => void;
  onRemove: (id: string) => void;
};
export const PendContext = createContext<PendCtx | null>(null);

export function PendNode({ data, selected }: NodeProps) {
  const ctx = useContext(PendContext);
  const d = data as CanvasPendingNodeData;
  const sel = selected || d.selected;
  return (
    <div style={d.generating || d.generationFailure ? { width: d.generationSize?.width ?? 384 } : undefined} className={cn("group relative w-[320px]", d.lightCanvas ? "canvas-ui-light" : "canvas-ui-dark")}>
      {/* 标签(图片上方,对齐原型 .lb2) */}
      <div className="canvas-ui-text mb-1.5 flex h-[30px] items-center gap-1.5 truncate pl-0.5 text-[clamp(14px,0.85vw,18px)] font-semibold">
        <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{d.label}</span>
      </div>
      {/* 占位卡(原型 .nb2 + .ph2:单层卡片,选中=teal) */}
      <div
        style={d.generating || d.generationFailure ? { height: d.generationSize?.height ?? 384 } : undefined}
        className={cn(
          "canvas-ui-node-card relative flex h-[200px] flex-col items-center justify-center rounded-[12px] border px-5 text-center transition-all",
          sel
            ? "canvas-ui-selected ring-2 ring-[#315fc8] ring-offset-2 ring-offset-transparent"
            : "border-dashed"
        )}
      >
        {d.generationFailure ? (
          <GenerationPlaceholder failure={d.generationFailure} onRetry={d.onGenerationRetry || (d.onGenerate ? ()=>d.onGenerate!(d.__id) : undefined)} />
        ) : d.needsAttention ? (
          <div className="flex w-full flex-col items-center gap-2.5">
            <AlertTriangle className="h-6 w-6 text-[#b7791f]" />
            <div className="canvas-ui-text text-[13px] font-semibold">
              {d.attentionTitle || "视频任务需核对"}
            </div>
            <div className="canvas-ui-muted max-w-[250px] text-[11px] leading-5">
              {d.attentionHint || "任务已停止自动处理，请前往视频任务页核对后继续。"}
            </div>
            <Link
              href={d.attentionHref || "/video"}
              className="nodrag nopan rounded-md border border-[#c78b2c] bg-[#fff8e8] px-3 py-1.5 text-[11px] font-semibold text-[#8a5a12] transition-colors hover:bg-[#fff1cf]"
            >
              {d.attentionAction || "前往视频任务"}
            </Link>
          </div>
        ) : d.generating ? (
          <GenerationPlaceholder stage={d.generationStage} startedAt={d.generationStartedAt} taskId={d.generationTaskId} count={d.generationCount} kind={d.generationKind} />
        ) : d.uploading ? (
          <div className="flex w-full flex-col items-center gap-2.5">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="canvas-ui-text text-[12px] font-medium">
              上传中（{Math.round(d.progress ?? 0)}%）
            </div>
            <div className="canvas-ui-control h-1.5 w-full overflow-hidden rounded-full border-0">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round(d.progress ?? 0)}%` }}
              />
            </div>
            {d.fileInfo && (
              <div className="canvas-ui-muted w-full truncate text-[10px]">
                {d.fileInfo}
              </div>
            )}
          </div>
        ) : (
          <>
            <ImageIcon className="canvas-ui-muted mb-2 h-6 w-6" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ctx?.onUpload(String((data as { __id?: string }).__id ?? ""));
              }}
              className="canvas-ui-control flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors hover:border-primary/60"
            >
              <Upload className="h-3.5 w-3.5" /> 上传图片
            </button>
          </>
        )}
      </div>
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        style={{ top: PORT_Y }}
        className="canvas-ui-port !flex !h-12 !w-12 !-left-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-colors"
      >
        <span className="pointer-events-none leading-none">+</span>
      </Handle>
      {/* 右侧分支端口:空节点也能向右拉线建分支(空→空连线由 pending-link 编译;
        空节点上传后血缘随 inputs 延续),与真图片节点的 out 端口同位同语义。 */}
      <Handle
        id="out"
        type="source"
        position={Position.Right}
        style={{ top: PORT_Y }}
        title="拖动创建分支节点" aria-label="拖动创建分支节点"
        className="canvas-ui-port !flex !h-12 !w-12 !-right-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-colors"
      >
        <span className="pointer-events-none leading-none">+</span>
      </Handle>
      {!d.uploading && !d.generating && !d.needsAttention && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            ctx?.onRemove(String((data as { __id?: string }).__id ?? ""));
          }}
          className="canvas-ui-control nodrag absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
          title="删除空白节点"
        >
          ✕
        </button>
      )}
    </div>
  );
}
