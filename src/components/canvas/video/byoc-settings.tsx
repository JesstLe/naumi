"use client";
import {useVideoI18n} from "./i18n";
import type { VideoNodeConfig } from "@/lib/video/client-settings";
import type { VideoByocWorkflow } from "@/lib/video/byoc-settings";
import type { VideoWorkflowManifest } from "@/lib/video/workflow-schema";
import { VideoField, VideoSection, videoFieldClass, videoButtonClass } from "./form-controls";
const types: VideoWorkflowManifest["inputs"][number]["type"][] = ["image", "firstFrame", "lastFrame", "video", "audioReference", "prompt", "negativePrompt", "duration", "resolution", "aspectRatio", "generateAudio", "watermark", "custom"];
const labels: Record<string, string> = { image: "图片", firstFrame: "首帧", lastFrame: "尾帧", video: "视频", audioReference: "音频", prompt: "描述", negativePrompt: "负面描述", duration: "时长", resolution: "分辨率", aspectRatio: "比例", generateAudio: "声音开关", watermark: "水印开关", custom: "固定值" };
export function VideoByocSettings({ workflow, config, onChange }: {
    workflow?: VideoByocWorkflow;
    config: VideoNodeConfig;
    onChange: (value: VideoNodeConfig) => void;
}) {
    const V = useVideoI18n();
    const overrides = config.comfyOverrides || {}, mappings = config.comfyInputs || workflow?.defaultMappings || [];
    function mapping(index: number, change: Partial<(typeof mappings)[number]>) { onChange({ ...config, comfyInputs: mappings.map((item, i) => i === index ? { ...item, ...change } : item) }); }
    return <div className="space-y-4" data-testid="video-byoc-settings">
    {!workflow && <p role="status" className="text-xs text-amber-500">{V("\u5DE5\u4F5C\u6D41\u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9")}</p>}
    <div className="grid grid-cols-2 gap-3">{(["durationSeconds", "resolution", "aspectRatio", "negativePrompt"] as const).filter(key => mappings.some(item => item.type === ({ durationSeconds: "duration", resolution: "resolution", aspectRatio: "aspectRatio", negativePrompt: "negativePrompt" })[key])).map(key => <VideoField key={key} label={({ durationSeconds: V("视频时长"), resolution: V("视频分辨率"), aspectRatio: V("视频比例"), negativePrompt: V("视频负面描述") })[key]}><input aria-label={V(`工作流 ${key}`)} className={videoFieldClass} type={key === "durationSeconds" ? "number" : "text"} min={1} max={3600} value={config[key] ?? ""} onChange={event => onChange({ ...config, [key]: event.target.value ? (key === "durationSeconds" ? Number(event.target.value) : event.target.value) : undefined })}/></VideoField>)}{(["generateAudio", "watermark"] as const).filter(key => mappings.some(item => item.type === key)).map(key => <VideoField key={key} label={key === "generateAudio" ? V("声音开关") : V("水印开关")}><select aria-label={V(`工作流 ${key}`)} className={videoFieldClass} value={config[key] === undefined ? "default" : String(config[key])} onChange={event => onChange({ ...config, [key]: event.target.value === "default" ? undefined : event.target.value === "true" })}><option value="default">{V("\u5DE5\u4F5C\u6D41\u9ED8\u8BA4")}</option><option value="true">{V("\u5F00\u542F")}</option><option value="false">{V("关闭开关")}</option></select></VideoField>)}</div>
    {workflow && <VideoSection title={V("工作流输入")}>{workflow.inputs.texts.map(slot => <VideoField key={slot.nodeId} label={`${slot.label} · ${slot.role}`}><textarea aria-label={V(`工作流文本 ${slot.nodeId}`)} className={videoFieldClass} rows={3} placeholder={slot.current} value={overrides.texts?.[slot.nodeId] ?? ""} onChange={event => onChange({ ...config, comfyOverrides: { ...overrides, texts: { ...overrides.texts, [slot.nodeId]: event.target.value } } })}/><button type="button" className={`${videoButtonClass} mt-1`} onClick={() => { const texts = { ...overrides.texts }; delete texts[slot.nodeId]; onChange({ ...config, comfyOverrides: { ...overrides, texts: Object.keys(texts).length ? texts : undefined } }); }}>{V("\u4F7F\u7528\u5DE5\u4F5C\u6D41\u9ED8\u8BA4\u503C")}</button></VideoField>)}
      <div className="grid grid-cols-2 gap-3">{workflow.inputs.seeds.map(slot => <VideoField key={`${slot.nodeId}:${slot.field}`} label={`${slot.nodeId} · ${slot.field}`}><input aria-label={V(`工作流种子 ${slot.nodeId}`)} type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} placeholder={V("随机")} className={videoFieldClass} value={overrides.seeds?.[slot.nodeId] ?? ""} onChange={event => { const seeds = { ...overrides.seeds }; if (!event.target.value)
            delete seeds[slot.nodeId];
        else
            seeds[slot.nodeId] = Number(event.target.value); onChange({ ...config, comfyOverrides: { ...overrides, seeds } }); }}/></VideoField>)}{workflow.inputs.numerics.map(slot => <VideoField key={`${slot.nodeId}:${slot.field}`} label={`${slot.label} · ${slot.nodeId}.${slot.field}`}><input aria-label={V(`工作流数值 ${slot.nodeId}.${slot.field}`)} type="number" min={1} step={1} className={videoFieldClass} placeholder={String(slot.current)} value={overrides.numerics?.[slot.nodeId]?.[slot.field] ?? ""} onChange={event => { const fields = { ...overrides.numerics?.[slot.nodeId] }; if (!event.target.value)
            delete fields[slot.field];
        else
            fields[slot.field] = Number(event.target.value); onChange({ ...config, comfyOverrides: { ...overrides, numerics: { ...overrides.numerics, [slot.nodeId]: fields } } }); }}/></VideoField>)}</div>
    </VideoSection>}
    <VideoSection title={V("输入映射")}>{mappings.map((item, index) => <div key={item.name} className="space-y-2 rounded-lg border border-current/10 p-2"><div className="flex gap-2"><select aria-label={V(`工作流映射${index + 1}类型`)} className={videoFieldClass} value={item.type} onChange={event => mapping(index, { type: event.target.value as typeof item.type })}>{types.map(type => <option key={type} value={type}>{V(labels[type])}</option>)}</select><button type="button" className={videoButtonClass} onClick={() => onChange({ ...config, comfyInputs: mappings.filter((_, i) => i !== index) })}>{V("\u79FB\u9664")}</button></div><select aria-label={V(`工作流映射${index + 1}路径`)} className={videoFieldClass} value={JSON.stringify(item.path)} onChange={event => mapping(index, { path: JSON.parse(event.target.value) })}><option value={JSON.stringify(item.path)}>{item.path.join(".")}</option>{workflow?.paths.map(path => <option key={`${path.nodeId}:${path.field}`} value={JSON.stringify([path.nodeId, "inputs", path.field])}>{path.label}</option>)}</select>
      {["image", "video", "audioReference"].includes(item.type) && <VideoField label={V("同类素材序号（从0开始）")}><input aria-label={V(`工作流映射${index + 1}序号`)} type="number" min={0} max={127} step={1} className={videoFieldClass} value={item.index ?? 0} onChange={event => mapping(index, { index: Number(event.target.value) })}/></VideoField>}
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={item.required === true} onChange={event => mapping(index, { required: event.target.checked })}/>{V("\u5FC5\u586B")}</label>{item.type === "custom" && <VideoField label={V("固定值 JSON")}><input aria-label={V(`工作流映射${index + 1}固定值`)} className={videoFieldClass} defaultValue={JSON.stringify(item.defaultValue ?? null)} onBlur={event => { try {
            mapping(index, { defaultValue: JSON.parse(event.target.value) });
            event.target.setCustomValidity("");
        }
        catch {
            event.target.setCustomValidity("请输入有效 JSON");
            event.target.reportValidity();
        } }}/></VideoField>}
    </div>)}<button type="button" className={videoButtonClass} disabled={!workflow?.paths.length || mappings.length >= 256} onClick={() => { const path = workflow!.paths[0]; onChange({ ...config, comfyInputs: [...mappings, { name: `input-${mappings.length}-${Date.now()}`, type: "image", path: [path.nodeId, "inputs", path.field], index: 0, required: true }] }); }}>{V("\u6DFB\u52A0\u6620\u5C04")}</button></VideoSection>
  </div>;
}
