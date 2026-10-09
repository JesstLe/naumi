"use client";
import { useImageQuality } from "@/lib/image-quality-context";
import { ImageQualityControl } from "@/components/image-quality-control";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowUpRight,
  Brush,
  Hash,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 画布「标注编辑」弹窗(quick edit)。
//
// 左侧原图 + canvas 标注层(箭头/涂抹/编号),右侧每条标注配一条文字指令;
// 提交时把「原图 + 全部标注」合成一张 PNG,连同结构化指令列表交给父组件
// 发 /api/canvas/annotate(双图输入 edit,模型把标注当编辑指令)。
// 画布内尺寸 = 原图像素,与 inpaint 页同一套坐标换算;原图经 /api/download
// 同源代理取回,避免远程图污染 canvas 导致 toBlob 失败。
// ---------------------------------------------------------------------------

export type AnnotateTool = "arrow" | "brush" | "text";

type Point = { x: number; y: number };

type Stroke = { points: Point[]; width: number };

export type AnnotateItem = {
  id: string;
  type: AnnotateTool;
  note: string;
  arrow?: { x1: number; y1: number; x2: number; y2: number };
  strokes?: Stroke[];
  pin?: Point;
};

type Draft =
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "brush"; points: Point[]; width: number }
  | null;

const TYPE_LABEL: Record<AnnotateTool, string> = {
  arrow: "箭头",
  brush: "涂抹",
  text: "编号",
};

const NOTE_PLACEHOLDER: Record<AnnotateTool, string> = {
  arrow: "例如：把这个包换成米色",
  brush: "例如：修掉涂抹区域的杂物并补全地面",
  text: "例如：这里加一句促销文案",
};

const TOOL_HINT: Record<AnnotateTool, string> = {
  arrow: "在图上拖拽画箭头，指向要修改的位置",
  brush: "按住涂抹，罩住要修改的区域",
  text: "在图上点击，放置编号标注",
};

