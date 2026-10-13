"use client";
import {browserRandomUUID} from "@/lib/browser-crypto";
import type {VideoNodeConfig,VideoInputChoice} from "@/lib/video/client-settings";
import {VideoField,videoFieldClass,videoButtonClass} from "./form-controls";
export function ShotEditor({shots=[],duration,maxShots,choices,onChange}:{shots:NonNullable<VideoNodeConfig["shots"]>;duration?:number;maxShots?:number|null;choices:VideoInputChoice[];onChange:(shots:NonNullable<VideoNodeConfig["shots"]>)=>void}){
  const total=shots.reduce((sum,shot)=>sum+shot.durationSeconds,0);
  return <div className="space-y-3" data-testid="video-shot-editor">
    {shots.map((shot,index)=><div key={shot.id||index} className="space-y-2 rounded-lg border border-current/10 p-3"><div className="flex items-center justify-between text-xs"><span>镜头 {index+1}</span><button type="button" className={videoButtonClass} onClick={()=>onChange(shots.filter((_,i)=>i!==index))}>移除</button></div>
      <select aria-label={`镜头${index+1}文字来源`} value={shot.textNodeId||""} className={videoFieldClass} onChange={event=>{const choice=choices.find(item=>item.nodeId===event.target.value);onChange(shots.map((item,i)=>i===index?{...item,textNodeId:choice?.nodeId,prompt:choice?.value||item.prompt}:item));}}><option value="">直接编辑描述</option>{choices.filter(choice=>choice.kind==="text").map(choice=><option key={choice.id} value={choice.nodeId}>{choice.title}</option>)}</select>
      <textarea aria-label={`镜头${index+1}描述`} rows={3} className={videoFieldClass} value={shot.prompt} onChange={event=>onChange(shots.map((item,i)=>i===index?{...item,prompt:event.target.value,textNodeId:undefined}:item))}/>
      <VideoField label={`镜头${index+1}时长`}><input aria-label={`镜头${index+1}时长`} className={videoFieldClass} type="number" min={0.001} max={3600} step="any" value={shot.durationSeconds} onChange={event=>onChange(shots.map((item,i)=>i===index?{...item,durationSeconds:Number(event.target.value)}:item))}/></VideoField>
      <div className="flex gap-2"><button type="button" className={videoButtonClass} disabled={index===0} onClick={()=>{const next=[...shots];[next[index-1],next[index]]=[next[index],next[index-1]];onChange(next);}}>上移</button><button type="button" className={videoButtonClass} disabled={index===shots.length-1} onClick={()=>{const next=[...shots];[next[index+1],next[index]]=[next[index],next[index+1]];onChange(next);}}>下移</button></div>
    </div>)}
    <div className="flex items-center justify-between gap-3"><button type="button" className={videoButtonClass} disabled={maxShots==null||shots.length>=maxShots} onClick={()=>onChange([...shots,{id:browserRandomUUID(),prompt:"",durationSeconds:duration&&duration>total?duration-total:1}])}>添加镜头</button><span className={`text-xs ${duration!==total&&shots.length?"text-amber-500":"opacity-60"}`} data-testid="video-shot-total">合计 {total} / {duration??"—"} 秒</span></div>
  </div>;
}
