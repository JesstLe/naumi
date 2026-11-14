import {z} from 'zod';
import {compileVideoPrompt} from '../prompt';
import {videoDiagnostic,type VideoExecutionDraft,type VideoResult} from '../execution-contract';
const field=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/).refine(name=>!['__proto__','prototype','constructor'].includes(name));
const primitive=z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
type Json=z.infer<ReturnType<typeof z.json>>;
const fail=(category:Parameters<typeof videoDiagnostic>[0],code:string,field:string,reason:string,actionable:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic(category,code,field,reason,actionable)]});
export const shotsMapping=z.strictObject({wireField:field,promptField:field,durationField:field,indexField:field.optional(),durationType:z.enum(['number','string']).optional(),
  min:z.number().int().positive().optional(),max:z.number().int().positive().optional(),maxPromptChars:z.number().int().positive().optional(),minDurationSeconds:z.number().finite().positive().optional(),durationStep:z.number().finite().positive().optional(),constants:z.record(field,primitive).optional()});
export const elementsMapping=z.strictObject({wireField:field,nameField:field,descriptionField:field.optional(),min:z.number().int().positive().optional(),max:z.number().int().positive().optional(),
  media:z.array(z.strictObject({kinds:z.array(z.enum(['image','video','audio'])).min(1),wireField:field,min:z.number().int().nonnegative().optional(),max:z.number().int().positive().optional()})).min(1)});

/** Exact published shot/element wire layout; no model-name or evidence veto. */
export function mapStructuredJson({draft,operation,effective,ordinaryInputs,consumed,put}:{draft:VideoExecutionDraft;operation:{shots?:z.infer<typeof shotsMapping>;elements?:z.infer<typeof elementsMapping>};effective:Record<string,Json>;ordinaryInputs:VideoExecutionDraft['inputs'];consumed:string[];put:(name:string,value:Json)=>boolean}):VideoResult<{shots:string[];elements:string[]}>{
  const structure=draft.structure,consumedStructure={shots:[] as string[],elements:[] as string[]};
  if(structure?.shots?.length){
    const rule=operation.shots!,shots=structure.shots;
    if(rule.min!==undefined&&shots.length<rule.min||rule.max!==undefined&&shots.length>rule.max)return fail('constraint','SHOT_COUNT_OUT_OF_RANGE','shots','镜头数量不符合协议约束','调整镜头数量');
    const total=shots.reduce((sum,shot)=>sum+shot.durationSeconds,0);
    if(typeof effective.durationSeconds!=='number'||Math.abs(total-effective.durationSeconds)>1e-6)return fail('constraint','SHOT_DURATION_TOTAL_MISMATCH','shots','镜头时长总和与有效输出时长不一致','调整镜头或输出时长');
    const values:Json[]=[];
    for(const [index,shot] of shots.entries()){
      if(rule.minDurationSeconds!==undefined&&shot.durationSeconds<rule.minDurationSeconds||rule.durationStep!==undefined&&Math.abs(shot.durationSeconds/rule.durationStep-Math.round(shot.durationSeconds/rule.durationStep))>1e-8)return fail('constraint','SHOT_DURATION_OUT_OF_RANGE','shots','镜头时长不符合协议最小值或步长','调整镜头时长');
      const linked=shot.promptInputId?draft.inputs.find(input=>input.id===shot.promptInputId):undefined;
      let text=linked?.value??shot.prompt;
      try{text=compileVideoPrompt(text,ordinaryInputs.map(input=>({...input,value:input.kind==='text'?input.value??'':input.nodeId}))).prompt;}
      catch{return fail('input','PROMPT_REFERENCE_INVALID','shots','镜头描述引用与当前素材不一致','重新插入镜头引用');}
      if(!text.trim())return fail('input','SHOT_PROMPT_REQUIRED','shots','镜头描述为空','填写镜头描述');
      if(rule.maxPromptChars!==undefined&&text.length>rule.maxPromptChars)return fail('constraint','SHOT_PROMPT_TOO_LONG','shots','镜头描述超过协议长度','缩短镜头描述');
      const row:Record<string,Json>={};
      const rowPut=(field:string,value:Json)=>{if(Object.hasOwn(row,field))return false;row[field]=value;return true;};
      if(!rowPut(rule.promptField,text)||!rowPut(rule.durationField,rule.durationType==='string'?String(shot.durationSeconds):shot.durationSeconds)||rule.indexField&&!rowPut(rule.indexField,index+1))return fail('mapping','WIRE_FIELD_COLLISION','shots','镜头内部字段冲突','修正镜头字段映射');
      values.push(row);consumedStructure.shots.push(shot.id);if(shot.promptInputId)consumed.push(shot.promptInputId);
    }
    if(!put(rule.wireField,values))return fail('mapping','WIRE_FIELD_COLLISION','shots','镜头字段与其他参数冲突','修正镜头字段映射');
    for(const [name,value] of Object.entries(rule.constants??{}))if(!put(name,value))return fail('mapping','WIRE_FIELD_COLLISION','shots','镜头开关与其他参数冲突','修正镜头开关映射');
  }
  if(structure?.elements?.length){
    const rule=operation.elements!,elements=structure.elements;
    if(rule.min!==undefined&&elements.length<rule.min||rule.max!==undefined&&elements.length>rule.max)return fail('constraint','ELEMENT_COUNT_OUT_OF_RANGE','elements','元素数量不符合协议约束','调整元素数量');
    const values:Json[]=[];
    for(const element of elements){
      const row:Record<string,Json>={},rowPut=(name:string,value:Json)=>{if(Object.hasOwn(row,name))return false;row[name]=value;return true;};
      if(!rowPut(rule.nameField,element.name)||element.description!==undefined&&(!rule.descriptionField||!rowPut(rule.descriptionField,element.description)))return fail('mapping','ELEMENT_FIELD_NOT_MAPPABLE','elements','元素描述或名称没有独立字段映射','补齐元素字段');
      for(const mapping of rule.media){
        const inputs=element.inputIds.map(id=>draft.inputs.find(input=>input.id===id)!); // facade/resolver validate identities first
        const selected=inputs.filter(input=>mapping.kinds.includes(input.kind as 'image'|'video'|'audio'));
        if(mapping.min!==undefined&&selected.length<mapping.min||mapping.max!==undefined&&selected.length>mapping.max)return fail('constraint','ELEMENT_MEDIA_COUNT_OUT_OF_RANGE','elements','元素素材数量不符合协议约束','调整元素素材数量');
        if(!selected.length)continue;
        if(selected.some(input=>consumed.includes(input.id)))return fail('mapping','DUPLICATE_MEDIA_MAPPING','elements','元素素材被重复映射','修正元素类型映射');
        if(!rowPut(mapping.wireField,selected.map(input=>({$videoAsset:input.id}))))return fail('mapping','WIRE_FIELD_COLLISION','elements','元素素材字段冲突','修正元素字段映射');
        consumed.push(...selected.map(input=>input.id));
      }
      if(element.inputIds.some(id=>!consumed.includes(id)))return fail('mapping','INPUT_KIND_NOT_MAPPABLE','elements','元素素材类型缺少字段映射','配置对应媒体类型');
      values.push(row);consumedStructure.elements.push(element.id);
    }
    if(!put(rule.wireField,values))return fail('mapping','WIRE_FIELD_COLLISION','elements','元素字段与其他参数冲突','修正元素字段映射');
  }
  return {ok:true,value:consumedStructure};
}
