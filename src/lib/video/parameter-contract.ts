import {z} from 'zod';
import {videoParameterSchema} from './profiles/parameters';
import type {VideoExecutionIntent} from './execution-contract';

const field=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const primitive=z.union([z.string().max(1000),z.number().finite(),z.boolean(),z.null()]);
export const videoParameterWhenSchema=z.strictObject({
  intents:z.array(z.string().min(1).max(100)).min(1).max(20).optional(),
  inputs:z.array(z.strictObject({kind:z.enum(['image','video','audio']),role:z.string().max(100).optional(),minimum:z.number().int().nonnegative().optional(),maximum:z.number().int().nonnegative().optional()})).max(20).optional(),
  parameters:z.record(field,z.array(primitive).min(1).max(100)).optional(),
});
export const videoParameterConditionSchema=z.strictObject({
  when:videoParameterWhenSchema,parameters:z.record(field,videoParameterSchema),
});
const sourceRule=videoParameterSchema.pick({type:true,values:true,minimum:true,maximum:true}).extend({send:z.literal('omit').optional()});
export const videoParameterContractSchema=z.strictObject({
  version:z.literal(1),parameters:z.record(field,sourceRule),
  providerOrigin:z.url().optional(),
  providerEndpoint:z.url().refine(value=>{const u=new URL(value);return !u.username&&!u.password&&!u.search&&!u.hash;}).optional(),
  conditions:z.array(z.strictObject({when:videoParameterWhenSchema,parameters:z.record(field,sourceRule)})).max(200).optional(),
  conflicts:z.array(z.strictObject({fields:z.array(field).min(1),reason:z.string().min(1).max(2000)})).max(100).optional(),
}).superRefine((v,ctx)=>{
  for(const rule of [v.parameters,...(v.conditions??[]).map(c=>c.parameters)])for(const [name,p]of Object.entries(rule)){
    if(p.minimum!==undefined&&p.maximum!==undefined&&p.minimum>p.maximum)ctx.addIssue({code:'custom',path:['parameters',name],message:'参数上下限冲突'});
    if(p.values?.some(value=>p.type==='json'?false:p.type==='integer'?typeof value!=='number'||!Number.isInteger(value):typeof value!==(p.type==='number'?'number':p.type)))ctx.addIssue({code:'custom',path:['parameters',name],message:'参数枚举与声明类型不一致'});
  }
});
export type VideoParameterContract=z.infer<typeof videoParameterContractSchema>;
export type VideoParameterCondition=z.infer<typeof videoParameterConditionSchema>;
export type VideoParameterRule=z.infer<typeof videoParameterSchema>;
export type VideoParameterContext={intent?:VideoExecutionIntent;inputs:readonly {kind:string;role?:string}[];parameters:Record<string,unknown>};

/** Same selector for compiler and editor. It reads declared input roles only;
 * it neither reclassifies intent nor guesses model capabilities. */
export function videoParameterConditionMatches(when:VideoParameterCondition['when'],context:VideoParameterContext):boolean{
  if(when.intents&&(!context.intent||!when.intents.includes(context.intent)))return false;
  if(when.inputs?.some(rule=>{
    const count=context.inputs.filter(i=>i.kind===rule.kind&&(!rule.role||i.role===rule.role)).length;
    return rule.minimum!==undefined&&count<rule.minimum||rule.maximum!==undefined&&count>rule.maximum;
  }))return false;
  return !when.parameters||Object.entries(when.parameters).every(([name,values])=>values.some(value=>value===context.parameters[name]));
}

export function resolveVideoParameterRules<T extends {type?:string;default?:unknown;mapping?:Record<string,unknown>}>(base:Record<string,T>,conditions:readonly {when:VideoParameterCondition['when'];parameters:Record<string,Partial<T>>}[]|undefined,context:VideoParameterContext):Record<string,T>{
  const values:Record<string,unknown>={};
  for(const [name,rule]of Object.entries(base)){
    const value=Object.hasOwn(context.parameters,name)?context.parameters[name]:rule.default;
    values[name]=rule.mapping&&Object.hasOwn(rule.mapping,String(value))?rule.mapping[String(value)]:value;
  }
  // All predicates observe the same requested/effective base values. Rule order
  // does not feed translated values back into another mapping.
  const result={...base};
  for(const condition of conditions??[])if(videoParameterConditionMatches(condition.when,{...context,parameters:values}))
    for(const [name,patch]of Object.entries(condition.parameters))if(Object.hasOwn(result,name))result[name]={...result[name],...patch};
  return result;
}

