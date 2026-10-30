"use client";
import {createContext,useContext,useRef} from "react";
import {Handle,NodeResizer,Position,type NodeProps} from "@xyflow/react";
import {Loader2,Minimize2,Maximize2,X} from "lucide-react";
import {cn} from "@/lib/utils";
import {defaultNodeSettings,nodeTextStyle} from "@/lib/canvas/node-settings";
import {TEXT_NODE_MIN_W,TEXT_NODE_MIN_H,TEXT_NODE_MAX_W,TEXT_NODE_MAX_H} from "@/lib/canvas/node-geometry";
import type {CanvasTextNodeData} from "@/lib/canvas/scene-types";
const DEFAULT_CANVAS_SETTINGS=defaultNodeSettings();
type TextNodeCtx = {
  onRemove: (id: string) => void;
  onCopy: (text: string) => void;
  onContentChange: (id: string, content: string) => void;
  onContentCommit: (id: string, content: string, initialContent?: string) => void;
  onResize: (id: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  onToggleExpand: (id: string) => void;
};
export const TextNodeContext = createContext<TextNodeCtx | null>(null);

export function TextCanvasNode({ data, selected }: NodeProps) {
  const ctx = useContext(TextNodeContext);
  const editInitialContent = useRef<string | undefined>(undefined);
  const d = data as CanvasTextNodeData;
  const active = selected || d.selected;
  const body = d.content || d.prompt;
  const editableBody = d.status === "completed" || Boolean(d.content);
  return (
    <div className="group relative flex h-full w-full flex-col" style={d.workflowPresentation ? { transform: `rotate(${d.workflowPresentation.rotation}deg) scaleX(${d.workflowPresentation.flipX ? -1 : 1})`, opacity: d.workflowPresentation.opacity } : undefined}>
      <NodeResizer
        isVisible={active && !d.expanded && !d.readOnly && !d.settings?.locked}
        minWidth={TEXT_NODE_MIN_W}
        minHeight={TEXT_NODE_MIN_H}
        maxWidth={TEXT_NODE_MAX_W}
        maxHeight={String(data.__id || "").startsWith("text-import-") ? 100000 : TEXT_NODE_MAX_H}
        color="#315fc8"
        handleClassName="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#315fc8]"
        lineClassName="!border-[#315fc8]"
        onResizeEnd={(_, bounds) =>
          ctx?.onResize(d.__id, {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          })
        }
      />
      {/* 标题行跟随画布明暗切换，避免浅色画布上的浅色标题失去对比度。 */}
      <div
        data-testid="text-node-title"
        className={cn(
          "mb-1.5 flex h-[30px] flex-none items-center gap-1.5 truncate pl-0.5 text-[clamp(14px,0.85vw,18px)] font-semibold leading-none",
          d.lightCanvas ? "text-[#303641]" : "text-[#e2e6ed]"
        )}
      >
        <span className="min-w-0 flex-1 truncate" title={d.title || "文字生成"}>
          {d.title || "文字生成"}
        </span>
        {d.status === "generating" && (
          <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-[#6bd7ec]" />
        )}
      </div>
      {/* 内容卡与图片节点统一；选中态使用稿定式清晰蓝框，不使用光晕。 */}
      <div
        data-testid="text-node-card"
        className={cn(
          "canvas-ui-node-card relative min-h-0 flex-1 overflow-auto rounded-[10px] border px-3 py-2.5 text-[12px] leading-[1.65] transition-all",
          d.lightCanvas ? "canvas-ui-light" : "canvas-ui-dark",
          active
            ? "canvas-ui-selected ring-2 ring-[#315fc8] ring-offset-2 ring-offset-transparent"
            : ""
        )}
      >
        {!!d.sourceRefs?.length && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {d.sourceRefs.map((reference) => (
              <span
                key={reference.id}
                className={cn(
                  "max-w-full truncate border px-1.5 py-0.5 text-[10px] font-semibold leading-4",
                  d.lightCanvas
                    ? "border-[#b9d0d8] bg-[#e8f2f5] text-[#315a68]"
                    : "border-[#24505f] bg-[#163842] text-[#8fe7f5]"
                )}
                title={`@${reference.title}`}
              >
                @{reference.title}
              </span>
            ))}
          </div>
        )}
        {d.status === "generating" ? (
          <div className="canvas-ui-muted flex h-[108px] items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#6366f1]" /> 正在生成文字…
          </div>
        ) : d.status === "failed" ? (
          <div role="alert" className="flex min-h-[108px] flex-col justify-center gap-2 text-amber-800">
            <span className="font-medium">文字生成失败</span>
            <p className="whitespace-pre-wrap break-words">{d.error || "本次未取得文字结果，请重试"}</p>
          </div>
        ) : editableBody ? (
          <textarea
            aria-label="编辑生成文本"
            readOnly={d.readOnly || d.settings?.locked}
            style={nodeTextStyle(d.settings || DEFAULT_CANVAS_SETTINGS)}
            value={d.content}
            onChange={(event) => ctx?.onContentChange(d.__id, event.target.value)}
            onFocus={() => { editInitialContent.current = d.content; }}
            onBlur={(event) => {
              ctx?.onContentCommit(d.__id, event.currentTarget.value, editInitialContent.current);
              editInitialContent.current = undefined;
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className={cn(!d.settings?.text.color && "canvas-ui-text", "nodrag nowheel h-full min-h-[96px] w-full resize-none overflow-auto border-0 bg-transparent p-0 text-[12px] leading-[1.65] outline-none")}
          />
        ) : body ? (
          <p style={nodeTextStyle(d.settings || DEFAULT_CANVAS_SETTINGS)} className="whitespace-pre-wrap break-words">{body}</p>
        ) : (
          <p className="canvas-ui-muted">输入需求后生成文字内容</p>
        )}
      </div>
      <div className={cn("canvas-ui-surface-solid absolute right-1.5 top-1.5 hidden items-center gap-1 rounded-md pl-1 group-hover:flex", d.lightCanvas ? "canvas-ui-light" : "canvas-ui-dark")}>
        <button
          type="button"
          className="canvas-ui-action nodrag flex h-6 w-6 items-center justify-center"
          title={d.expanded ? "还原大小" : "放大查看"}
          onClick={(event) => {
            event.stopPropagation();
            ctx?.onToggleExpand(d.__id);
          }}
        >
          {d.expanded ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
        {!!d.content && (
          <button
            type="button"
            className="canvas-ui-action nodrag flex h-6 w-6 items-center justify-center"
            title="复制文字"
            onClick={(event) => {
              event.stopPropagation();
              ctx?.onCopy(d.content);
            }}
          >
            <span className="text-[11px]">⧉</span>
          </button>
        )}
        <button
          type="button"
          className="nodrag flex h-6 w-6 items-center justify-center text-[#7d8694] hover:bg-[#ff6b63]/15 hover:text-[#ff6b63]"
          title="删除文字节点"
          disabled={d.readOnly || d.settings?.locked}
          onClick={(event) => {
            event.stopPropagation();
            ctx?.onRemove(d.__id);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className={cn(
          "canvas-ui-port art-port !flex !h-12 !w-12 !-left-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-all",
          active
            ? "!opacity-100"
            : "!pointer-events-none !opacity-0 group-hover:!pointer-events-auto group-hover:!opacity-100"
        )}
      >
        <span className="pointer-events-none leading-none">+</span>
      </Handle>
      <Handle
        id="out"
        type="source"
        position={Position.Right}
        className={cn(
          "canvas-ui-port art-port !flex !h-12 !w-12 !-right-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-all",
          active
            ? "!opacity-100"
            : "!pointer-events-none !opacity-0 group-hover:!pointer-events-auto group-hover:!opacity-100"
        )}
      >
        <span className="pointer-events-none leading-none">+</span>
      </Handle>
    </div>
  );
}
