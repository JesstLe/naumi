import {createHash} from "node:crypto";
import {videoNodeConfigSchema} from "../canvas/video-node-schema";
import type {OrderedInput} from "../video/references";

export type ScriptShot={id:string;prompt:string;durationSeconds:number;originalText?:string;scriptStart?:number;scriptEnd?:number;scriptInput?:OrderedInput;textNodeId?:string;scriptX?:number;config?:any;inputs?:OrderedInput[];title?:string;dependsOn?:string[]};
type Source={node_id:string;start?:number;end?:number};
type Dependencies={projectKey:string;promptAssets?:boolean;mainPrompt?:string;read:(path:string)=>Promise<any>;save:(body:unknown)=>Promise<any>;operationId:(kind:string)=>string};
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
const splitsCharacter=(text:string,i:number)=>i>0&&i<text.length&&/[\uD800-\uDBFF]/.test(text[i-1])&&/[\uDC00-\uDFFF]/.test(text[i]);
export function storyboardMainPrompt(shots:readonly {prompt:string;durationSeconds:number}[]){
  let offset=0;return shots.map((shot,i)=>{const start=offset;offset+=shot.durationSeconds;return `镜头${i+1}（${start}–${offset}秒）：\n${shot.prompt}`;}).join("\n\n");
}

/** Verify complete contiguous original coverage before creating any fragment asset. */
export async function prepareScriptShotAssets(source:Source|undefined,shots:ScriptShot[],shared:OrderedInput[],deps:Dependencies){
  if(!source){if(shots.some(s=>s.originalText!==undefined||s.scriptStart!==undefined||s.scriptEnd!==undefined))throw new Error("原文片段需要指定正式剧本来源");return [];}
  const original=(await deps.read(`/api/video/texts?id=${encodeURIComponent(source.node_id)}&projectKey=${encodeURIComponent(deps.projectKey)}`)).node;
  if(!original||original.status!=="completed")throw new Error("剧本来源尚未完成");
  if(shared.some(input=>input.kind==="text"&&input.nodeId.replace(/^text:/,"")===source.node_id))throw new Error("各片段只引用自身原文，不能把整份剧本作为共享输入");
  const text=String(original.content),start=source.start??0,end=source.end??text.length;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||start>=end||end>text.length)throw new Error("原稿制作范围无效");
  let next=start;
  const prepared=shots.map((shot,index)=>{
    if(shot.originalText!==undefined){
      const inferredEnd=next+shot.originalText.length;
      if(!shot.originalText.length||text.slice(next,inferredEnd)!==shot.originalText||shot.scriptStart!==undefined&&shot.scriptStart!==next||shot.scriptEnd!==undefined&&shot.scriptEnd!==inferredEnd)throw new Error("片段原文必须逐字连续匹配实际原稿，不能改写或遗漏");
      shot.scriptStart=next;shot.scriptEnd=inferredEnd;
    }
    if(shot.scriptStart!==next||!Number.isInteger(shot.scriptEnd)||shot.scriptEnd!<=next||shot.scriptEnd!>end||splitsCharacter(text,next)||splitsCharacter(text,shot.scriptEnd!))throw new Error("原文片段必须按顺序连续覆盖制作范围，不能遗漏、重叠或截断字符");
    const content=text.slice(next,shot.scriptEnd);next=shot.scriptEnd!;
    const prompt=`${shot.prompt}\n\n[原文开始]\n${content}\n[原文结束]`;
    videoNodeConfigSchema.parse({prompt});
    return {shot,index,content,prompt};
  });
  if(next!==end)throw new Error("分镜尚未覆盖全部要求制作的原文");
  if(deps.promptAssets)videoNodeConfigSchema.parse({prompt:deps.mainPrompt?.trim()?deps.mainPrompt:storyboardMainPrompt(prepared.map(({shot,prompt})=>({prompt,durationSeconds:shot.durationSeconds})))});
  const authors:OrderedInput[]=[];
  for(const {shot,index,prompt} of prepared){
    const saved=await deps.save({operationId:deps.operationId(`video-script-shot:${shot.id}`),projectKey:deps.projectKey,title:`原文片段 ${index+1}`,sourceNodeId:source.node_id,start:shot.scriptStart,end:shot.scriptEnd,expectedSourceSha256:hash(text)});
    const input:OrderedInput={id:`script-${shot.id}`,nodeId:saved.node.id,kind:"text",role:"author",value:saved.node.content};
    shot.prompt=prompt;shot.textNodeId=saved.node.id;shot.scriptInput=input;shot.scriptX=saved.node.x+saved.node.width+96;authors.push(input);
    if(deps.promptAssets){
      const body=await deps.save({operationId:deps.operationId(`video-script-shot-prompt:${shot.id}`),projectKey:deps.projectKey,title:`镜头正文 ${index+1}`,content:prompt,referenceNodeId:saved.node.id,expectedSourceSha256:hash(saved.node.content)});
      shot.textNodeId=body.node.id;shot.scriptX=body.node.x+body.node.width+96;
    }
  }
  return authors;
}
