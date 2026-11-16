import {videoParameterContractSchema,type VideoParameterContract,type VideoParameterRule} from '../video/parameter-contract';

const semanticFields:Record<string,string>={resolution:'resolution',duration:'durationSeconds',durationSeconds:'durationSeconds',aspect_ratio:'aspectRatio',aspectRatio:'aspectRatio',size:'aspectRatio',audio:'generateAudio',generateAudio:'generateAudio',watermark:'watermark'};
/** Structured declarations only. A model list, prose, examples, price tiers and
 * a field named `mode` do not prove resolution values or input semantics. */
export function documentedVideoParameters(raw:unknown):VideoParameterContract|undefined{
  if(!raw||typeof raw!=='object')return;
  const row=raw as Record<string,any>;
  if(row.videoParameters!==undefined){const parsed=videoParameterContractSchema.safeParse(row.videoParameters);return parsed.success?parsed.data:undefined;}
  if(row.modality!=='video')return;
  const parameters:Record<string,VideoParameterRule>={};
  const declarations=Array.isArray(row.parameters)?row.parameters:row.requestSchema?.properties&&typeof row.requestSchema.properties==='object'
    ?Object.entries(row.requestSchema.properties).map(([path,value])=>({path,...(value as object),documentation:{values_confirmed:true}})):[];
  for(const item of declarations){
    if(!item||typeof item!=='object'||item.documentation?.values_confirmed!==true)continue;
    const name=item.semantic??item['x-naumi-semantic']??semanticFields[item.path];
    if(!Object.values(semanticFields).includes(name))continue;
    const type=item.type??(name==='durationSeconds'?'integer':name==='generateAudio'||name==='watermark'?'boolean':'string');
    if(!['string','integer','number','boolean'].includes(type))continue;
    const values=item.options??item.enum;
    const rule={type,...(Array.isArray(values)?{values}:{}),...(typeof item.minimum==='number'?{minimum:item.minimum}:{}),...(typeof item.maximum==='number'?{maximum:item.maximum}:{})};
    if(!('values'in rule)&&!('minimum'in rule)&&!('maximum'in rule))continue;
    if(parameters[name])return; // Conflicting aliases are not arbitrarily chosen.
    parameters[name]=rule as VideoParameterRule;
  }
  if(!Object.keys(parameters).length)return;
  const parsed=videoParameterContractSchema.safeParse({version:1,parameters});
  return parsed.success?parsed.data:undefined;
}

/** Adapter for the already-supported vendor definition format. Convert once
 * into the executable contract; no second runtime capability validator. */
export function videoDefinitionParameters(definition:{parameterContract?:VideoParameterContract;durationResolutionMap?:Array<{durations:number[];resolutions:string[]}>|null;aspectRatios?:string[]|null;modeParameters?:Record<string,{aspectRatios?:string[];durationResolutionMap?:Array<{durations:number[];resolutions:string[]}>}>|null;resolutionAspectRatios?:Record<string,string[]>|null}):VideoParameterContract|undefined{
  if(definition.parameterContract)return definition.parameterContract;
  const parameters:Record<string,VideoParameterRule>={},conditions:NonNullable<VideoParameterContract['conditions']>=[];
  const maps=definition.durationResolutionMap??[];
  if(maps.length){
    parameters.resolution={type:'string',values:[...new Set(maps.flatMap(m=>m.resolutions))]};
    parameters.durationSeconds={type:'integer',values:[...new Set(maps.flatMap(m=>m.durations))].sort((a,b)=>a-b)};
    for(const resolution of parameters.resolution.values as string[])conditions.push({when:{parameters:{resolution:[resolution]}},parameters:{durationSeconds:{type:'integer',values:[...new Set(maps.filter(m=>m.resolutions.includes(resolution)).flatMap(m=>m.durations))].sort((a,b)=>a-b)}}});
  }
  if(definition.aspectRatios?.length)parameters.aspectRatio={type:'string',values:definition.aspectRatios};
  for(const [intent,operation]of Object.entries(definition.modeParameters??{})){
    if(operation.aspectRatios?.length)conditions.push({when:{intents:[intent]},parameters:{aspectRatio:{type:'string',values:operation.aspectRatios}}});
    if(operation.durationResolutionMap?.length){
      const maps=operation.durationResolutionMap;
      conditions.push({when:{intents:[intent]},parameters:{resolution:{type:'string',values:[...new Set(maps.flatMap(m=>m.resolutions))]},durationSeconds:{type:'integer',values:[...new Set(maps.flatMap(m=>m.durations))].sort((a,b)=>a-b)}}});
      for(const resolution of [...new Set(maps.flatMap(m=>m.resolutions))])conditions.push({when:{intents:[intent],parameters:{resolution:[resolution]}},parameters:{durationSeconds:{type:'integer',values:[...new Set(maps.filter(m=>m.resolutions.includes(resolution)).flatMap(m=>m.durations))].sort((a,b)=>a-b)}}});
    }
  }
  for(const [resolution,values]of Object.entries(definition.resolutionAspectRatios??{}))conditions.push({when:{parameters:{resolution:[resolution]}},parameters:{aspectRatio:{type:'string',values}}});
  // A supplier may publish only operation-specific domains. Type-only base
  // slots let the shared selector apply those conditions without inventing a
  // global union of choices for operations with no declaration.
  for(const condition of conditions)for(const [name,rule]of Object.entries(condition.parameters))parameters[name]??={type:rule.type};
  if(!Object.keys(parameters).length)return;
  return videoParameterContractSchema.parse({version:1,parameters,...(conditions.length?{conditions}:{})});
}
