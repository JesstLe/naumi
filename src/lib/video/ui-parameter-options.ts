import type {VideoUiParameter} from './ui-contract';

// Only declared choices are buttons. Unknown domains stay editable rather
// than masquerading as confirmed supplier capabilities.
export function videoEditorChoices(name:string,rule:VideoUiParameter,value:unknown):Array<string|number|boolean|null>|undefined {
  if(rule.values)return rule.values;
  if(rule.type==='boolean')return [true,false];
  return undefined;
}

export function videoEditorDurations(rule:VideoUiParameter,value:unknown){
  const declared=rule.values?.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
  const selected=typeof value==='number'&&Number.isFinite(value)&&value>0?value:undefined;
  const fallback=typeof rule.default==='number'&&rule.default>0?rule.default:undefined;
  const min=rule.minimum??0,max=rule.maximum??min;
  const step=rule.type==='integer'?1:0.1;
  return {seconds:declared?.length?[...new Set(declared)]:undefined,min,max,step,
    selected:selected??fallback??min,automatic:rule.values?.includes(-1)===true,
    bounded:Boolean(declared?.length)||(rule.minimum!==undefined&&rule.maximum!==undefined)};
}
