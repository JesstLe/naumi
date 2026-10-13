"use client";
import {useId} from "react";
import {compileVideoCamera,type VideoCamera} from "@/lib/video/camera";
import {CAMERA_PROFILES,LENS_PROFILES,FOCAL_LENGTHS,APERTURES} from "@/lib/video/camera-presets";
import {VideoField,videoFieldClass,videoButtonClass} from "./form-controls";
const fields=[['camera','摄影机'],['lens','镜头'],['focalLength','焦距'],['aperture','光圈'],['movement','运镜']] as const;
const presets={camera:CAMERA_PROFILES.map(item=>({value:item.label,label:item.zhName})),lens:LENS_PROFILES.map(item=>({value:item.label,label:item.zhName})),focalLength:FOCAL_LENGTHS.map(value=>({value:`${value}mm`,label:""})),aperture:APERTURES.map(value=>({value:`f/${value}`,label:""})),movement:[]};
export function CameraSettings({camera,onChange}:{camera?:VideoCamera;onChange:(next?:VideoCamera)=>void}){
  const instanceId=useId();
  return <div className="space-y-3" data-testid="video-camera-settings"><label className="flex items-center gap-2 text-xs"><input aria-label="启用视频摄影设置" type="checkbox" checked={camera!==undefined} onChange={event=>onChange(event.target.checked?{}:undefined)}/>摄影设置</label>
    {camera!==undefined&&<><div className="grid grid-cols-2 gap-3">{fields.map(([key,label])=><VideoField key={key} label={label}><input aria-label={`视频${label}`} value={camera[key]||""} list={`${instanceId}-${key}`} className={videoFieldClass} onChange={event=>onChange({...camera,[key]:event.target.value||undefined})}/><datalist id={`${instanceId}-${key}`}>{presets[key].map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</datalist></VideoField>)}</div><p className="break-words text-[11px] opacity-60" data-testid="video-camera-prompt">{compileVideoCamera(camera)}</p><button type="button" className={videoButtonClass} disabled={!compileVideoCamera(camera)} onClick={()=>void navigator.clipboard.writeText(compileVideoCamera(camera))}>复制摄影参数</button></>}
  </div>;
}