/** A source fills missing parameter domains, never transport or admin choices.
 * Conflicts stay source diagnostics; missing evidence is not a support denial. */
export function inheritVideoParameterContract<T extends {parameters:Record<string,VideoParameterRule>;operations:Array<{intent:string;parameters?:Record<string,VideoParameterRule>}>;parameterConditions?:VideoParameterCondition[]}>(recipe:T,source:VideoParameterContract,onConflict?:(reason:string)=>void):T{
  const result=structuredClone(recipe),conflicts=new Set(source.conflicts?.flatMap(c=>c.fields));
  const protectedConditions=new Set(recipe.parameterConditions?.flatMap(c=>Object.keys(c.parameters)));
  const fits=(value:unknown,rule:VideoParameterRule)=>value===undefined||!(rule.values&&!rule.values.includes(value as never)||typeof value==='number'&&(rule.minimum!==undefined&&value<rule.minimum||rule.maximum!==undefined&&value>rule.maximum));
  const compatible=(target:VideoParameterRule,source:VideoParameterRule)=>target.type===source.type;
  const inheritable=new Set<string>();
  for(const [name,rule]of Object.entries(recipe.parameters))if(rule.send!=='omit'&&!rule.mapping&&!rule.wireMapping&&!rule.values&&rule.minimum===undefined&&rule.maximum===undefined&&!conflicts.has(name)&&!protectedConditions.has(name)&&(!source.parameters[name]||compatible(rule,source.parameters[name])&&fits(rule.default,source.parameters[name])))inheritable.add(name);
  const apply=(rules:Record<string,VideoParameterRule>,name:string,sourceRule:VideoParameterRule)=>{
    const rule=rules[name];if(!rule||!compatible(rule,sourceRule)||!inheritable.has(name)||rule.send==='omit'||rule.mapping||rule.wireMapping||rule.values||rule.minimum!==undefined||rule.maximum!==undefined)return;
    // Defaults are independent administrator data. Do not make a previously
    // published default invalid by silently imposing contradictory evidence.
    const value=rule.default;
    if(!fits(value,sourceRule))return;
    if(sourceRule.send==='omit'){rule.send='omit';return;}
    for(const key of ['values','minimum','maximum'] as const)if(sourceRule[key]!==undefined)Object.assign(rule,{[key]:structuredClone(sourceRule[key])});
  };
  for(const [name,rule]of Object.entries(source.parameters)){
    apply(result.parameters,name,rule);
    for(const op of result.operations)if(op.parameters?.[name])apply(op.parameters,name,rule);
  }
  const conditions=(source.conditions??[]).flatMap(condition=>recipe.operations.flatMap(op=>{
    if(condition.when.intents&&!condition.when.intents.includes(op.intent))return [];
    const parameters=Object.fromEntries(Object.entries(condition.parameters).filter(([name,patch])=>{
      if(!inheritable.has(name))return false;
      const rule={...recipe.parameters[name],...op.parameters?.[name]},override=op.parameters?.[name];
      return compatible(rule,patch)&&rule.send!=='omit'&&!rule.mapping&&!rule.wireMapping&&!(override&&(override.values||override.minimum!==undefined||override.maximum!==undefined))&&(patch.send==='omit'||fits(rule.default,patch));
    }));
    return Object.keys(parameters).length?[{when:{...condition.when,intents:[op.intent]},parameters}]:[];
  }));
  const grouped:VideoParameterCondition[]=[];let lastKey:string|undefined;
  for(const condition of conditions){
    const {intents,...when}=condition.when,key=JSON.stringify({when,parameters:condition.parameters}),previous=grouped.at(-1);
    // Only adjacent equivalent patches may coalesce. Global de-duplication
    // would reorder A -> B -> A and change the last-match-wins semantics.
    if(previous&&lastKey===key)previous.when.intents=[...new Set([...(previous.when.intents??[]),...(intents??[])])];
    else grouped.push(structuredClone(condition));
    lastKey=key;
  }
  if((result.parameterConditions?.length??0)+grouped.length>200){onConflict?.('供应商条件与人工条件合成超过200条契约预算，保留原执行配方');return structuredClone(recipe);}
  if(grouped.length)result.parameterConditions=[...(result.parameterConditions??[]),...grouped];
  return result;
}