export function AnnotateEditorModal({
  artwork,
  onClose,
  onSubmitted,
}: {
  artwork: { id: string; image: string; title: string; resolution?: string | null };
  onClose: () => void;
  onSubmitted: (formData: FormData) => Promise<void>;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [natW, setNatW] = useState(0);
  const [natH, setNatH] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { imageCost } = useImageQuality();
  const [tool, setTool] = useState<AnnotateTool>("arrow");
  const [brushSlider, setBrushSlider] = useState(5);
  const [items, setItems] = useState<AnnotateItem[]>([]);
  const [draft, setDraft] = useState<Draft>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drawingRef = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const noteRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // 经同源代理取原图,防止跨域图污染 canvas 后 toBlob 抛错
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/download?u=${encodeURIComponent(artwork.image)}&n=annotate.png`
        );
        if (!response.ok) throw new Error("download failed");
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          if (!img.naturalWidth || !img.naturalHeight) {
            setLoadError("原图解析失败，请换一张图片");
            return;
          }
          setNatW(img.naturalWidth);
          setNatH(img.naturalHeight);
          setImgUrl(objectUrl);
          setLoadError(null);
        };
        img.onerror = () => {
          if (!cancelled) setLoadError("原图解析失败，请换一张图片");
        };
        img.src = objectUrl;
      } catch {
        if (!cancelled) setLoadError("原图加载失败，请检查网络后重试");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artwork.image]);

  const minSide = Math.min(natW || 1, natH || 1);
  const brushWidth = Math.max(4, Math.round((minSide * brushSlider) / 260));

  const drawAnnotations = useCallback(
    (ctx: CanvasRenderingContext2D, list: AnnotateItem[], current: Draft) => {
      if (!natW || !natH) return;
      const lw = Math.max(3, Math.round(minSide / 240));
      const badgeR = Math.max(9, Math.round(minSide / 68));
      const fontPx = Math.max(11, Math.round(badgeR * 1.05));
      const drawBadge = (x: number, y: number, index: number) => {
        ctx.beginPath();
        ctx.arc(x, y, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, lw / 2);
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(index + 1), x, y + 0.5);
      };
      const drawArrow = (
        x1: number, y1: number, x2: number, y2: number, index: number
      ) => {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = Math.max(lw * 3.6, badgeR * 1.7);
        const ex = x2 - Math.cos(angle) * head * 0.7;
        const ey = y2 - Math.sin(angle) * head * 0.7;
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = lw;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - Math.cos(angle - 0.42) * head, y2 - Math.sin(angle - 0.42) * head);
        ctx.lineTo(x2 - Math.cos(angle + 0.42) * head, y2 - Math.sin(angle + 0.42) * head);
        ctx.closePath();
        ctx.fillStyle = "#ef4444";
        ctx.fill();
        drawBadge(x1, y1, index);
      };
      list.forEach((item, index) => {
        if (item.type === "arrow" && item.arrow) {
          drawArrow(item.arrow.x1, item.arrow.y1, item.arrow.x2, item.arrow.y2, index);
        } else if (item.type === "brush" && item.strokes?.length) {
          ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          for (const stroke of item.strokes) {
            if (stroke.points.length < 2) continue;
            ctx.lineWidth = stroke.width;
            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
            ctx.stroke();
          }
          drawBadge(item.strokes[0].points[0].x, item.strokes[0].points[0].y, index);
        } else if (item.type === "text" && item.pin) {
          drawBadge(item.pin.x, item.pin.y, index);
        }
      });
      if (current?.kind === "arrow") {
        drawArrow(current.x1, current.y1, current.x2, current.y2, list.length);
      } else if (current?.kind === "brush" && current.points.length > 1) {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
        ctx.lineWidth = current.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(current.points[0].x, current.points[0].y);
        for (const point of current.points.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    },
    [natW, natH, minSide]
  );

  // 标注/草稿任何变化都整层重画(标注数量少,整画布重绘开销可忽略)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgUrl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAnnotations(ctx, items, draft);
  }, [imgUrl, items, draft, drawAnnotations]);

  const pos = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const focusNote = useCallback((id: string) => {
    requestAnimationFrame(() => noteRefs.current[id]?.focus());
  }, []);

  const addItem = useCallback((item: AnnotateItem) => {
    setItems((current) => [...current, item]);
    focusNote(item.id);
  }, [focusNote]);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!imgUrl || submitting) return;
    const point = pos(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "text") {
      addItem({
        id: `anno-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
        type: "text",
        note: "",
        pin: point,
      });
      return;
    }
    drawingRef.current = true;
    if (tool === "arrow") {
      setDraft({ kind: "arrow", x1: point.x, y1: point.y, x2: point.x, y2: point.y });
    } else {
      setDraft({ kind: "brush", points: [point], width: brushWidth });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = pos(event);
    setDraft((current) => {
      if (!current) return current;
      if (current.kind === "arrow") return { ...current, x2: point.x, y2: point.y };
      return { ...current, points: [...current.points, point] };
    });
  };

  const finishDraft = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const current = draft;
    setDraft(null);
    if (!current) return;
    const id = `anno-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    if (current.kind === "arrow") {
      const length = Math.hypot(current.x2 - current.x1, current.y2 - current.y1);
      if (length < Math.max(8, minSide * 0.02)) return;
      addItem({ id, type: "arrow", note: "", arrow: { ...current } });
    } else {
      if (current.points.length < 3) return;
      addItem({ id, type: "brush", note: "", strokes: [{ points: current.points, width: current.width }] });
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function submit() {
    const img = imgRef.current;
    if (!img || !natW || !natH || submitting) return;
    if (!items.length) {
      setError("请先在图上添加标注");
      return;
    }
    const emptyIds = items.filter((item) => !item.note.trim()).map((item) => item.id);
    if (emptyIds.length) {
      setError(`还有 ${emptyIds.length} 条标注未填写修改指令`);
      noteRefs.current[emptyIds[0]]?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const out = document.createElement("canvas");
      out.width = natW;
      out.height = natH;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("画布初始化失败");
      ctx.drawImage(img, 0, 0, natW, natH);
      drawAnnotations(ctx, items, null);
      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("导出标注图失败");
      const formData = new FormData();
      formData.append("artworkId", artwork.id);
      formData.append("image", new File([blob], "annotated.png", { type: "image/png" }));
      formData.append(
        "annotations",
        JSON.stringify(items.map((item) => ({ type: item.type, note: item.note.trim() })))
      );
      // 标注数据准备完成后立即关闭编辑器，把耗时生成交给画布占位节点继续。
      // 用户可以马上选择其他节点或发起下一项工作，不再被模态框锁住。
      onClose();
      void onSubmitted(formData).catch((submitError) => {
        console.error("[canvas-annotate] background submission failed", submitError);
      });
      return;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="canvas-ui-mask fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={() => !submitting && onClose()}
    >
      <div
        role="dialog" aria-modal="true" aria-label="标注编辑"
        className="canvas-ui-surface canvas-ui-surface-solid flex h-full max-h-[880px] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border md:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 左:原图 + 标注层 */}
        <div className="canvas-ui-section relative flex h-[35%] min-h-0 min-w-0 flex-none items-center justify-center p-3 md:h-auto md:flex-1 md:p-4">
          {loadError ? (
            <div className="max-w-xs text-center text-sm leading-relaxed text-red-500">
              {loadError}
            </div>
          ) : !imgUrl ? (
            <div className="flex items-center gap-2 text-sm text-[var(--canvas-ui-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> 正在加载原图…
            </div>
          ) : (
            <div className="relative inline-flex max-h-full max-w-full">
              <img
                ref={imgRef}
                src={imgUrl}
                alt={artwork.title}
                draggable={false}
                className="block max-h-[calc(35dvh-3rem)] md:max-h-[calc(100dvh-4rem)] max-w-full select-none object-contain"
              />
              <canvas
                ref={canvasRef}
                width={natW}
                height={natH}
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finishDraft}
                onPointerLeave={finishDraft}
                onPointerCancel={finishDraft}
              />
            </div>
          )}
        </div>

        {/* 右:工具 + 指令列表 */}
        <aside className="canvas-ui-border flex min-h-0 w-full flex-1 flex-col border-t md:w-[330px] md:flex-none md:border-l md:border-t-0">
          <div className="flex items-start justify-between border-b border-[var(--canvas-ui-border)] px-4 py-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[15px] font-bold text-[var(--canvas-ui-text)]">
                <ArrowUpRight className="h-4 w-4 text-red-500" /> 标注编辑
              </div>
              <p className="mt-1 truncate text-[12px] text-[var(--canvas-ui-muted)]">
                {artwork.title || "图片节点"}
              </p>
            </div>
            <button
              type="button"
              aria-label="关闭标注编辑"
              disabled={submitting}
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--canvas-ui-muted)] transition-colors hover:bg-[var(--canvas-ui-soft-hover)] hover:text-[var(--canvas-ui-text)] disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-[var(--canvas-ui-border)] px-4 py-3">
            <div className="flex items-center gap-1.5">
              {([
                { key: "arrow", icon: ArrowUpRight, label: "箭头" },
                { key: "brush", icon: Brush, label: "涂抹" },
                { key: "text", icon: Hash, label: "编号" },
              ] as const).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  type="button"
                  disabled={submitting}
                  onClick={() => setTool(key)}
                  className={
                    tool === key
                      ? "flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/15 px-2 py-2 text-[13px] font-semibold text-red-500"
                      : "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium text-[var(--canvas-ui-muted)] transition-colors hover:bg-[var(--canvas-ui-soft-hover)] hover:text-[var(--canvas-ui-text)]"
                  }
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
            {tool === "brush" && (
              <label className="mt-3 flex items-center gap-2.5 text-[12px] text-[var(--canvas-ui-muted)]">
                笔刷粗细
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={brushSlider}
                  disabled={submitting}
                  onChange={(event) => setBrushSlider(Number(event.target.value))}
                  className="h-1.5 flex-1 accent-red-500"
                />
                <span className="w-4 text-right font-semibold text-[var(--canvas-ui-text)]">{brushSlider}</span>
              </label>
            )}
            <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--canvas-ui-muted)]">
              {TOOL_HINT[tool]}，随后在右侧填写这条标注要怎么改。
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            {!items.length && (
              <div className="rounded-xl border border-dashed border-[var(--canvas-ui-border)] px-3 py-6 text-center text-[12px] leading-relaxed text-[var(--canvas-ui-muted)]">
                还没有标注。
                <br />
                画一条箭头开始：每条标注对应一条独立的修改指令。
              </div>
            )}
            {items.map((item, index) => (
              <div key={item.id} className="rounded-xl border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--canvas-ui-muted)]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                    {TYPE_LABEL[item.type]}
                  </span>
                  <button
                    type="button"
                    aria-label={`删除标注 ${index + 1}`}
                    disabled={submitting}
                    onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--canvas-ui-muted)] transition-colors hover:bg-[var(--canvas-ui-soft-hover)] hover:text-red-500 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea
                  ref={(element) => { noteRefs.current[item.id] = element; }}
                  value={item.note}
                  disabled={submitting}
                  rows={2}
                  placeholder={NOTE_PLACEHOLDER[item.type]}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry) =>
                        entry.id === item.id ? { ...entry, note: event.target.value } : entry
                      )
                    )
                  }
                  className="canvas-ui-input w-full resize-none rounded-lg border border-[var(--canvas-ui-border)] bg-background px-2.5 py-2 text-[13px] text-[var(--canvas-ui-text)] outline-none transition-colors placeholder:text-[var(--canvas-ui-muted)] focus:border-red-500/60 disabled:opacity-60"
                />
              </div>
            ))}
            {error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-500">
                {error}
              </div>
            )}
          </div>

          <div className="flex-none border-t border-[var(--canvas-ui-border)] px-4 py-3">
            <div className="mb-2"><ImageQualityControl compact resolution={artwork.resolution || "1K"} disabled={submitting} /></div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submitting || !items.length}
                onClick={() => {
                  setItems([]);
                  setError(null);
                }}
                className="rounded-lg bg-[var(--canvas-ui-soft)] px-3 py-2 text-[13px] font-medium text-[var(--canvas-ui-text)] transition-colors hover:bg-[var(--canvas-ui-soft-hover)] disabled:opacity-40"
              >
                清空
              </button>
              <button
                type="button"
                disabled={submitting || !items.length || !imgUrl}
                onClick={() => void submit()}
                className="canvas-ui-primary flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-red-600 disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> 正在生成…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> 生成修改结果 · {imageCost(artwork.resolution || "1K")} 积分
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
