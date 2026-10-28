"use client";
import {useEffect,useRef,useState} from "react";
import {Handle,NodeResizer,Position,type NodeProps} from "@xyflow/react";
import {MapPin,Lock,Combine,ImagePlus,Loader2,Scissors} from "lucide-react";
import {cn,formatDate} from "@/lib/utils";
import {useFeatureAccess} from "@/lib/feature-access/client";
import {IMAGE_NODE_MIN_W,IMAGE_NODE_MIN_H,IMAGE_NODE_MAX_W,IMAGE_NODE_MAX_H} from "@/lib/canvas/node-geometry";
import type {CanvasArtNodeData} from "@/lib/canvas/scene-types";
import {CanvasImage} from "../canvas-image";
import {GenerationPlaceholder} from "../generation-placeholder";
import {VideoPlayer,mediaDownloadHref,type VideoPlayerAction} from "../video/player";
function VideoNodeSurface({url,selected,kind,onExtract}:{url:string;selected:boolean;kind:"video"|"audio";onExtract?:(action:VideoPlayerAction)=>void}) {
  return <VideoPlayer url={url} selected={selected} kind={kind} compact onProcess={onExtract}/>;
}

export function ArtNode({ data, selected, id: nodeId }: NodeProps) {
  const d = data as CanvasArtNodeData;
  const { can: canNodeFeature } = useFeatureAccess();
  const imageWidth = d.width && d.width > 0 ? Math.round(d.width) : undefined;
  const imageHeight = d.height && d.height > 0 ? Math.round(d.height) : undefined;
  // 节点边界=图片区域(标题绝对定位悬在图上方,不占边界),端口对齐图片竖直中点
  const portY = (imageHeight ?? 110) / 2;
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [forceOriginal, setForceOriginal] = useState(false);
  const preview = !forceOriginal && !!d.intrinsicWidth && !!d.intrinsicHeight;
  const previousImage = useRef(d.image);
  useEffect(() => {
    if (previousImage.current === d.image) return;
    previousImage.current = d.image;
    setForceOriginal(false); setNaturalSize(null); aspectFixedRef.current = false;
  }, [d.image]);
  const title = d.pending
    ? d.label
    : `${d.version ? `v${d.version}` : ""}${d.date ? ` · ${formatDate(d.date)}` : ""}${d.prompt ? `\n${d.prompt}` : ""}`;
  // 缺尺寸/预览宽高比与元数据不符时回源解码；缩略图像素绝不回写为原图尺寸。
  // 这里只静默修复显示高度，不写坐标、不污染用户撤销栈。
  const aspectFixedRef = useRef(false);
  useEffect(() => {
    if (aspectFixedRef.current || nodeId.startsWith("art-import-") || d.pending || d.videoUrl || !naturalSize) return;
    const iw = naturalSize.width;
    const ih = naturalSize.height;
    const cw = d.width;
    const ch = d.height;
    if (!iw || !ih || !cw || !ch) return;
    const imgRatio = iw / ih;
    const nodeRatio = cw / ch;
    if (Math.abs(nodeRatio - imgRatio) / imgRatio < 0.05) return;
    aspectFixedRef.current = true;
    d.onCanvasRatioRepair?.(
      nodeId,
      Math.round(cw),
      Math.max(IMAGE_NODE_MIN_H, Math.min(IMAGE_NODE_MAX_H, Math.round(cw / imgRatio)))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, naturalSize, d.width, d.height, d.pending, d.videoUrl]);
  return (
    <div
      className={cn("group relative flex h-full w-full flex-col", d.lightCanvas ? "canvas-ui-light" : "canvas-ui-dark")}
      data-image-width={imageWidth}
      data-image-height={imageHeight}
      data-intrinsic-width={d.intrinsicWidth || undefined}
      data-intrinsic-height={d.intrinsicHeight || undefined}
      data-canvas-group-id={d.canvasGroupId || undefined}
    >
      <NodeResizer
        isVisible={selected && !d.pending && !d.readOnly && !d.settings?.locked}
        keepAspectRatio
        minWidth={IMAGE_NODE_MIN_W}
        minHeight={IMAGE_NODE_MIN_H}
        maxWidth={IMAGE_NODE_MAX_W}
        maxHeight={IMAGE_NODE_MAX_H}
        color="#315fc8"
        handleClassName="!h-3 !w-3 !border-2 !border-white !bg-[#315fc8]"
        lineClassName="!border-[#315fc8]"
        onResizeEnd={(_, bounds) =>
          d.onCanvasResize?.(d.id, {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: Math.max(IMAGE_NODE_MIN_H, bounds.height),
          })
        }
      />

      {/* 标题悬在图片上方(节点边界外):选中框/缩放框只框图片,不框标题。未选中时仅显示文件名,点击后显示标记/分组/版本。 */}
      <div className="art-title absolute -top-[38px] left-0 right-0 z-10 flex h-[30px] items-center gap-1.5 truncate pl-0.5 text-[clamp(14px,0.85vw,18px)] font-semibold leading-none text-[#e2e6ed]">
        <span
          className="nodrag min-w-0 flex-1 cursor-text truncate"
          title={`${d.label} · 双击编辑`}
          onDoubleClick={(event) => {
            event.stopPropagation();
            d.onRenameRequest?.(d.id, d.label);
          }}
        >
          {d.label}
        </span>
        {selected && d.marked && (
          <MapPin className="h-3 w-3 flex-none fill-amber-400 text-amber-400" />
        )}
        {d.settings?.locked && <Lock className="h-3.5 w-3.5 shrink-0" aria-label="节点已锁定" />}
        {selected && d.canvasGroupId && (
          <Combine className="h-3 w-3 flex-none text-[#6bd7ec]" aria-label="已成组" />
        )}
        {selected && d.version && (
          <span className="art-version ml-auto flex-none rounded bg-white/10 px-1 text-[10px] font-semibold text-slate-200">
            v{d.version}
          </span>
        )}
      </div>

      {/* 图片卡使用单层边框；选中态为稿定式蓝色描边与外环。 */}
      <div
        title={title}
        className={cn(
          "canvas-ui-node-card relative min-h-0 flex-1 overflow-hidden rounded-[10px] border transition-all",
          selected
            ? "canvas-ui-selected ring-2 ring-[#315fc8] ring-offset-2 ring-offset-transparent"
            : d.inChain
              ? "border-[#6366f1]/50"
              : "border-transparent"
        )}
      >
        {d.pending ? (
          <GenerationPlaceholder stage={d.generationStage} startedAt={d.generationStartedAt} count={d.generationCount} completed={d.generationCompleted} failure={d.generationFailure} onRetry={d.onGenerationRetry} />
        ) : d.videoUrl && d.category==="media" ? (
          <div className="flex h-full items-center justify-center p-3"><a className="nodrag nowheel nokey rounded-lg bg-current/5 px-3 py-2 text-xs" href={mediaDownloadHref(d.videoUrl,d.label)} download>下载 {d.label}</a></div>
        ) : d.videoUrl ? (
          <VideoNodeSurface url={d.videoUrl} selected={selected} kind={d.category === "audio" ? "audio" : "video"} onExtract={action => d.onVideoExtract?.(d.id, action)} />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <CanvasImage
              key={d.image as string}
              source={d.image as string}
              forceOriginal={forceOriginal || !!d.inspectOriginal}
              hasDimensions={!!d.intrinsicWidth && !!d.intrinsicHeight}
              decoding="async"
              onError={event => { if(event.currentTarget.dataset.mediaVariant!=='original')setForceOriginal(true); }}
              alt={d.label}
              draggable={false}
              width={imageWidth}
              height={imageHeight}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (!(image.naturalWidth > 0) || !(image.naturalHeight > 0)) return;
                const optimized = preview && image.dataset.mediaVariant !== 'original';
                if (optimized && Math.abs(image.naturalWidth / image.naturalHeight - d.intrinsicWidth! / d.intrinsicHeight!) > 0.02) {
                  setForceOriginal(true); return;
                }
                const width = optimized ? d.intrinsicWidth! : image.naturalWidth;
                const height = optimized ? d.intrinsicHeight! : image.naturalHeight;
                setNaturalSize((current) =>
                  current?.width === width && current.height === height
                    ? current
                    : { width, height }
                );
                if (
                  d.intrinsicWidth !== width || d.intrinsicHeight !== height
                ) d.onDimensions?.(d.id, width, height);
              }}
              className="block h-full w-full object-contain"
              style={d.workflowPresentation ? { transform: `rotate(${d.workflowPresentation.rotation}deg) scaleX(${d.workflowPresentation.flipX ? -1 : 1})`, opacity: d.workflowPresentation.opacity } : undefined}
            />
            {d.missingAsset && <div data-testid="workflow-missing-asset" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50/80 text-slate-500">
              <ImagePlus className="h-8 w-8 text-slate-400" />
              <span className="text-sm font-medium">待补图片</span>
              {!d.readOnly && <button type="button" className="nodrag nopan rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                disabled={d.settings?.locked} onClick={event=>{event.stopPropagation();d.onFill?.(d.id);}}>补充图片</button>}
            </div>}
            {d.regenerationFailure&&<div role="alert" className="absolute bottom-2 left-2 z-10 rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600">重新生成未完成</div>}
            {d.regenerating&&<div role="status" className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-white/65 text-sm font-medium text-slate-700"><Loader2 size={18} className="animate-spin"/>重新生成中…</div>}
            {selected && canNodeFeature("cutout") && !d.readOnly && !d.missingAsset && d.onCutout && <button type="button" data-testid="canvas-image-quick-cutout"
              aria-label="去背景，保留主体" title="去背景，保留主体" disabled={d.cutoutBusy || d.cutoutBlocked || d.settings?.locked}
              className="nodrag nopan absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();d.onCutout?.(d.id);}}>
              {d.cutoutBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Scissors className="h-3.5 w-3.5"/>}去背景</button>}
            {selected && d.rootLabel && (
              <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {d.rootLabel}
              </span>
            )}
            {selected && d.processingKind && <span className="absolute bottom-1.5 left-1.5 bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{d.processingKind === "resize" ? "普通缩放" : d.processingKind === "native" ? "原生像素已校验" : d.processingKind === "ai-upscale" ? "AI 超分" : "底图"} · {naturalSize?.width || d.intrinsicWidth}×{naturalSize?.height || d.intrinsicHeight}</span>}
          </>
        )}
      </div>

      {/* 端口(原型 .port:22px 圆,top:78,hover 变 teal);左右都是 + 圆点 */}
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        title="连接参考图输入" aria-label="连接参考图输入"
        isConnectable={!d.readOnly && !d.settings?.locked}
        style={{ top: portY }}
        className={cn(
          "canvas-ui-port art-port !flex !h-12 !w-12 !-left-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-all",
          selected
            ? "!opacity-100"
            : "!opacity-0 group-hover:!opacity-100"
        )}
      >
        <span className="pointer-events-none leading-none">+</span>
      </Handle>
      {!d.pending && (
        <Handle
          id="out"
          type="source"
          position={Position.Right}
          title="拖动连接到其他图片" aria-label="拖动连接到其他图片"
          isConnectable={!d.readOnly && !d.settings?.locked}
          style={{ top: portY }}
          className={cn(
            "canvas-ui-port art-port !flex !h-12 !w-12 !-right-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-all",
            selected
              ? "!opacity-100"
              : "!pointer-events-none !opacity-0 group-hover:!pointer-events-auto group-hover:!opacity-100"
          )}
        >
          <span className="pointer-events-none leading-none">+</span>
        </Handle>
      )}
    </div>
  );
}
