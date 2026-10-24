"use client";
import type {ComponentProps,CSSProperties,RefObject} from "react";
import {Box,Focus,MapPin,RotateCcw,Upload} from "lucide-react";
import {cn} from "@/lib/utils";
import {GENERATION_STYLES} from "@/lib/mock-data";
import {useI18n} from "@/lib/i18n/locale-context";
import {CanvasComposerShell,CanvasComposerFooter,CanvasComposerOptions} from "./composer-shell";
import {CanvasSelect} from "./composer-controls";
import {ImageReferenceComposer} from "./image-reference-composer";
import {GenerationSubmitAction} from "./generation-submit-action";
import {CanvasImageGenerationControls,type CanvasImageGenerationControlsProps} from "./image-generation-controls";

export type CanvasImageComposerProps={
  pending:boolean;title?:string;readOnly?:boolean;style?:CSSProperties;dockRef:RefObject<HTMLDivElement|null>;onDismiss:()=>void;
  referenceEditor:Omit<ComponentProps<typeof ImageReferenceComposer>,"children"> & {identity:string|null};
  upload?:{inputRef:RefObject<HTMLInputElement|null>;available:boolean;onFiles:(files:FileList|null)=>unknown};
  controls:Omit<CanvasImageGenerationControlsProps,"pending">;
  imageActions?:{style:string;marked:boolean;onStyle:(value:string)=>void;onMark:()=>unknown;onFocus:()=>void;onRetry:()=>unknown};
  generation:Omit<ComponentProps<typeof GenerationSubmitAction>,"english">;error?:string|null;
};
/** Existing and blank image nodes share one draft/reference/control presentation.
 * No task, billing or document state is created here. */
export function CanvasImageComposer({pending,title,readOnly=false,style,dockRef,onDismiss,referenceEditor,upload,controls,imageActions,generation,error}:CanvasImageComposerProps){
  const {locale,t}=useI18n(),L=(zh:string,en:string)=>locale==="en"?en:zh;
  const {identity,...references}=referenceEditor;
  return <CanvasComposerShell data-testid={pending?"pending-node-dock":"image-node-dock"} ref={dockRef}
    style={style??(pending?{left:12,bottom:12}:{left:12,bottom:12,maxHeight:"60%"})}
    kind="image" heading={title||L("图片生成","Image generation")} onDismiss={onDismiss} closeLabel={L("关闭创作栏","Close composer")}>
    <div data-composer-body="true" className="min-h-0 overflow-y-auto px-4 pb-1.5 pt-3.5">
      <ImageReferenceComposer key={identity} {...references}>
        {!readOnly&&upload&&<>
          <input ref={upload.inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={event=>upload.onFiles(event.target.files)}/>
          {upload.available&&<button type="button" onClick={()=>upload.inputRef.current?.click()} title={t("canvas.toolbar.addReference")} aria-label={t("canvas.toolbar.addReference")}
            className="canvas-ui-action flex h-[68px] w-12 flex-none items-center justify-center rounded-[10px] border border-dashed border-[var(--canvas-ui-border)] hover:!border-[#6366f1]/60"><Upload className="h-4 w-4"/></button>}
        </>}
      </ImageReferenceComposer>
      {error&&<p className="pb-1 text-xs font-medium text-red-400">{error}</p>}
    </div>
    {!readOnly&&<CanvasComposerFooter controls={<>
      <CanvasImageGenerationControls {...controls} pending={pending}/>
      {imageActions&&(
                  <CanvasComposerOptions label={L("更多图片参数", "More image settings")}><CanvasSelect
                        dir="up"
                        light={true}
                        value={imageActions.style}
                        options={GENERATION_STYLES.map((s) => ({
                          value: s,
                          label: s,
                        }))}
                        onPick={(v) => imageActions.onStyle(v)}
                        triggerClass="canvas-ui-control flex cursor-pointer items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-[12.5px] transition-colors"
                        trigger={
                          <>
                            <Box aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-[88px] truncate">
                              {imageActions.style}
                            </span>
                          </>
                        }
                      />
                      <button
                        type="button"
                        onClick={() => void imageActions.onMark()}
                        aria-pressed={!!imageActions.marked}
                        className={cn(
                          "flex items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-[12.5px] transition-colors",
                          imageActions.marked
                            ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                            : "canvas-ui-control"
                        )}
                      >
                        <MapPin
                          className={cn(
                            "h-3.5 w-3.5",
                            imageActions.marked && "fill-current"
                          )}
                        />
                        {t(imageActions.marked ? "canvas.dockUnmark" : "canvas.dockMark")}
                      </button>
                      <button
                        type="button"
                        onClick={() => imageActions.onFocus()}
                        className="canvas-ui-control flex items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-[12.5px] transition-colors"
                      >
                        <Focus aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        {t("canvas.dockFocus")}
                      </button><button
                    type="button"
                    onClick={() => void imageActions.onRetry()}
                    disabled={generation.generating}
                    title={t("canvas.retryImageHint")}
                    className="canvas-ui-control flex h-10 items-center gap-1.5 rounded-[11px] border px-3 text-[12.5px] font-semibold disabled:opacity-45"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("canvas.retryImage")}
                  </button></CanvasComposerOptions>
      )}{imageActions&&" "}
    </>} actions={<GenerationSubmitAction {...generation} english={locale==="en"}/>}/>}
  </CanvasComposerShell>;
}
