"use client";
import {MousePointer2,BoxSelect,Hand} from "lucide-react";
import {cn} from "@/lib/utils";
import type {CanvasPrimaryTool} from "@/lib/canvas/view-controls";
export function CanvasToolButtons({tool:canvasTool,onSelect,t}:{tool:CanvasPrimaryTool;onSelect:(tool:CanvasPrimaryTool)=>void;t:(key:string)=>string}){return <>
<button
                    type="button"
                    data-tool="move"
                    onClick={()=>onSelect("move")}
                    aria-label={`${t("canvas.moveTool")} (V)`}
                title={`${t("canvas.moveTool")} (V)`}
                    aria-pressed={canvasTool === "move"}
                    className={cn(
                      "flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9",
                      canvasTool === "move"
                        ? "canvas-ui-primary shadow-sm"
                        : "canvas-ui-action"
                    )}
                  >
                    <MousePointer2 className="h-[18px] w-[18px]" />
                  </button>
<button
                    type="button"
                    data-tool="marquee"
                    onClick={()=>onSelect("marquee")}
                    aria-label={`${t("canvas.boxSelect")} (M)`}
                title={`${t("canvas.boxSelect")} (M)`}
                    aria-pressed={canvasTool === "marquee"}
                    className={cn(
                      "flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9",
                      canvasTool === "marquee"
                        ? "canvas-ui-primary shadow-sm"
                        : "canvas-ui-action"
                    )}
                  >
                    <BoxSelect className="h-[18px] w-[18px]" />
                  </button>
<button
                    type="button"
                    data-tool="hand"
                    onClick={()=>onSelect("hand")}
                    aria-label={`${t("canvas.handTool")} (H)`}
                title={`${t("canvas.handTool")} (H)`}
                    aria-pressed={canvasTool === "hand"}
                    className={cn(
                      "flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9",
                      canvasTool === "hand"
                        ? "canvas-ui-primary shadow-sm"
                        : "canvas-ui-action"
                    )}
                  >
                    <Hand className="h-[18px] w-[18px]" />
                  </button></>;}
