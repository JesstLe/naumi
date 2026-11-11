"use client";
import {VideoDurationControl} from "@/components/video/duration-control";
import {CanvasModelSelect} from "../model-select";
import {useVideoI18n} from "./i18n";
import type { ResolvedVideoCapability } from "@/lib/video/capability-schema";
import { catalogCapability, selectedVideoCatalogModel, VIDEO_MODE_LABELS, reconcileVideoSettings, type VideoCatalogModel, type VideoNodeConfig } from "@/lib/video/client-settings";
import { videoParameterChoices } from "@/lib/video/parameter-options";
import { VideoField, videoFieldClass, VideoSection } from "./form-controls";
import { videoOptionLabel, videoOptionValueLabel } from "@/lib/video/option-labels";
export function VideoSettingsPanel({ config, models, onChange, onNotice, disabled = false, advancedOnly = false }: {
    disabled?: boolean;
    advancedOnly?: boolean;
    config: VideoNodeConfig;
    models: VideoCatalogModel[];
    onChange: (next: VideoNodeConfig) => void;
    onNotice: (message: string) => void;
}) {
    const V = useVideoI18n();
    const model = selectedVideoCatalogModel(models,config), cap = catalogCapability(model);
    const parameters = videoParameterChoices(cap, config.mode, config);
    function reconcile(next: VideoNodeConfig, definition: ResolvedVideoCapability) { const result = reconcileVideoSettings(next, definition); onChange(result.config); onNotice(result.changes.length ? `${V("已调整")}：${result.changes.map(V).join("、")}` : ""); }
    const field = (name: string, value: unknown) => <input aria-label={name} value={String(value ?? "")} className={videoFieldClass} readOnly/>;
    const options=Object.entries(cap.providerOptions||{}).filter(([,option])=>option.send!=="omit");
    const renderOption=([key,option]:typeof options[number])=>{
        const supplied=Object.prototype.hasOwnProperty.call(config.providerOptions||{},key),value=config.providerOptions?.[key],label=V(videoOptionLabel(key)||key);
        const change=(raw:string)=>{const values={...config.providerOptions};if(raw==="")delete values[key];else{const selected=option.type==="enum"?option.values?.[Number(raw)]:option.type==="boolean"?raw==="true":option.type==="number"||option.type==="integer"?Number(raw):raw;if(selected===undefined)delete values[key];else values[key]=selected;}onChange({...config,providerOptions:values});};
        return <VideoField key={key} label={label}>{option.type==="enum"?<select aria-label={label} className={videoFieldClass} value={supplied?String(option.values?.findIndex(item=>item===value)):""} onChange={event=>change(event.target.value)}><option value="">{V("模型默认")}</option>{(option.values||[]).map((item,index)=><option key={index} value={index}>{V(videoOptionValueLabel(key,item))}</option>)}</select>:option.type==="boolean"?<select aria-label={label} className={videoFieldClass} value={supplied?String(value):""} onChange={event=>change(event.target.value)}><option value="">{V("模型默认")}</option><option value="true">{V("开启")}</option><option value="false">{V("关闭开关")}</option></select>:<input aria-label={label} className={videoFieldClass} type={option.type==="number"||option.type==="integer"?"number":"text"} min={option.minimum} max={option.maximum} step={option.type==="integer"?1:"any"} value={supplied?String(value??""):""} placeholder={option.defaultValue==null?V("模型默认"):String(option.defaultValue)} onChange={event=>change(event.target.value)}/>}</VideoField>;
    };
    return <fieldset disabled={disabled} className="space-y-3" data-testid="video-settings-panel">
    {!advancedOnly&&<>
    <VideoField label={V("视频模型")}><CanvasModelSelect fullWidth disabled={disabled} label={V("视频模型")}
      value={model ? `${model.providerId}/${model.modelId}` : ""} placeholder={V("未选择模型")}
      options={models.map(item=>({value:`${item.providerId}/${item.modelId}`,modelId:item.modelId,label:item.label}))}
      onChange={value=>{const selected=models.find(item=>`${item.providerId}/${item.modelId}`===value);if(selected)reconcile({...config,workflowTaskId:undefined,providerId:selected.providerId,modelId:selected.modelId},catalogCapability(selected));}} /></VideoField>
    <VideoField label={V("视频生成模式")}><select aria-label={V("视频生成模式")} value={config.mode || ""} className={videoFieldClass} onChange={event => reconcile({ ...config, mode: event.target.value as VideoNodeConfig["mode"] },cap)}>
      <option value="" disabled>{cap.modes?.length ? V("选择模式") : V("能力未配置")}</option>{(cap.modes || []).map(mode => <option key={mode} value={mode}>{V(VIDEO_MODE_LABELS[mode])}</option>)}
    </select></VideoField>
    </>}
    <div className="grid grid-cols-2 gap-3">
      {!advancedOnly&&<>
      <div className="col-span-2"><VideoDurationControl capability={cap} mode={config.mode} value={config.durationSeconds} onChange={durationSeconds => reconcile({ ...config, durationSeconds }, cap)} disabled={disabled} translate={V}/></div>
      <VideoField label={V("视频分辨率")}><select aria-label={V("视频分辨率")} className={videoFieldClass} value={config.resolution || ""} onChange={event => reconcile({ ...config, resolution: event.target.value },cap)}><option value="" disabled>{V("\u672A\u914D\u7F6E")}</option>{parameters.resolutions.map(value => <option key={value}>{value}</option>)}</select></VideoField>
      <VideoField label={V("视频画幅")}><select aria-label={V("视频画幅")} className={videoFieldClass} value={config.aspectRatio || ""} onChange={event => onChange({ ...config, aspectRatio: event.target.value })}><option value="" disabled>{V("\u672A\u914D\u7F6E")}</option>{parameters.aspectRatios.map(value => <option key={value}>{value}</option>)}</select></VideoField>
      </>}
      {!advancedOnly&&<VideoField label={V("生成声音")}>{cap.audio === "optional" ? <select aria-label={V("生成声音")} className={videoFieldClass} value={config.generateAudio === undefined ? "default" : String(config.generateAudio)} onChange={event => { const next = { ...config }; if (event.target.value === "default")
        delete next.generateAudio;
    else
        next.generateAudio = event.target.value === "true"; onChange(next); }}><option value="default">{V("\u6A21\u578B\u9ED8\u8BA4")}</option><option value="true">{V("\u5F00\u542F")}</option><option value="false">{V("关闭开关")}</option></select> : field(V("生成声音"), cap.audio === "required" ? V("必须开启") : cap.audio === "disabled" ? V("不生成") : V("能力未配置"))}</VideoField>}
    </div>
    {cap.supportsExactSize === true && <div className="grid grid-cols-2 gap-3">{(["width", "height"] as const).map(key => <VideoField key={key} label={key === "width" ? V("视频宽度") : V("视频高度")}><input aria-label={key === "width" ? V("视频宽度") : V("视频高度")} type="number" min={1} max={16384} value={config[key] ?? ""} className={videoFieldClass} onChange={event => onChange({ ...config, [key]: event.target.value ? Number(event.target.value) : undefined })}/></VideoField>)}</div>}
    {cap.supportsNegativePrompt === true && <VideoField label={V("视频负面提示词")}><textarea aria-label={V("视频负面提示词")} rows={2} value={config.negativePrompt || ""} className={videoFieldClass} onChange={event => onChange({ ...config, negativePrompt: event.target.value || undefined })}/></VideoField>}
    {cap.supportsWatermark === true && <VideoField label={V("视频水印")}><select aria-label={V("视频水印")} className={videoFieldClass} value={config.watermark === undefined ? "default" : String(config.watermark)} onChange={event => onChange({ ...config, watermark: event.target.value === "default" ? undefined : event.target.value === "true" })}><option value="default">{V("\u6A21\u578B\u9ED8\u8BA4")}</option><option value="true">{V("\u5F00\u542F")}</option><option value="false">{V("关闭开关")}</option></select></VideoField>}
    {options.some(([key])=>videoOptionLabel(key))&&<VideoSection title={V("模型参数")}>{options.filter(([key])=>videoOptionLabel(key)).map(renderOption)}</VideoSection>}
    {options.some(([key])=>!videoOptionLabel(key))&&<details className="text-xs"><summary className="canvas-ui-muted cursor-pointer py-1">{V("兼容参数")}</summary><div className="mt-2 space-y-3">{options.filter(([key])=>!videoOptionLabel(key)).map(renderOption)}</div></details>}
  </fieldset>;
}
