import {z} from 'zod';
import {videoDiagnostic,type VideoResult} from '../execution-contract';
const field=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/).refine(name=>!['__proto__','prototype','constructor'].includes(name));
const primitive=z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
type Json=z.infer<ReturnType<typeof z.json>>;
const fail=(category:Parameters<typeof videoDiagnostic>[0],code:string,field:string,reason:string,actionable:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic(category,code,field,reason,actionable)]});
export const videoParameterSchema=z.strictObject({type:z.enum(['string','number','integer','boolean','json']),wireField:field.optional(),
  required:z.boolean().optional(),default:z.json().optional(),values:z.array(primitive).optional(),
  minimum:z.number().finite().optional(),maximum:z.number().finite().optional(),
  // User-facing choice -> effective semantic value, then protocol spelling.
  // Keep these two boundaries distinct; do not feed wire values back as input.
  mapping:z.record(z.string(),primitive).optional(),wireMapping:z.record(z.string(),primitive).optional(),send:z.enum(['value','omit','semantic']).optional(),
});

/** One requested -> effective -> wire mapping shared by JSON and DAG Profiles. */
export function mapVideoParameters(requested:Record<string,Json>,parameters:Record<string,z.infer<typeof videoParameterSchema>>):VideoResult<{effective:Record<string,Json>;wire:Record<string,Json>}>{
  const effective:Record<string,Json>={},wire:Record<string,Json>={};
  for(const name of Object.keys(requested))if(!Object.hasOwn(parameters,name))return fail('mapping','PARAMETER_MAPPING_MISSING',name,'此参数没有对应的请求映射','配置字段映射或明确移除此参数');
  for(const [name,rule] of Object.entries(parameters)){
    if(rule.send==='omit')continue;
    const supplied=Object.hasOwn(requested,name),value=supplied?requested[name]:rule.default;
    if(value===undefined){if(rule.required)return fail('input','PARAMETER_REQUIRED',name,'缺少此操作需要的参数','填写参数');continue;}
    const typed=rule.type==='json'||rule.type==='integer'?rule.type==='json'||typeof value==='number'&&Number.isInteger(value):typeof value===rule.type;
    if(!typed||rule.values&&!rule.values.some(item=>item===value)||typeof value==='number'&&(rule.minimum!==undefined&&value<rule.minimum||rule.maximum!==undefined&&value>rule.maximum))
      return fail('constraint','PARAMETER_VALUE_INVALID',name,'参数类型或数值不符合协议约束','选择协议允许的参数值');
    const semantic=rule.mapping?Object.hasOwn(rule.mapping,String(value))?rule.mapping[String(value)]:undefined:value;
    if(semantic===undefined)return fail('mapping','PARAMETER_VALUE_NOT_MAPPABLE',name,'此参数值没有有效参数映射','补齐映射或选择其他参数值');
    effective[name]=semantic;
    if(rule.send==='semantic')continue;
    const mapped=rule.wireMapping?Object.hasOwn(rule.wireMapping,String(semantic))?rule.wireMapping[String(semantic)]:undefined:semantic;
    if(mapped===undefined)return fail('mapping','PARAMETER_VALUE_NOT_MAPPABLE',name,'有效参数值没有上游字段映射','补齐协议字段映射');
    wire[name]=mapped;
  }
  return {ok:true,value:{effective,wire}};
}
