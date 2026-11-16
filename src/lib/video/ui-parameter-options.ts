import type {VideoUiParameter} from './ui-contract';

// Editor presets are suggestions, never an extra model-capability validator.
// Explicit contract values win. Existing/custom published values stay visible.
export function videoEditorChoices(name:string,rule:VideoUiParameter,value:unknown):Array<string|number|boolean|null>|undefined {
  if(rule.values)return rule.values;
  if(rule.type==='boolean')return [true,false];
  if(name!=='resolution'&&name!=='aspectRatio')return;
  const sample=typeof value==='string'?value:typeof rule.default==='string'?rule.default:'';
  const presets=name==='resolution'?['480p','720p','1080p'].map(v=>sample.endsWith('P')?v.toUpperCase():v)
    :['adaptive','1:1','2:3','3:2','3:4','4:3','9:16','16:9'];
  return [...new Set([...presets,...(typeof rule.default==='string'?[rule.default]:[]),...(typeof value==='string'?[value]:[])])];
}

export function videoEditorDurations(rule:VideoUiParameter,value:unknown){
  const declared=rule.values?.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
  const selected=typeof value==='number'&&Number.isFinite(value)&&value>0?value:undefined;
  const fallback=typeof rule.default==='number'&&rule.default>0?rule.default:undefined;
  const min=rule.minimum!==undefined?Math.max(0.1,rule.minimum):1;
  // A presentation window, not an invented provider maximum. Preserve larger
  // historical values; the compiler still owns real protocol constraints.
  const max=rule.maximum??Math.max(15,selected??0,fallback??0,min);
  const step=rule.type==='integer'?1:0.1;
  return {seconds:declared?.length?[...new Set(declared)]:undefined,min,max,step,
    selected:selected??fallback??min,automatic:rule.values?.includes(-1)===true};
}
