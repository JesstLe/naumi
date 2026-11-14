"use client";
import {Type,X,Loader2,Wand2} from "lucide-react";
import NextImage from "@/components/cached-next-image";
import {TextModelSelect} from "@/components/ui/text-model-select";
import {FeatureModelSelect} from "@/components/tools/feature-model-select";
import {ImageQualityControl} from "@/components/image-quality-control";
import {cdnUrl} from "@/lib/cdn";
import {cn} from "@/lib/utils";
import type {Artwork} from "@/lib/mock-data";
import type {CanvasImageTextState,CanvasOcrSegment} from "@/lib/canvas/image-text-editor";
export type CanvasImageTextPanelProps={state:CanvasImageTextState;artwork?:Artwork;lightCanvas:boolean;onClose:()=>void;onFocus:(id:string)=>void;onEdit:(id:string,text:string)=>void;onApply:(segment:CanvasOcrSegment)=>Promise<unknown>;onApplyAll:()=>Promise<unknown>};
/** Original online-text UI; no task/HTTP/billing state is owned by this view. */
export function CanvasImageTextPanel({state,artwork,lightCanvas,onClose,onFocus,onEdit,onApply,onApplyAll}:CanvasImageTextPanelProps){
 const {artworkId:ocrArtworkId,segments:ocrSegments,status:ocrStatus,engine:ocrEngine,error:ocrError,applyingId:ocrApplyingId,progress:ocrProgress,imageSize:ocrImageSize,focusedId:ocrFocusedId,batch:ocrBatch}=state;
 const batchPending=ocrSegments.filter(segment=>segment.editedText.trim()&&segment.editedText.trim()!==segment.text).length;
 const batchLocked=ocrStatus==="applying"||!!ocrBatch;
 if(!ocrArtworkId)return null;
 return (
            <aside
              aria-label="在线改字面板"
              className="canvas-ui-surface canvas-ui-surface-solid canvas-ui-side-panel absolute bottom-4 right-4 top-4 z-30 flex w-[min(390px,calc(100%-2rem))] flex-col overflow-hidden border"
            >
              <div className="flex items-start justify-between border-b border-[var(--canvas-ui-border)] px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[15px] font-bold">
                    <Type className="h-4 w-4 text-[#248da1]" /> 在线改字
                  </div>
                  <p className="mt-1 truncate text-[12px] canvas-ui-muted">
                    {artwork?.title || "图片节点"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="关闭在线改字"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg canvas-ui-action"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {(ocrStatus === "scanning" || ocrStatus === "applying" || !!ocrBatch) && (
                <div className="border-b border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-4 py-3">
                  <div className="flex items-center justify-between text-[12px] font-semibold canvas-ui-muted">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#248da1]" />
                      {ocrBatch
                        ? `正在批量提交改字任务（${ocrBatch.done}/${ocrBatch.total}）`
                        : ocrStatus === "scanning" ? "正在扫描整张图片并提取文字" : "正在匹配原图字体并生成结果"}
                    </span>
                    <span>{ocrBatch ? Math.round((ocrBatch.done / ocrBatch.total) * 100) : Math.round(ocrProgress)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden bg-[#dfe6ec]">
                    <div
                      className="h-full bg-[#248da1] transition-all"
                      style={{ width: `${Math.max(4, Math.min(100, ocrBatch ? (ocrBatch.done / ocrBatch.total) * 100 : ocrProgress))}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="mb-3"><label className="mb-2 block text-xs">文字识别模型<TextModelSelect feature="canvas.ocr" compact dark={!lightCanvas} /></label><FeatureModelSelect feature="canvas.text-edit" disabled={batchLocked} /><ImageQualityControl compact feature="canvas.text-edit" resolution={artwork?.resolution || "1K"} disabled={batchLocked} /></div>
                {ocrError && (
                  <div className="mb-3 border border-[#f0c8c3] bg-[#fff5f3] px-3 py-2 text-[12px] font-medium text-[#b44f43]">
                    {ocrError}
                  </div>
                )}
                {ocrStatus === "done" && !ocrError && (
                  <div className="mb-3 border border-[#bfe1d3] bg-[#f2fbf7] px-3 py-2 text-[12px] font-medium text-[#28785e]">
                    已生成改字结果，并放在原图右侧。
                  </div>
                )}
                {ocrStatus === "ready" && ocrSegments.length === 0 && (
                  <div className="py-12 text-center text-[13px] canvas-ui-muted">
                    没有识别到可编辑文字。
                  </div>
                )}
                {ocrSegments.length > 0 && ocrImageSize && (() => {
                  
                  if (!artwork?.image) return null;
                  return (
                    <div className="mb-3 rounded-xl border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] p-2">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold canvas-ui-muted">
                        <span>整图文字定位</span>
                        <span>{ocrSegments.length} 处</span>
                      </div>
                      <div
                        data-testid="ocr-image-preview"
                        className="relative mx-auto w-full overflow-hidden bg-white"
                        style={{ aspectRatio: `${ocrImageSize.width} / ${ocrImageSize.height}` }}
                      >
                        <NextImage
                          src={cdnUrl(artwork.image)}
                          alt="OCR 整图预览"
                          fill
                          unoptimized
                          sizes="390px"
                          className="object-contain"
                        />
                        {ocrSegments.map((segment, index) => {
                          const focused = ocrFocusedId === segment.id;
                          return (
                            <button
                              key={segment.id}
                              type="button"
                              aria-label={`定位文字 ${index + 1}`}
                              title={segment.text}
                              onClick={() => {
                                onFocus(segment.id);
                                document.getElementById(`ocr-segment-${segment.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                              }}
                              className={cn(
                                "absolute border-2 transition-colors",
                                focused
                                  ? "border-[#315fc8] bg-[#315fc8]/15"
                                  : "border-[#248da1]/70 bg-[#248da1]/10 hover:border-[#315fc8]"
                              )}
                              style={{
                                left: `${(segment.box.x / ocrImageSize.width) * 100}%`,
                                top: `${(segment.box.y / ocrImageSize.height) * 100}%`,
                                width: `${(segment.box.width / ocrImageSize.width) * 100}%`,
                                height: `${(segment.box.height / ocrImageSize.height) * 100}%`,
                              }}
                            >
                              <span className="absolute -left-0.5 -top-5 bg-[#25313b] px-1 text-[9px] font-bold leading-4 text-white">
                                {index + 1}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-3">
                  {ocrSegments.map((segment, index) => (
                    <section
                      id={`ocr-segment-${segment.id}`}
                      key={segment.id}
                      onMouseEnter={() => onFocus(segment.id)}
                      onFocusCapture={() => onFocus(segment.id)}
                      className={cn(
                        "rounded-xl border bg-[var(--canvas-ui-soft)] p-3 transition-colors",
                        ocrFocusedId === segment.id ? "border-[#315fc8]" : "border-[var(--canvas-ui-border)]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide canvas-ui-muted">
                          文字 {index + 1}
                        </span>
                        <span className="text-[10px] canvas-ui-muted">
                          {Math.round(segment.confidence * 100)}% · {segment.box.x},{segment.box.y} · {segment.box.width}×{segment.box.height}
                        </span>
                      </div>
                      <p className="mt-2 break-words text-[12px] canvas-ui-muted">
                        原文：{segment.text}
                      </p>
                      <textarea
                        aria-label={`修改文字 ${index + 1}`}
                        value={segment.editedText}
                        disabled={batchLocked}
                        onChange={(event) => onEdit(segment.id,event.target.value)}
                        rows={2}
                        maxLength={300}
                        className="canvas-ui-input mt-2 w-full resize-y rounded-lg border px-2.5 py-2 text-[14px] font-medium leading-5 outline-none transition-colors focus:border-[#248da1]"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          aria-label={`应用文字 ${index + 1}`}
                          disabled={batchLocked || !segment.editedText.trim() || segment.editedText.trim() === segment.text}
                          onClick={() => void onApply(segment)}
                          className="canvas-ui-primary flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white hover:bg-[#182129] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          {ocrApplyingId === segment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                          应用
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
              </div>
              <div className="border-t border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)]">
                <div className="px-4 pt-2.5">
                  <button
                    type="button"
                    aria-label="批量应用全部修改"
                    data-testid="ocr-batch-apply"
                    disabled={batchLocked || batchPending === 0}
                    onClick={() => void onApplyAll()}
                    className="canvas-ui-primary flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white hover:bg-[#182129] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {ocrBatch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    {ocrBatch ? `批量应用中 ${ocrBatch.done}/${ocrBatch.total}` : `批量应用${batchPending ? `（${batchPending}）` : ""}`}
                  </button>
                </div>
                <div className="px-4 py-2 text-[10px] canvas-ui-muted">
                  {ocrEngine ? `识别引擎：${ocrEngine === "paddleocr" ? "PaddleOCR" : "视觉模型兜底"}` : "优先使用 PaddleOCR 扫描整图"}
                </div>
              </div>
            </aside>
 );
}
