"use client";
import {useVideoI18n} from "./i18n";
import { useState } from "react";
import type { OrderedInput } from "@/lib/video/references";
import { catalogCapability, selectedVideoCatalogModel, videoModeRoles, type VideoCatalogModel, type VideoNodeConfig, type VideoInputChoice } from "@/lib/video/client-settings";
import { compileVideoPrompt } from "@/lib/video/prompt";
import { compileVideoCamera } from "@/lib/video/camera";
import { useVideoByocCatalog } from "./use-byoc-catalog";
import { VideoByocSettings } from "./byoc-settings";
import { VideoSettingsPanel } from "./settings-panel";
import { ReferenceList } from "./reference-list";
import { ShotEditor } from "./shot-editor";
import { ElementEditor } from "./element-editor";
import { CameraSettings } from "./camera-settings";
import { VideoField, VideoSection, videoFieldClass, videoButtonClass } from "./form-controls";
import { VideoAssetImportError } from "./use-video-assets";
export function VideoSettingsFields({ config, inputs, models, choices, nodeId, email, readOnly = false, busy = false, onConfig, onInputs, onImport, onImportBusyChange, onLoadMoreAssets, canLoadMoreAssets = false }: {
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
    const cap = catalogCapability(selectedVideoCatalogModel(models,config));
    const preview = (() => { try {
        return compileVideoPrompt(config.prompt || "", inputs, compileVideoCamera(config.camera)).prompt;
    }
    catch (cause) {
        return cause instanceof Error ? cause.message : "引用无效";
    } })();
    function changeConfig(next: VideoNodeConfig) { if (!next.comfyWorkflowId && next.mode !== config.mode) {
        const ordered = videoModeRoles(inputs, next.mode);
        onInputs(ordered);
        next = { ...next, references: [] };
    } onConfig(next); setError(""); }
    function changeInputs(next: OrderedInput[],preserveRoles=false) { const ordered = config.comfyWorkflowId||preserveRoles ? next : videoModeRoles(next, config.mode); onInputs(ordered); onConfig({ ...config, references: [] }); setError(""); }
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
        onConfig({ prompt: config.prompt, references: config.references, comfyWorkflowId: selected?.id || "", modelId: selected?.id, comfyInputs: selected?.defaultMappings });
    }
    else
        onConfig({ prompt: config.prompt, references: config.references }); }}><option value="managed">{V("\u6258\u7BA1\u89C6\u9891\u6A21\u578B")}</option><option value="byoc" disabled={!byoc.catalog?.endpoint || !byoc.catalog.workflows.length}>{V("\u81EA\u5907 ComfyUI \u00B7 0 \u79EF\u5206")}</option></select></VideoField>
          {config.comfyWorkflowId ? <><VideoField label={V("自备视频工作流")}><select aria-label={V("自备视频工作流")} className={videoFieldClass} value={config.comfyWorkflowId} onChange={event => { const selected = byoc.catalog?.workflows.find(item => item.id === event.target.value); if (selected)
        onConfig({ ...config, modelId: selected.id, comfyWorkflowId: selected.id, comfyInputs: selected.defaultMappings, comfyOverrides: undefined }); }}><option value="" disabled>{V("\u9009\u62E9\u5DE5\u4F5C\u6D41")}</option>{byoc.catalog?.workflows.map(item => <option key={item.id} value={item.id}>{item.name}{item.videoOutput ? "" : V(" · 自定义输出")}</option>)}</select></VideoField><VideoByocSettings workflow={workflow} config={config} onChange={changeConfig}/></> : <VideoSettingsPanel config={config} models={models} onChange={changeConfig} onNotice={setNotice}/>}
          {byoc.error && <p role="status" className="text-xs text-amber-500">{byoc.error}</p>}<button type="button" className={videoButtonClass} onClick={() => void byoc.refresh()}>{V("\u5237\u65B0\u81EA\u5907\u5DE5\u4F5C\u6D41")}</button>
          {notice && <p role="status" className="text-xs text-amber-500">{notice}</p>}
          <VideoField label={V("视频描述")}><textarea aria-label={V("视频描述")} rows={6} className={videoFieldClass} value={config.prompt || ""} onChange={event => changeConfig({ ...config, prompt: event.target.value })}/></VideoField>
          <details className="text-xs"><summary className="cursor-pointer opacity-70">{V("\u7F16\u8BD1\u9884\u89C8")}</summary><pre data-testid="video-compiled-prompt" className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-current/5 p-3 font-sans text-[11px]">{preview}</pre></details>
        </div><div className="space-y-4"><VideoSection title={V("引用素材")}>{onImport && <label className={`${videoButtonClass} inline-flex cursor-pointer`}><span>{V("\u4E0A\u4F20\u56FE\u7247 / \u89C6\u9891 / \u97F3\u9891")}</span><input aria-label={V("上传视频参考素材")} type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/webm" className="sr-only" disabled={busy || readOnly} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; void importFiles(files); }}/></label>}{canLoadMoreAssets && onLoadMoreAssets && <button type="button" className={videoButtonClass} disabled={busy || readOnly} onClick={() => void onLoadMoreAssets().catch(cause => setError(cause instanceof Error ? cause.message : "素材历史加载失败"))}>{V("\u52A0\u8F7D\u66F4\u591A\u5386\u53F2\u7D20\u6750")}</button>}<ReferenceList inputs={inputs} choices={choices.filter(choice => choice.nodeId !== nodeId)} onChange={changeInputs}/></VideoSection>
          {cap.supportsMultiShot === true && <VideoSection title={V("分镜")}><ShotEditor shots={config.shots || []} duration={config.durationSeconds} maxShots={cap.maxShots} choices={choices} onChange={shots => changeConfig({ ...config, shots: shots.length ? shots : undefined })}/></VideoSection>}
          {cap.supportsElements === true && <VideoSection title={V("元素")}><ElementEditor elements={config.elements || []} choices={choices.filter(choice => choice.nodeId !== nodeId)} maxElements={cap.maxElements} maxReferences={cap.maxElementReferences} onChange={elements => changeConfig({ ...config, elements: elements.length ? elements : undefined })}/></VideoSection>}
          {cap.supportsCamera === true && <VideoSection title={V("摄影")}><CameraSettings camera={config.camera} onChange={camera => changeConfig({ ...config, camera })}/></VideoSection>}
        </div></div>
    {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </fieldset>;
}
