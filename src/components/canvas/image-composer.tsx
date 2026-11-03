"use client";
import {ImageVersionControl} from "./image-version-control";
import {SelectMenu} from "@/components/ui/select-menu";
import type {CanvasGenerationTask} from "@/lib/canvas/scene-types";
import type {ComponentProps,CSSProperties,RefObject} from "react";
import {CanvasPromptOptimizer} from "./prompt-optimizer";
import {optimizeCanvasPrompt} from "@/lib/canvas/prompt-optimizer-client";
import {Box,Focus,MapPin,Upload} from "lucide-react";
import {cn} from "@/lib/utils";
import {GENERATION_STYLES} from "@/lib/mock-data";
import {useI18n} from "@/lib/i18n/locale-context";
import {CanvasComposerShell,CanvasComposerFooter,CanvasComposerOptions} from "./composer-shell";
import {CanvasSelect} from "./composer-controls";
import {ImageReferenceComposer} from "./image-reference-composer";
import {GenerationSubmitAction} from "./generation-submit-action";
import {CanvasImageGenerationControls,type CanvasImageGenerationControlsProps} from "./image-generation-controls";

export type CanvasImageComposerProps={
  versions?:ComponentProps<typeof ImageVersionControl>;
  pending:boolean;title?:string;readOnly?:boolean;optimizationDisabled?:boolean;style?:CSSProperties;dockRef:RefObject<HTMLDivElement|null>;onDismiss:()=>void;
  expanded?:boolean;onToggleExpand?:()=>void;
  referenceEditor:Omit<ComponentProps<typeof ImageReferenceComposer>,"children"> & {identity:string|null};
  upload?:{inputRef:RefObject<HTMLInputElement|null>;available:boolean;disabled?:boolean;onFiles:(files:FileList|null)=>unknown};
  promptRecovery?:{error:string;retry:()=>void;reload:()=>void};
  recovery?:{identity:string;tasks:CanvasGenerationTask[];busy:(key:string)=>boolean;check:(task:CanvasGenerationTask)=>unknown};
  restoreReferences?:{disabled:boolean;onRestore:()=>void};
  controls:Omit<CanvasImageGenerationControlsProps,"pending">;
  imageActions?:{style:string;marked:boolean;onStyle:(value:string)=>void;onMark:()=>unknown;onFocus:()=>void};
  generation:Omit<ComponentProps<typeof GenerationSubmitAction>,"english">;error?:string|null;
};
/** Existing and blank image nodes share one draft/reference/control presentation.
 * No task, billing or document state is created here. */
export function CanvasImageComposer({versions,pending,title,readOnly=false,optimizationDisabled=false,style,dockRef,onDismiss,expanded,onToggleExpand,referenceEditor,upload,promptRecovery,recovery,restoreReferences,controls,imageActions,generation,error}:CanvasImageComposerProps){
  const {locale,t}=useI18n(),L=(zh:string,en:string)=>locale==="en"?en:zh;
  const {identity,...references}=referenceEditor;
  return <CanvasComposerShell data-testid={pending?"pending-node-dock":"image-node-dock"} ref={dockRef}
    style={style??(pending?{left:12,bottom:12}:{left:12,bottom:12,maxHeight:"60%"})}
    kind="image" expanded={expanded} onToggleExpand={onToggleExpand} heading={title||L("图片生成","Image generation")} onDismiss={onDismiss} closeLabel={L("关闭创作栏","Close composer")}>
    <div data-composer-body="true" className="min-h-0 overflow-y-auto px-4 pb-1.5 pt-3.5">
      <ImageReferenceComposer key={identity} {...references}>
        {!readOnly&&upload&&<>
          <input ref={upload.inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={event=>upload.onFiles(event.target.files)}/>
          {upload.available&&<button type="button" disabled={upload.disabled} onClick={()=>upload.inputRef.current?.click()} title={t("canvas.toolbar.addReference")} aria-label={t("canvas.toolbar.addReference")}
            className={cn("canvas-ui-action flex flex-none items-center justify-center rounded-[10px] border border-dashed border-[var(--canvas-ui-border)] hover:!border-[#6366f1]/60",references.references.length?"h-[68px] w-12":"h-8 gap-1.5 px-2.5 text-xs")}><Upload className="h-4 w-4"/>{!references.references.length&&L("参考图","Reference")}</button>}
        </>}
        {!readOnly&&restoreReferences&&<button type="button" onClick={restoreReferences.onRestore} disabled={restoreReferences.disabled} className="canvas-ui-action h-8 rounded-lg border border-[var(--canvas-ui-border)] px-2 text-xs disabled:opacity-40">{L("恢复节点参考","Restore node references")}</button>}
      </ImageReferenceComposer>
      {promptRecovery?.error&&<div className="flex gap-3 py-1 text-xs"><button type="button" onClick={promptRecovery.retry} className="text-indigo-600">{L("重试保存","Retry save")}</button><button type="button" onClick={promptRecovery.reload} className="text-slate-500">{L("使用已保存版本","Use saved version")}</button></div>}
      {error&&<p className="pb-1 text-xs font-medium text-red-400">{error}</p>}
    </div>
    {!readOnly&&<CanvasComposerFooter controls={<>
      <CanvasImageGenerationControls {...controls} pending={pending}/>
      <CanvasPromptOptimizer contextKey={identity} prompt={references.prompt} disabled={readOnly||optimizationDisabled||generation.generating} english={locale==="en"} onOptimize={(prompt,signal)=>optimizeCanvasPrompt("canvas-image",prompt,signal)} onApply={references.onPrompt}/>
      {imageActions&&(
                  <CanvasComposerOptions label={L("更多图片参数", "More image settings")}><CanvasSelect
                        dir="up"
                        light={controls.light}
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
                      </button></CanvasComposerOptions>
      )}{imageActions&&" "}
    </>} actions={<>{versions&&<ImageVersionControl {...versions}/>}
      {recovery&&recovery.tasks.length>1?<span data-testid="generation-original-task-menu" className="min-w-0 max-w-[144px]">
        <SelectMenu key={recovery.identity} value="__original_task__" label={L("检查原任务","Check original task")} className="h-10 max-w-full rounded-[11px] px-2.5 text-xs"
          options={[{value:"__original_task__",label:`${L("检查原任务","Check original task")} · ${recovery.tasks.length}`,disabled:true},...recovery.tasks.map((task,index)=>({value:task.operationKey,label:`${L("任务","Task")} ${index+1} · ${task.failure?.message||""}`,disabled:recovery.busy(task.operationKey)}))]}
          onChange={key=>{const task=recovery.tasks.find(task=>task.operationKey===key);if(task)void recovery.check(task);}}/>
      </span>:recovery?.tasks.map(task=><button key={task.operationKey} type="button" data-testid="generation-check-original" data-operation-key={task.operationKey} disabled={recovery.busy(task.operationKey)} title={task.failure?.message}
        className="canvas-ui-control nodrag nopan flex h-10 items-center gap-1.5 rounded-[11px] border px-2.5 text-xs font-medium disabled:opacity-50" onClick={()=>void recovery.check(task)}>{recovery.busy(task.operationKey)?L("核对中…","Checking…"):L("检查原任务","Check original task")}</button>)}
      <GenerationSubmitAction {...generation} english={locale==="en"}/></>}/>}
  </CanvasComposerShell>;
}
