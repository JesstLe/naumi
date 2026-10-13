"use client";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {CachedImage} from "@/components/cached-image";
import {ArrowDown,ArrowUp,X} from "lucide-react";
import type {OrderedInput} from "@/lib/video/references";
import {numberVideoInputs} from "@/lib/video/references";
import {VIDEO_ROLE_LABELS,VIDEO_KIND_LABELS,type VideoInputChoice} from "@/lib/video/client-settings";
import {VideoField,videoFieldClass,videoButtonClass} from "./form-controls";
export function ReferenceList({inputs,choices,onChange}:{inputs:OrderedInput[];choices:VideoInputChoice[];onChange:(next:OrderedInput[])=>void}){
  const numbered=numberVideoInputs(inputs).all;
  function move(index:number,offset:number){const next=[...inputs];[next[index],next[index+offset]]=[next[index+offset],next[index]];onChange(next);}
  return <div className="space-y-2" data-testid="video-reference-list">
    {numbered.map((input,index)=>{const choice=choices.find(item=>item.nodeId===input.nodeId),roles=input.kind==="text"?["context","author"]:input.kind==="image"?["reference","first_frame","last_frame","element"]:input.kind==="video"?["source_video","reference","element"]:["source_audio","reference","element"];
      return <div key={input.id} className="flex items-center gap-2 rounded-lg border border-current/10 p-2" data-testid="video-reference-row">
        <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-current/5">{choice?.thumbnail?<CachedImage src={choice.thumbnail} alt="" className="h-full w-full object-cover"/>:<span className="text-[10px]">{VIDEO_KIND_LABELS[input.kind]}</span>}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-xs" title={choice?.title||input.value}>{choice?.title||(input.kind==="text"?input.value:input.nodeId)}</p><p className="text-[10px] opacity-60">ref {input.index} · {VIDEO_KIND_LABELS[input.kind]}{input.kindIndex}{choice?.available===false?" · 尚未完成":""}</p>
          <select aria-label={`引用${input.index}角色`} data-testid="video-reference-role" className="mt-1 max-w-full bg-transparent text-[11px]" value={input.role} onChange={event=>onChange(inputs.map((item,i)=>i===index?{...item,role:event.target.value as OrderedInput["role"]}:item))}>{roles.map(role=><option key={role} value={role}>{VIDEO_ROLE_LABELS[role as OrderedInput["role"]]}</option>)}</select>
        </div>
        <div className="flex shrink-0 items-center gap-1"><button aria-label={`上移引用${input.index}`} title="上移" className={videoButtonClass} disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={12}/></button><button aria-label={`下移引用${input.index}`} title="下移" className={videoButtonClass} disabled={index===inputs.length-1} onClick={()=>move(index,1)}><ArrowDown size={12}/></button><button aria-label={`移除引用${input.index}`} title="移除" className={videoButtonClass} onClick={()=>onChange(inputs.filter((_,i)=>i!==index))}><X size={12}/></button></div>
      </div>;
    })}
    <VideoField label="添加引用"><select aria-label="添加视频引用" className={videoFieldClass} value="" onChange={event=>{const choice=choices.find(item=>item.id===event.target.value);if(choice)onChange([...inputs,{id:`ref-${browserRandomUUID()}`,nodeId:choice.nodeId,kind:choice.kind,role:choice.kind==="text"?"context":choice.kind==="video"?"source_video":choice.kind==="audio"?"source_audio":"reference",value:choice.value}]);}}><option value="">选择画布素材</option>{choices.filter(choice=>!inputs.some(input=>input.nodeId===choice.nodeId)).map(choice=><option key={choice.id} value={choice.id}>{VIDEO_KIND_LABELS[choice.kind]} · {choice.title}{choice.available?"":"（尚未完成）"}</option>)}</select></VideoField>
    <button type="button" className={videoButtonClass} onClick={()=>onChange([...inputs,{id:`ref-${browserRandomUUID()}`,nodeId:`inline:${browserRandomUUID()}`,kind:"text",role:"context",value:"参考文字"}])}>添加参考文字</button>
    {inputs.filter(input=>input.kind==="text"&&input.nodeId.startsWith("inline:")).map(input=><textarea key={input.id} aria-label="视频参考文字" className={videoFieldClass} value={input.value} rows={2} onChange={event=>onChange(inputs.map(item=>item.id===input.id?{...item,value:event.target.value}:item))}/>)}
  </div>;
}
