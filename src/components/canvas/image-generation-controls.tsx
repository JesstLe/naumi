"use client";
import {useRef,useState,useLayoutEffect} from "react";
import {ChevronDown,GalleryVerticalEnd,Image as ImageIcon,Rotate3d,Ruler,Sparkles} from "lucide-react";
import {ImageQualityControl} from "@/components/image-quality-control";
import {useI18n} from "@/lib/i18n/locale-context";
import {cn} from "@/lib/utils";
import {CANVAS_RATIO_OPTIONS,canvasCombinationSupported,type canvasModelParameters} from "@/lib/canvas/generation-parameters";
import {CanvasModelSelect,type CanvasModelOption} from "./model-select";
import {CanvasParameterPopover} from "./parameter-popover";
import {CanvasSelect,ImageCountControl,RatioIcon} from "./composer-controls";

export type CanvasGenerationMode="standard"|"detail"|"triptych"|"split";
export type CanvasImageGenerationControlsProps={
  pending:boolean;light:boolean;
  model:{value:string;options:CanvasModelOption[];placeholder:string;onChange:(value:string)=>void};
  mode:CanvasGenerationMode;onMode:(value:CanvasGenerationMode)=>void;
  ratio:string;resolution:string;parameters:ReturnType<typeof canvasModelParameters>;
  onRatio:(value:string)=>void;onResolution:(value:string)=>void;
  count:number;onCount:(value:number)=>void;onMenuOpenChange:(value:boolean)=>void;
};
/** Controlled generation values; only menu visibility belongs to this view. */
export function CanvasImageGenerationControls({pending,light:lightCanvas,model,mode,onMode,ratio,resolution,parameters,onRatio,onResolution,count,onCount,onMenuOpenChange}:CanvasImageGenerationControlsProps){
  const {t}=useI18n(),[ratioMenuOpen,setRatioMenuOpen]=useState(false),ratioBtnRef=useRef<HTMLButtonElement>(null);
  useLayoutEffect(()=>{onMenuOpenChange(ratioMenuOpen);return()=>onMenuOpenChange(false);},[ratioMenuOpen,onMenuOpenChange]);
  const ratioControl = (
    <button
      ref={ratioBtnRef}
      type="button"
      onClick={() => setRatioMenuOpen(value => !value)}
      className="canvas-ui-control flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold transition-colors"
    >
      <Ruler aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span>
        {ratio === "auto" ? t("canvas.ratioAuto") : ratio} ·{" "}
        {resolution}
      </span>
      <ChevronDown
        className={cn(
          "h-3 w-3 text-[#9aa1ae] transition-transform",
          ratioMenuOpen && "rotate-180"
        )}
      />
    </button>
  );
  const ratioMenu =
    ratioMenuOpen
      ? <CanvasParameterPopover anchorRef={ratioBtnRef} light={lightCanvas} onClose={() => setRatioMenuOpen(false)}>
              <p className="canvas-ui-muted mb-2 text-[12px] font-semibold">
                {t("canvas.resolution")}
              </p>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {parameters.resolutions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onResolution(r)}
                    disabled={!canvasCombinationSupported(parameters, ratio, r)}
                    className={cn(
                      "rounded-xl border py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      resolution === r
                        ? "canvas-ui-control !border-[#6366f1] font-semibold"
                        : "canvas-ui-control"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="canvas-ui-muted mb-2 text-[12px] font-semibold">
                {t("canvas.ratio")}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {parameters.ratios.map(id => CANVAS_RATIO_OPTIONS.find(r => r.id === id) || { id, w: Number(id.split(":")[0]), h: Number(id.split(":")[1]) }).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onRatio(r.id)}
                    disabled={!canvasCombinationSupported(parameters, r.id, resolution)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl border py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      ratio === r.id
                        ? "canvas-ui-control !border-[#6366f1] font-semibold"
                        : "canvas-ui-control"
                    )}
                  >
                    <RatioIcon w={r.w} h={r.h} />
                    <span className="text-[11px] font-medium leading-none">
                      {r.id === "auto" ? t("canvas.ratioAuto") : r.id}
                    </span>
                  </button>
                ))}
              </div>

          </CanvasParameterPopover>
      : null;

  const displayedMode=pending?(mode==="detail"?"detail":"standard"):mode;
  const modes:CanvasGenerationMode[]=pending?["standard","detail"]:["standard","detail","triptych","split"];
  const fullLabel={standard:"canvas.modeStandard",detail:"canvas.modeDetail",triptych:"canvas.modeTriptych",split:"canvas.modeSplit"};
  const shortLabel={standard:"canvas.modeStandardShort",detail:"canvas.modeDetailShort",triptych:"canvas.modeTriptychShort",split:"canvas.modeSplitShort"};
  const quantity=pending?count:mode==="split"?3:mode==="triptych"?1:count;
  return <>
    <CanvasModelSelect value={model.value} label={t("canvas.dockModel")} placeholder={model.placeholder}
      testId="canvas-generation-model" onChange={model.onChange} options={model.options}/>
    <CanvasSelect dir="up" light value={displayedMode} options={modes.map(value=>({value,label:t(fullLabel[value])}))}
      onPick={value=>onMode(value as CanvasGenerationMode)}
      triggerClass="canvas-ui-control flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold disabled:opacity-45"
      trigger={<>{displayedMode==="detail"?<GalleryVerticalEnd className="h-3.5 w-3.5"/>:pending?<Sparkles className="h-3.5 w-3.5"/>:<Rotate3d className="h-3.5 w-3.5"/>}{t(shortLabel[displayedMode])}</>}/>
    {ratioControl}{ratioMenu}
    <ImageQualityControl compact feature="canvas.image" modelId={model.value} resolution={resolution} ratio={ratio} quantity={quantity}/>
    {pending||mode==="standard"||mode==="detail"?<ImageCountControl value={count} onChange={onCount} light/>:
      <span className="canvas-ui-control inline-flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold">
        <ImageIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/>{t(mode==="split"?"canvas.viewNodesCount":"canvas.viewSheetCount")}
      </span>}
  </>;
}
