"use client";
import {LayoutGrid,Map as MapIcon,Magnet,Maximize,Moon,Sun} from "lucide-react";
import {cn} from "@/lib/utils";
import {zoomPercentLabel} from "@/lib/canvas/view-controls";
import type {CanvasViewControls} from "./use-canvas-view-controls";
export function CanvasViewToolbar({controls,zoom,readOnly,tidyDisabled,onTidy,t}:{controls:CanvasViewControls;zoom:number;readOnly:boolean;tidyDisabled:boolean;onTidy:()=>void;t:(key:string)=>string}){
 const {showMinimap,snapGrid,lightCanvas,zoomMenuOpen,zoomInput,zoomButtonRef,zoomLabelRef,zoomInputRef,modifierKey}=controls;
 const viewport={zoom};return (
<div
              data-testid="canvas-view-toolbar"
              onKeyDown={event=>{if(event.key==="Escape"&&zoomMenuOpen){event.preventDefault();event.stopPropagation();controls.closeZoom();}}}
              className={cn(
                "canvas-ui-surface absolute bottom-4 left-4 flex items-center gap-0.5 rounded-xl border p-1.5",
                zoomMenuOpen ? "z-40" : "z-20"
              )}
            >
              {!readOnly && (
                <button
                  type="button"
                  title={t("canvas.ctxTidy")}
                  aria-label={t("canvas.ctxTidy")}
                  onClick={onTidy}
                  disabled={tidyDisabled}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                title={t("canvas.minimap")}
                aria-pressed={showMinimap}
                aria-label={t("canvas.minimap")}
                onClick={controls.toggleMinimap}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-secondary",
                  showMinimap ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <MapIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={t("canvas.snap")}
                aria-pressed={snapGrid}
                aria-label={t("canvas.snap")}
                onClick={controls.toggleSnap}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-secondary",
                  snapGrid ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Magnet className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={t("canvas.ctxFit")}
                aria-label={t("canvas.ctxFit")}
                onClick={() => void controls.fit()}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Maximize className="h-4 w-4" />
              </button>
              <button
                type="button"
                data-testid="canvas-theme-toggle"
                aria-label={t(lightCanvas ? "canvas.toolbar.darkCanvas" : "canvas.toolbar.lightCanvas")}
                title={t(lightCanvas ? "canvas.toolbar.darkCanvas" : "canvas.toolbar.lightCanvas")}
                aria-pressed={!lightCanvas}
                onClick={controls.toggleTheme}
                className="canvas-ui-action flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315fc8]"
              >
                {lightCanvas ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
              </button>
              <span className="mx-0.5 h-5 w-px bg-border" />
              {/* 缩放 % → 点击弹出缩放菜单(放大/缩小/适合屏幕/缩放至…) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={controls.toggleZoom}
                  title={t("canvas.toolbar.zoom")}
                  ref={zoomButtonRef}
                  aria-label={`${t("canvas.toolbar.zoom")} ${zoomPercentLabel(viewport.zoom)}`}
                  aria-expanded={zoomMenuOpen}
                  className="rounded-lg px-1.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span ref={zoomLabelRef}>{zoomPercentLabel(viewport.zoom)}</span>
                </button>
                {zoomMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={controls.closeZoom}
                    />
                    <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-50 -translate-x-1/2">
                    <div className="canvas-ui-surface menu-pop-up w-52 overflow-hidden rounded-xl border py-1.5">
                      {/* 可输入的缩放值 */}
                      <div className="canvas-ui-control mx-1.5 mb-1 flex items-center justify-between rounded-lg px-3 py-2">
                        <input
                          ref={zoomInputRef}
                          value={zoomInput}
                          onChange={event=>controls.changeZoom(event.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              controls.applyZoom();
                              controls.closeZoom();
                            }
                          }}
                          className="w-16 bg-transparent text-sm font-medium outline-none"
                          inputMode="decimal"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                      {[
                        {
                          label: "放大",
                          hk: `${modifierKey} +`,
                          fn: () => controls.zoomIn(),
                        },
                        {
                          label: "缩小",
                          hk: `${modifierKey} -`,
                          fn: () => controls.zoomOut(),
                        },
                        { sep: true },
                        {
                          label: "缩放至50%",
                          fn: () => controls.zoomTo(0.5),
                        },
                        {
                          label: "缩放至100%",
                          fn: () => controls.zoomTo(1),
                        },
                        {
                          label: "缩放至800%",
                          fn: () => controls.zoomTo(8),
                        },
                      ].map((it, i) =>
                        it.sep ? (
                          <div
                            key={`s${i}`}
                            className="my-1 h-px bg-border"
                          />
                        ) : (
                          <button
                            key={it.label}
                            type="button"
                            onClick={() => {
                              it.fn?.();
                              controls.closeZoom();
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                          >
                            <span>{it.label}</span>
                            {it.hk && (
                              <span className="text-xs text-muted-foreground">
                                {it.hk}
                              </span>
                            )}
                          </button>
                        )
                      )}
                    </div>
                    </div>
                  </>
                )}
              </div>
            </div>);}
