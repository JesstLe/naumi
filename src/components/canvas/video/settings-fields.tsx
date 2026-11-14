"use client";
import {videoUiStructure,videoUiValue} from '@/lib/video/ui-draft';
import {previewCanvasInputs} from "@/lib/canvas/input-preview";
import {useVideoI18n} from "./i18n";
import { useState } from "react";
import type { OrderedInput } from "@/lib/video/references";
import { selectedVideoCatalogModel, type VideoCatalogModel, type VideoNodeConfig, type VideoInputChoice } from "@/lib/video/client-settings";
import { compileVideoPrompt } from "@/lib/video/prompt";
import { compileVideoCamera } from "@/lib/video/camera";
import { insertVideoPromptReference, remapVideoPromptReferences } from "@/lib/video/prompt-references";
import { browserRandomUUID } from "@/lib/browser-crypto";
import { VideoPromptEditor } from "./prompt-editor";
import { useVideoByocCatalog } from "./use-byoc-catalog";
import { VideoByocSettings } from "./byoc-settings";
import { VideoSettingsPanel } from "./settings-panel";
import { ReferenceList } from "./reference-list";
import { ShotEditor } from "./shot-editor";
import { ElementEditor } from "./element-editor";
import { CameraSettings } from "./camera-settings";
import { VideoField, VideoSection, videoFieldClass, videoButtonClass } from "./form-controls";
import { VideoAssetImportError } from "./use-video-assets";
export function VideoSettingsFields({ config, inputs, models, choices, nodeId, email, readOnly = false, busy = false, onConfig, onInputs, onImport, onImportBusyChange, onLoadMoreAssets, canLoadMoreAssets = false, hideComposerFields = false }: {
    hideComposerFields?: boolean;
    config: VideoNodeConfig;
    inputs: OrderedInput[];
    models: VideoCatalogModel[];
    choices: VideoInputChoice[];
    nodeId?: string;
    email?: string;
    readOnly?: boolean;
    busy?: boolean;
    onConfig: (value: VideoNodeConfig) => void;
    onInputs: (value: OrderedInput[]) => void;
    onImport?: (files: File[]) => Promise<VideoInputChoice[]>;
    onImportBusyChange?: (busy: boolean) => void;
    onLoadMoreAssets?: () => Promise<void>;
    canLoadMoreAssets?: boolean;
}) {
    const V = useVideoI18n();
    const [error, setError] = useState(""), [notice, setNotice] = useState(""), [uploading, setUploading] = useState(false);
    const byoc = useVideoByocCatalog(email), workflow = byoc.catalog?.workflows.find(item => item.id === config.comfyWorkflowId);
    const model=selectedVideoCatalogModel(models,config);
    const structure=model?.execution?videoUiStructure(config,inputs,model.execution):undefined;
    const shotRule=structure?.shots,elementRule=structure?.elements;
    const showShots=!model?.execution||!!shotRule||!!config.shots?.length;
    const showElements=!model?.execution||!!elementRule||!!config.elements?.length;
    const preview = (() => { try {
        const expanded = previewCanvasInputs(inputs, config.prompt || "", choices);
        return compileVideoPrompt(expanded.prompt, expanded.inputs, compileVideoCamera(config.camera)).prompt;
    }
    catch (cause) {
        return cause instanceof Error ? cause.message : "引用无效";
    } })();
    function changeConfig(next:VideoNodeConfig){onConfig(next);setError('');}
    function changeInputs(next:OrderedInput[]){onInputs(next);onConfig({...config,prompt:remapVideoPromptReferences(config.prompt||'',inputs,next),references:[]});setError('');}
    function mention(choice: VideoInputChoice, start: number, end: number) {
        if (readOnly || busy || uploading || !choice.available) return;
        const next = inputs.some(input => input.nodeId === choice.nodeId) ? inputs : [...inputs, { id: `ref-${browserRandomUUID()}`, nodeId: choice.nodeId, kind: choice.kind, role: choice.kind === "text" ? "context" as const : choice.kind === "video" ? "source_video" as const : choice.kind === "audio" ? "source_audio" as const : "reference" as const, value: choice.value }];
        const ordered = next, input = ordered.find(item => item.nodeId === choice.nodeId)!;
        const inserted = insertVideoPromptReference(config.prompt || "", inputs, ordered, choices, input.id, start, end);
        onInputs(ordered); onConfig({ ...config, prompt: inserted.prompt, references: [] }); return inserted.caret;
    }
    function appendImports(uploaded: VideoInputChoice[]) { changeInputs([...inputs, ...uploaded.filter(choice => !inputs.some(input => input.nodeId === choice.nodeId)).map(choice => ({ id: `ref-${choice.id}`, nodeId: choice.nodeId, kind: choice.kind, role: choice.kind === "video" ? "source_video" as const : choice.kind === "audio" ? "source_audio" as const : "reference" as const, value: choice.value }))]); }
    async function importFiles(files: File[]) { if (!onImport || busy || uploading || readOnly || !files.length)
        return; setUploading(true); onImportBusyChange?.(true); setError(""); try {
        appendImports(await onImport(files));
    }
    catch (cause) {
        if (cause instanceof VideoAssetImportError)
            appendImports(cause.choices);
        setError(cause instanceof Error ? cause.message : "素材导入失败");
    }
    finally {
        setUploading(false);
        onImportBusyChange?.(false);
    } }
    return <fieldset disabled={busy || uploading || readOnly} className="min-w-0 space-y-3">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2"><div className="space-y-4">
          <VideoField label={V("视频执行入口")}><select aria-label={V("视频执行入口")} className={videoFieldClass} value={config.comfyWorkflowId ? "byoc" : "managed"} onChange={event => { if (event.target.value === "byoc") {
        const selected = byoc.catalog?.workflows[0];
        onConfig({ ...config, comfyWorkflowId: selected?.id || "", modelId: selected?.id, comfyInputs: selected?.defaultMappings });
    }
    else
        onConfig({ ...config, comfyWorkflowId: undefined, comfyInputs:undefined, comfyOverrides:undefined }); }}><option value="managed">{V("\u6258\u7BA1\u89C6\u9891\u6A21\u578B")}</option><option value="byoc" disabled={!byoc.catalog?.workflows.length}>{V("\u81EA\u5907 ComfyUI \u00B7 0 \u79EF\u5206")}</option></select></VideoField>
          {config.comfyWorkflowId ? <><VideoField label={V("自备视频工作流")}><select aria-label={V("自备视频工作流")} className={videoFieldClass} value={config.comfyWorkflowId} onChange={event => { const selected = byoc.catalog?.workflows.find(item => item.id === event.target.value); if (selected)
        onConfig({ ...config, modelId: selected.id, comfyWorkflowId: selected.id, comfyInputs: selected.defaultMappings, comfyOverrides: undefined }); }}><option value="" disabled>{V("\u9009\u62E9\u5DE5\u4F5C\u6D41")}</option>{byoc.catalog?.workflows.map(item => <option key={item.id} value={item.id}>{item.name}{item.videoOutput ? "" : V(" · 自定义输出")}</option>)}</select></VideoField><VideoByocSettings workflow={workflow} config={config} onChange={changeConfig}/></> : <VideoSettingsPanel inputs={inputs} advancedOnly={hideComposerFields} disabled={readOnly || busy || uploading} config={config} models={models} onChange={changeConfig} onNotice={setNotice}/>}
          {byoc.error && <p role="status" className="text-xs text-amber-500">{byoc.error}</p>}<button type="button" className={videoButtonClass} onClick={() => void byoc.refresh()}>{V("\u5237\u65B0\u81EA\u5907\u5DE5\u4F5C\u6D41")}</button>
          {notice && <p role="status" className="text-xs text-amber-500">{notice}</p>}
          {!hideComposerFields&&<VideoField label={V("视频描述")}><VideoPromptEditor prompt={config.prompt || ""} inputs={inputs} choices={choices} nodeId={nodeId} rows={6} className={videoFieldClass} readOnly={readOnly || busy || uploading} onPrompt={prompt => changeConfig({ ...config, prompt })} onMention={mention}/></VideoField>}
          <details className="text-xs"><summary className="cursor-pointer opacity-70">{V("\u7F16\u8BD1\u9884\u89C8")}</summary><pre data-testid="video-compiled-prompt" className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-current/5 p-3 font-sans text-[11px]">{preview}</pre></details>
        </div><div className="space-y-4"><VideoSection title={V("引用素材")}>{onImport && <label className={`${videoButtonClass} inline-flex cursor-pointer`}><span>{V("\u4E0A\u4F20\u56FE\u7247 / \u89C6\u9891 / \u97F3\u9891")}</span><input aria-label={V("上传视频参考素材")} type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/webm" className="sr-only" disabled={busy || readOnly} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; void importFiles(files); }}/></label>}{canLoadMoreAssets && onLoadMoreAssets && <button type="button" className={videoButtonClass} disabled={busy || readOnly} onClick={() => void onLoadMoreAssets().catch(cause => setError(cause instanceof Error ? cause.message : "素材历史加载失败"))}>{V("\u52A0\u8F7D\u66F4\u591A\u5386\u53F2\u7D20\u6750")}</button>}<ReferenceList inputs={inputs} choices={choices.filter(choice => choice.nodeId !== nodeId)} onChange={changeInputs}/></VideoSection>
          {showShots && <VideoSection title={V("分镜")}><ShotEditor allowUnbounded shots={config.shots || []} duration={videoUiValue(config,'durationSeconds') as number|undefined} maxShots={shotRule?.max} minShotDurationSeconds={shotRule?.minDurationSeconds} shotDurationStep={shotRule?.durationStep} maxShotPromptChars={shotRule?.maxPromptChars} choices={choices} onChange={shots => changeConfig({ ...config, shots: shots.length ? shots : undefined })}/></VideoSection>}
          {showElements && <VideoSection title={V("元素")}><ElementEditor allowUnbounded elements={config.elements || []} choices={choices.filter(choice => choice.nodeId !== nodeId)} maxElements={elementRule?.max} maxReferences={undefined} onChange={elements => changeConfig({ ...config, elements: elements.length ? elements : undefined })}/></VideoSection>}
          {(!model?.execution||!!config.camera||!!model?.execution?.operations.some(op=>op.parameters.camera)) && <VideoSection title={V("摄影")}><CameraSettings camera={config.camera} onChange={camera => changeConfig({ ...config, camera })}/></VideoSection>}
        </div></div>
    {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </fieldset>;
}
