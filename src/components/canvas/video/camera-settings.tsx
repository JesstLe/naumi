"use client";
import {compileVideoCamera,type VideoCamera} from "@/lib/video/camera";
import {VideoField,videoFieldClass,videoButtonClass} from "./form-controls";
const fields=[['camera','摄影机'],['lens','镜头'],['focalLength','焦距'],['aperture','光圈'],['movement','运镜']] as const;
export function CameraSettings({camera,onChange}:{camera?:VideoCamera;onChange:(next?:VideoCamera)=>void}){
  return <div className="space-y-3" data-testid="video-camera-settings"><label className="flex items-center gap-2 text-xs"><input aria-label="启用视频摄影设置" type="checkbox" checked={camera!==undefined} onChange={event=>onChange(event.target.checked?{}:undefined)}/>摄影设置</label>
    {camera!==undefined&&<><div className="grid grid-cols-2 gap-3">{fields.map(([key,label])=><VideoField key={key} label={label}><input aria-label={`视频${label}`} value={camera[key]||""} className={videoFieldClass} onChange={event=>onChange({...camera,[key]:event.target.value||undefined})}/></VideoField>)}</div><p className="break-words text-[11px] opacity-60" data-testid="video-camera-prompt">{compileVideoCamera(camera)}</p><button type="button" className={videoButtonClass} disabled={!compileVideoCamera(camera)} onClick={()=>void navigator.clipboard.writeText(compileVideoCamera(camera))}>复制摄影参数</button></>}
  </div>;
}
