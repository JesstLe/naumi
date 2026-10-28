"use client";
import {useVideoI18n} from "./i18n";
import { browserRandomUUID } from "@/lib/browser-crypto";
import { CachedImage } from "@/components/cached-image";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { OrderedInput } from "@/lib/video/references";
import { numberVideoInputs } from "@/lib/video/references";
import { videoReferenceNames } from "@/lib/video/prompt-references";
import { VIDEO_ROLE_LABELS, VIDEO_KIND_LABELS, type VideoInputChoice } from "@/lib/video/client-settings";
import { VideoField, videoFieldClass, videoButtonClass } from "./form-controls";
export function ReferenceList({ inputs, choices, onChange }: {
    inputs: OrderedInput[];
    choices: VideoInputChoice[];
    onChange: (next: OrderedInput[],preserveRoles?:boolean) => void;
}) {
    const V = useVideoI18n();
    const numbered = numberVideoInputs(inputs).all, names = videoReferenceNames(inputs, choices);
    function move(index: number, offset: number) { const next = [...inputs]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange(next); }
    return <div className="space-y-2" data-testid="video-reference-list">
    {numbered.map((input, index) => {
            const choice = choices.find(item => item.nodeId === input.nodeId), character = input.nodeId.startsWith("character:"), roles = character ? ["context"] : input.kind === "text" ? ["context", "author"] : input.kind === "image" ? ["reference", "first_frame", "last_frame", "element"] : input.kind === "video" ? ["source_video", "reference", "element"] : ["source_audio", "reference", "element"];
            return <div key={input.id} className="flex items-center gap-2 rounded-lg border border-current/10 p-2" data-testid="video-reference-row">
        <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-current/5">{choice?.thumbnail ? <CachedImage src={choice.thumbnail} alt="" className="h-full w-full object-cover"/> : <span className="text-[10px]">{V(character ? "角色" : VIDEO_KIND_LABELS[input.kind])}</span>}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-xs" title={names.get(input.id)}>{names.get(input.id)}</p>{(choice?.available === false || character && !choice) && <p className="text-[10px] opacity-60">{V(character ? "素材已不可用" : "尚未完成")}</p>}
          {character ? <select aria-label={V(`引用${input.index}外观`)} className="mt-1 max-w-full bg-transparent text-[11px]" value={input.nodeId} onChange={event => { const next=choices.find(item=>item.nodeId===event.target.value);if(next)onChange(inputs.map((item,i)=>i===index?{...item,nodeId:next.nodeId,value:next.value}:item)); }}>{!choice&&<option value={input.nodeId} disabled>{V("素材已不可用")}</option>}{choices.filter(item=>item.category==="character"&&item.nodeId.split("#")[0]===input.nodeId.split("#")[0]).map(item=><option key={item.nodeId} value={item.nodeId} disabled={!item.available||inputs.some(other=>other.id!==input.id&&other.nodeId===item.nodeId)}>{item.title}</option>)}</select> : <select aria-label={V(`引用${input.index}角色`)} data-testid="video-reference-role" className="mt-1 max-w-full bg-transparent text-[11px]" value={input.role} onChange={event => onChange(inputs.map((item, i) => i === index ? { ...item, role: event.target.value as OrderedInput["role"] } : item),true)}>{roles.map(role => <option key={role} value={role}>{V(VIDEO_ROLE_LABELS[role as OrderedInput["role"]])}</option>)}</select>}
        </div>
        <div className="flex shrink-0 items-center gap-1"><button aria-label={V(`上移引用${input.index}`)} title={V("上移")} className={videoButtonClass} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={12}/></button><button aria-label={V(`下移引用${input.index}`)} title={V("下移")} className={videoButtonClass} disabled={index === inputs.length - 1} onClick={() => move(index, 1)}><ArrowDown size={12}/></button><button aria-label={V(`移除引用${input.index}`)} title={V("移除")} className={videoButtonClass} onClick={() => onChange(inputs.filter((_, i) => i !== index))}><X size={12}/></button></div>
      </div>;
        })}
    {inputs.some(input=>input.role==="first_frame")&&inputs.some(input=>input.role==="last_frame")&&<button type="button" className={videoButtonClass} onClick={()=>{const first=inputs.findIndex(input=>input.role==="first_frame"),last=inputs.findIndex(input=>input.role==="last_frame"),next=[...inputs];[next[first],next[last]]=[next[last],next[first]];onChange(next);}}>{V("交换首尾帧")}</button>}
    <VideoField label={V("添加引用")}><select aria-label={V("添加视频引用")} className={videoFieldClass} value="" onChange={event => { const choice = choices.find(item => item.id === event.target.value); if (choice)
        onChange([...inputs, { id: `ref-${browserRandomUUID()}`, nodeId: choice.nodeId, kind: choice.kind, role: choice.kind === "text" ? "context" : choice.kind === "video" ? "source_video" : choice.kind === "audio" ? "source_audio" : "reference", value: choice.value }]); }}><option value="">{V("\u9009\u62E9\u753B\u5E03\u7D20\u6750")}</option>{choices.filter(choice => !inputs.some(input => input.nodeId === choice.nodeId)).map(choice => <option key={choice.id} value={choice.id}>{V(choice.category === "character" ? "角色" : VIDEO_KIND_LABELS[choice.kind])} · {choice.title}{choice.available ? "" : V("（尚未完成）")}</option>)}</select></VideoField>
    <button type="button" className={videoButtonClass} onClick={() => onChange([...inputs, { id: `ref-${browserRandomUUID()}`, nodeId: `inline:${browserRandomUUID()}`, kind: "text", role: "context", value: "参考文字" }])}>{V("\u6DFB\u52A0\u53C2\u8003\u6587\u5B57")}</button>
    {inputs.filter(input => input.kind === "text" && input.nodeId.startsWith("inline:")).map(input => <textarea key={input.id} aria-label={V("视频参考文字")} className={videoFieldClass} value={input.value} rows={2} onChange={event => onChange(inputs.map(item => item.id === input.id ? { ...item, value: event.target.value } : item))}/>)}
  </div>;
}
