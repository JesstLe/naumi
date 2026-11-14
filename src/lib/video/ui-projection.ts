import {type NativeVideoDescription} from './profiles/native-profile';
import 'server-only';
import {bindPublishedVideoExecution,type FrozenVideoExecution} from './published-execution';
import {workflowVideoRecipeSchema} from './profiles/workflow-profile';
import {jsonVideoRecipeSchema} from './profiles/json-profile';
import type {z} from 'zod';
import type {videoParameterSchema} from './profiles/parameters';
import type {VideoUiContract,VideoUiParameter} from './ui-contract';
import {ModelConfigError} from '../model-config/types';

/** Projection consumes the exact Profile description used by compile. Never
 * reconstruct UI modes/limits from old manual/vendor/test declarations. */
export function projectVideoUiContract(frozen:FrozenVideoExecution,identity:{publicModelId:string;wireModel:string;connectionId:string}):VideoUiContract {
  const {binding,policy,profile}=bindPublishedVideoExecution(frozen,identity),described=profile.describe(binding);
  if(!described.ok)throw new ModelConfigError(described.diagnostics[0].code,described.diagnostics[0].reason,422);
  if(frozen.profileId==='workflow-video'){
    const recipe=workflowVideoRecipeSchema.parse(described.value.description);
    return {version:1,modelVersion:frozen.modelVersion,modelDigest:frozen.modelDigest,policyRevision:policy.revision,defaults:{},operations:[],workflow:{parameters:Object.fromEntries(Object.entries(recipe.parameters).filter(([,rule])=>rule.send!=='omit').map(([name,rule])=>[name,{type:rule.type,required:rule.required,default:rule.default,values:rule.values,minimum:rule.minimum,maximum:rule.maximum}])),slots:recipe.manifest.inputs.map(({name,type,required})=>({name,type,required}))}};
  }
  if(frozen.profileId==='native-video'){
    const recipe=described.value.description as NativeVideoDescription;
    return {version:1,modelVersion:frozen.modelVersion,modelDigest:frozen.modelDigest,policyRevision:policy.revision,defaults:recipe.defaults,
      operations:recipe.operations.map(operation=>({intent:operation.intent,...(operation.structure?{structure:operation.structure}:{}),parameters:projectParameters({...recipe.parameters,...operation.parameters})}))};
  }
  const recipe=jsonVideoRecipeSchema.parse(described.value.description);
  return {version:1,modelVersion:frozen.modelVersion,modelDigest:frozen.modelDigest,policyRevision:policy.revision,defaults:recipe.defaults,
    operations:recipe.operations.map(operation=>({intent:operation.intent,...(operation.shots||operation.elements?{structure:{
      ...(operation.shots?{shots:{min:operation.shots.min,max:operation.shots.max,maxPromptChars:operation.shots.maxPromptChars,minDurationSeconds:operation.shots.minDurationSeconds,durationStep:operation.shots.durationStep}}:{}),
      ...(operation.elements?{elements:{min:operation.elements.min,max:operation.elements.max,media:operation.elements.media.map(({kinds,min,max})=>({kinds,min,max}))}}:{})
    }}:{}),parameters:projectParameters({...recipe.parameters,...operation.parameters})}))};
}

function projectParameters(parameters:Record<string,z.infer<typeof videoParameterSchema>>):Record<string,VideoUiParameter>{
  return Object.fromEntries(Object.entries(parameters).flatMap(([name,rule])=>{
      if(rule.send==='omit')return [];
      const values=rule.values??(rule.mapping?Object.keys(rule.mapping).flatMap<string|number|boolean>(value=>{
        if(rule.type==='integer'||rule.type==='number'){const number=Number(value);return value.trim()&&Number.isFinite(number)&&(rule.type!=='integer'||Number.isInteger(number))?[number]:[];}
        if(rule.type==='boolean')return value==='true'?[true]:value==='false'?[false]:[];
        return [value];
      }):undefined);
      const parameter:VideoUiParameter={type:rule.type,...(rule.required!==undefined?{required:rule.required}:{}),...(rule.default!==undefined?{default:rule.default}:{}),
        ...(values?{values}:{}),...(rule.minimum!==undefined?{minimum:rule.minimum}:{}),...(rule.maximum!==undefined?{maximum:rule.maximum}:{})};
      return [[name,parameter]];
    }));
}
