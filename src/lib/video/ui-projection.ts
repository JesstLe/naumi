import 'server-only';
import {bindPublishedVideoExecution,type FrozenVideoExecution} from './published-execution';
import {jsonVideoRecipeSchema} from './profiles/json-profile';
import type {VideoUiContract,VideoUiParameter} from './ui-contract';
import {ModelConfigError} from '../model-config/types';

/** Projection consumes the exact Profile description used by compile. Never
 * reconstruct UI modes/limits from old manual/vendor/test declarations. */
export function projectVideoUiContract(frozen:FrozenVideoExecution,identity:{publicModelId:string;wireModel:string;connectionId:string}):VideoUiContract {
  const {binding,policy,profile}=bindPublishedVideoExecution(frozen,identity),described=profile.describe(binding);
  if(!described.ok)throw new ModelConfigError(described.diagnostics[0].code,described.diagnostics[0].reason,422);
  const recipe=jsonVideoRecipeSchema.parse(described.value.description);
  return {version:1,modelVersion:frozen.modelVersion,modelDigest:frozen.modelDigest,policyRevision:policy.revision,defaults:recipe.defaults,
    operations:recipe.operations.map(operation=>({intent:operation.intent,parameters:Object.fromEntries(Object.entries({...recipe.parameters,...operation.parameters}).flatMap(([name,rule])=>{
      if(rule.send==='omit')return [];
      const values=rule.values??(rule.mapping?Object.keys(rule.mapping).flatMap<string|number|boolean>(value=>{
        if(rule.type==='integer'||rule.type==='number'){const number=Number(value);return value.trim()&&Number.isFinite(number)&&(rule.type!=='integer'||Number.isInteger(number))?[number]:[];}
        if(rule.type==='boolean')return value==='true'?[true]:value==='false'?[false]:[];
        return [value];
      }):undefined);
      const parameter:VideoUiParameter={type:rule.type,...(rule.required!==undefined?{required:rule.required}:{}),...(rule.default!==undefined?{default:rule.default}:{}),
        ...(values?{values}:{}),...(rule.minimum!==undefined?{minimum:rule.minimum}:{}),...(rule.maximum!==undefined?{maximum:rule.maximum}:{})};
      return [[name,parameter]];
    }))}))};
}
