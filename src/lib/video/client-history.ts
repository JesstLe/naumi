import type {PublicVideoTaskSnapshot} from "./task-snapshot";
import {browserRandomUUID} from "../browser-crypto";
import type {VideoInputChoice,VideoNodeConfig} from "./client-settings";
import type {OrderedInput} from "./references";

/** Reuse the frozen user intent, including dialogue and the actual input artifacts. */
export function videoHistoryDraft(snapshot:PublicVideoTaskSnapshot):{config:VideoNodeConfig;inputs:OrderedInput[];choices:VideoInputChoice[]}{
  if(snapshot.unavailableFields.length)throw new Error(`原任务参数无法完整恢复：${snapshot.unavailableFields.join("、")}`);
  const config=structuredClone(snapshot.config),inputs=snapshot.inputs.map(input=>{
    if(input.kind==="text")return {...input,nodeId:`inline:history-${browserRandomUUID()}`};
    const ref=config.references?.find(reference=>reference.id===input.id);
    if(!ref?.artworkId)throw new Error("原任务引用缺少已拥有作品身份，无法完整复用");
    return {...input,nodeId:ref.artworkId,value:ref.url||input.value};
  });
  if(config.shots)config.shots=config.shots.map(({textNodeId:_text,...shot})=>shot);
  const choices:VideoInputChoice[]=inputs.map(input=>({id:input.nodeId,nodeId:input.nodeId,kind:input.kind,title:input.kind==="text"?"原任务文字":input.nodeId,value:input.value,available:true}));
  for(const ref of (config.elements||[]).flatMap(element=>element.references))if(ref.artworkId&&!choices.some(choice=>choice.nodeId===ref.artworkId))choices.push({id:ref.artworkId,nodeId:ref.artworkId,kind:ref.kind,title:ref.artworkId,value:ref.url||`/media/${ref.storageKey}`,available:true});
  return {config,inputs,choices};
}
