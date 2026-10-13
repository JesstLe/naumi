"use client";
import { useEffect,useState } from "react";
import { VIDEO_MODES,VIDEO_WIRE_PROFILES,videoDefinitionSchema,type VideoModelDefinition,type VideoWireProfile } from "@/lib/video/capability-schema";

const modeLabels:Record<typeof VIDEO_MODES[number],string>={text:"文生视频",single_image:"单图参考",frames_required:"首尾帧必填",first_optional:"首帧可选",last_optional:"尾帧可选",reference:"混合参考",video_edit:"视频编辑",extend:"视频续写",motion_control:"运动控制",lip_sync:"口型同步"};
const featureLabels={supportsAutoDuration:"自动时长",supportsNegativePrompt:"负面提示词",supportsWatermark:"水印参数",supportsMultiShot:"多镜头",supportsElements:"元素参考",supportsCamera:"摄影机参数",supportsExactSize:"精确宽高",supportsCancellation:"供应商取消"} as const;
export function VideoCapabilityEditor({value,profile,onChange}:{value?:VideoModelDefinition;profile?:VideoWireProfile;onChange:(value:VideoModelDefinition|undefined,profile:VideoWireProfile|undefined)=>void}){
  const [advanced,setAdvanced]=useState(""),[error,setError]=useState("");
  useEffect(()=>{setAdvanced(JSON.stringify(value||{},null,2));setError("");},[value]);
  const patch=(next:Partial<VideoModelDefinition>)=>onChange({...value,...next},profile);
  const entries=value?.durationResolutionMap||[];
  return <fieldset className="my-4 grid gap-3 rounded-xl border border-c-border p-4" aria-label="视频能力配置">
    <legend className="px-2 font-semibold">视频能力</legend>
    <label className="grid gap-1 text-sm">实际协议<select aria-label="视频实际协议" className="rounded-lg border border-c-border bg-c-surface p-2" value={profile||""} onChange={e=>onChange(value,e.target.value as VideoWireProfile||undefined)}><option value="">供应商默认</option>{VIDEO_WIRE_PROFILES.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
    <div className="flex flex-wrap gap-3">{VIDEO_MODES.map(mode=><label key={mode} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={value?.modes?.includes(mode)||false} onChange={e=>patch({modes:e.target.checked?[...(value?.modes||[]),mode]:(value?.modes||[]).filter(id=>id!==mode)})}/>{modeLabels[mode]}</label>)}</div>
    <div className="grid gap-3 sm:grid-cols-3">{(["images","videos","audios"] as const).map((kind,index)=><label key={kind} className="grid gap-1 text-sm">{["参考图片上限","参考视频上限","参考音频上限"][index]}<input type="number" min={0} max={128} aria-label={["参考图片上限","参考视频上限","参考音频上限"][index]} className="rounded-lg border border-c-border bg-c-surface p-2" value={value?.limits?.[kind]??""} onChange={e=>patch({limits:{...value?.limits,[kind]:e.target.value===""?undefined:Number(e.target.value)}})}/></label>)}</div>
    <label className="grid gap-1 text-sm">声音<select aria-label="视频声音能力" className="rounded-lg border border-c-border bg-c-surface p-2" value={value?.audio===undefined?"inherit":value.audio===null?"unknown":value.audio} onChange={e=>patch({audio:e.target.value==="inherit"?undefined:e.target.value==="unknown"?null:e.target.value as "required"|"disabled"|"optional"})}><option value="inherit">跟随上游</option><option value="unknown">未知</option><option value="optional">可切换</option><option value="required">必须开启</option><option value="disabled">禁用</option></select></label>
    <div className="grid gap-2 sm:grid-cols-2">{Object.entries(featureLabels).map(([key,label])=>{
      const item=value?.[key as keyof typeof featureLabels];
      return <label key={key} className="grid gap-1 text-sm">{label}<select aria-label={`视频能力 ${label}`} className="rounded-lg border border-c-border bg-c-surface p-2" value={item===undefined?"inherit":item===null?"unknown":String(item)} onChange={e=>patch({[key]:e.target.value==="inherit"?undefined:e.target.value==="unknown"?null:e.target.value==="true"})}><option value="inherit">跟随上游</option><option value="unknown">未知</option><option value="true">支持</option><option value="false">禁用</option></select></label>;
    })}</div>
    <div className="grid gap-2" aria-label="视频时长分辨率组合">{entries.map((entry,index)=><div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
      <input aria-label={`合法时长 ${index+1}`} className="min-w-0 rounded-lg border border-c-border bg-c-surface p-2" placeholder="4,8,12" value={entry.durations.join(",")} onChange={e=>patch({durationResolutionMap:entries.map((v,i)=>i===index?{...v,durations:e.target.value.split(/[,，]/).map(x=>Number(x.trim()))}:v)})}/>
      <input aria-label={`合法分辨率 ${index+1}`} className="min-w-0 rounded-lg border border-c-border bg-c-surface p-2" placeholder="720p,1080p" value={entry.resolutions.join(",")} onChange={e=>patch({durationResolutionMap:entries.map((v,i)=>i===index?{...v,resolutions:e.target.value.split(/[,，]/).map(x=>x.trim())}:v)})}/>
      <button type="button" aria-label={`删除视频规格 ${index+1}`} onClick={()=>patch({durationResolutionMap:entries.filter((_v,i)=>i!==index)})}>删除</button>
    </div>)}<button type="button" className="justify-self-start rounded-lg border border-c-border px-3 py-1.5 text-sm" onClick={()=>patch({durationResolutionMap:[...entries,{durations:[],resolutions:[]}]})}>添加时长与分辨率组合</button></div>
    <label className="grid gap-1 text-sm">视频比例<input aria-label="视频合法比例" className="rounded-lg border border-c-border bg-c-surface p-2" placeholder="16:9,9:16,1:1" value={value?.aspectRatios?.join(",")||""} onChange={e=>patch({aspectRatios:e.target.value?e.target.value.split(/[,，]/).map(x=>x.trim()):undefined})}/></label>
    <details><summary className="cursor-pointer text-sm">高级能力与参数</summary><textarea aria-label="视频高级能力 JSON" rows={10} className="mt-2 w-full rounded-lg border border-c-border bg-c-surface p-2 font-mono text-xs" value={advanced} onChange={e=>setAdvanced(e.target.value)}/>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<button type="button" className="mt-2 rounded-lg border border-c-border px-3 py-1.5 text-sm" onClick={()=>{try{const parsed=videoDefinitionSchema.parse(JSON.parse(advanced));setError("");onChange(parsed,profile);}catch(err){setError(err instanceof Error?err.message:"配置无效");}}}>应用高级参数</button></details>
    <button type="button" className="justify-self-start text-sm underline" onClick={()=>onChange(undefined,undefined)}>清除视频专属配置</button>
  </fieldset>;
}
