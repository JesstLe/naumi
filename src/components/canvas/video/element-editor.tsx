"use client";
import {browserRandomUUID} from "@/lib/browser-crypto";
import type {VideoNodeConfig,VideoInputChoice} from "@/lib/video/client-settings";
import {VIDEO_KIND_LABELS} from "@/lib/video/client-settings";
import {VideoField,videoFieldClass,videoButtonClass} from "./form-controls";
export function ElementEditor({elements=[],choices,maxElements,maxReferences,onChange}:{elements:NonNullable<VideoNodeConfig["elements"]>;choices:VideoInputChoice[];maxElements?:number|null;maxReferences?:number|null;onChange:(next:NonNullable<VideoNodeConfig["elements"]>)=>void}){
  function patch(index:number,change:Partial<(typeof elements)[number]>){onChange(elements.map((element,i)=>i===index?{...element,...change}:element));}
  return <div className="space-y-3" data-testid="video-element-editor">{elements.map((element,index)=><div key={element.id||index} className="space-y-2 rounded-lg border border-current/10 p-3">
    <div className="flex items-center justify-between text-xs"><span>元素 {index+1}</span><button type="button" className={videoButtonClass} onClick={()=>onChange(elements.filter((_,i)=>i!==index))}>移除</button></div>
    <VideoField label={`元素${index+1}名称`}><input aria-label={`元素${index+1}名称`} className={videoFieldClass} value={element.name} onChange={event=>patch(index,{name:event.target.value})}/></VideoField>
    <textarea aria-label={`元素${index+1}描述`} className={videoFieldClass} rows={2} value={element.description||""} onChange={event=>patch(index,{description:event.target.value})}/>
    <div className="space-y-1">{element.references.map(ref=><div key={ref.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{VIDEO_KIND_LABELS[ref.kind]} · {choices.find(choice=>choice.nodeId===ref.artworkId)?.title||ref.artworkId}</span><button type="button" className={videoButtonClass} onClick={()=>patch(index,{references:element.references.filter(item=>item.id!==ref.id)})}>移除</button></div>)}</div>
    <select aria-label={`元素${index+1}添加素材`} className={videoFieldClass} value="" disabled={maxReferences==null||element.references.length>=maxReferences} onChange={event=>{const choice=choices.find(item=>item.id===event.target.value);if(choice&&choice.kind!=="text")patch(index,{references:[...element.references,{id:`element-ref-${browserRandomUUID()}`,kind:choice.kind,role:"element",artworkId:choice.nodeId.replace(/^(image|video|audio):/,""),url:choice.value}]});}}><option value="">添加元素素材</option>{choices.filter(choice=>choice.kind!=="text"&&choice.available&&!element.references.some(ref=>ref.artworkId===choice.nodeId)).map(choice=><option key={choice.id} value={choice.id}>{VIDEO_KIND_LABELS[choice.kind]} · {choice.title}</option>)}</select>
  </div>)}<button type="button" className={videoButtonClass} disabled={maxElements==null||elements.length>=maxElements} onClick={()=>onChange([...elements,{id:browserRandomUUID(),name:"",references:[]}])}>添加元素</button></div>;
}
