import type {VideoUiContract,VideoUiParameter} from './ui-contract';
import type {VideoNodeConfig,VideoCatalogModel} from './client-settings';
import type {OrderedInput} from './references';
import {deriveVideoIntent,readVideoIntentPreference} from './intent';
import {videoSubmissionDraftValue} from './submission-draft-value';
import {resolveVideoParameterRules} from './parameter-contract';

const common=new Set(['durationSeconds','resolution','aspectRatio','negativePrompt','width','height','generateAudio','watermark','providerOptions','camera']);
function completeUiInputs(config:VideoNodeConfig,inputs:readonly OrderedInput[]){
  try{return videoUiDraft(config,inputs).inputs;}catch{return [...inputs,...(config.elements??[]).flatMap(element=>element.references.map(ref=>({id:ref.id,kind:ref.kind,role:ref.role})))];}
}
export function videoUiPreference(config:VideoNodeConfig,inputs:readonly OrderedInput[]){
  return readVideoIntentPreference({intentPreference:config.intentPreference,legacyMode:config.mode,inputs:completeUiInputs(config,inputs)});
}
export function videoUiIntent(config:VideoNodeConfig,inputs:readonly OrderedInput[],contract:VideoUiContract){
  return deriveVideoIntent({intentPreference:config.intentPreference,legacyMode:config.mode,inputs:completeUiInputs(config,inputs)},contract.defaults);
}
/** Editor availability is a presentation of executable recipes, never an
 * execution verdict. Preserve editors for existing incompatible groups too. */
export function videoUiStructure(config:VideoNodeConfig,inputs:readonly OrderedInput[],contract:VideoUiContract){
  const intent=videoUiIntent(config,inputs,contract),active=intent.ok?contract.operations.find(operation=>operation.intent===intent.value)?.structure:undefined;
  return {shots:active?.shots??contract.operations.find(operation=>operation.structure?.shots)?.structure?.shots,
    elements:active?.elements??contract.operations.find(operation=>operation.structure?.elements)?.structure?.elements};
}
export function videoUiParameters(config:VideoNodeConfig,inputs:readonly OrderedInput[],contract:VideoUiContract):Record<string,VideoUiParameter>{
  if(contract.workflow)return contract.workflow.parameters;
  const intent=videoUiIntent(config,inputs,contract);
  if(intent.ok){const operation=contract.operations.find(op=>op.intent===intent.value);if(operation){
    // A malformed persisted draft must remain editable. Its structural error
    // belongs to the existing compile preview, not a React render exception.
    let draft;try{draft=videoUiDraft(config,inputs);}catch{return operation.parameters;}
    return resolveVideoParameterRules(operation.parameters,contract.parameterConditions,{intent:intent.value,inputs:draft.inputs,parameters:draft.parameters});
  }}
  // Ambiguous drafts still render shared controls. This is presentation only;
  // it does not invent an execution mode or reset the user's configuration.
  const first=contract.operations[0]?.parameters??{};
  return Object.fromEntries(Object.entries(first).filter(([key,value])=>contract.operations.every(op=>JSON.stringify(op.parameters[key])===JSON.stringify(value))));
}
export function videoUiValue(config:VideoNodeConfig,key:string):unknown {
  return Object.hasOwn(config.parameters??{},key)?config.parameters![key]:(config as Record<string,unknown>)[key];
}
export function setVideoUiValue(config:VideoNodeConfig,key:string,value:unknown):VideoNodeConfig{
  const next={...config,parameters:{...config.parameters}};
  // New drafts keep model parameters in the permissive JSON draft container,
  // not the old execution-shaped top-level fields. Invalid choices can still
  // be saved and corrected; explicit edits replace only this field's old source.
  if(common.has(key))delete (next as Record<string,unknown>)[key];
  if(value===undefined)delete next.parameters![key];else next.parameters![key]=value as never;
  return next;
}
export function selectVideoUiModel(config:VideoNodeConfig,model:VideoCatalogModel):VideoNodeConfig{
  return {...config,modelId:model.modelId,providerId:model.providerId};
}
export function videoUiCreationDefaults(model:VideoCatalogModel):VideoNodeConfig{
  let config:VideoNodeConfig={modelId:model.modelId,providerId:model.providerId,prompt:''};
  // An unmigrated channel retains only its explicit published defaults. These
  // initialize a NEW draft; no list/limit/capability veto or reconciliation runs.
  if(!model.execution){const cap=model.definition;
    return {...config,...(cap?.defaultDurationSeconds!=null?{durationSeconds:cap.defaultDurationSeconds}:{}),...(cap?.defaultResolution?{resolution:cap.defaultResolution}:{}),...(cap?.defaultAspectRatio?{aspectRatio:cap.defaultAspectRatio}:{})};}
  const params=videoUiParameters(config,[],model.execution);
  for(const [key,parameter]of Object.entries(params))if(parameter.default!==undefined)config=setVideoUiValue(config,key,parameter.default);
  return config;
}
export {videoByocDraft} from './byoc-draft';
export function videoUiDraft(config:VideoNodeConfig,inputs:readonly OrderedInput[]){
  return videoSubmissionDraftValue({...config,source:'workbench',prompt:config.prompt||'',seconds:String(config.durationSeconds??''),size:config.resolution||'',
    references:inputs.length?undefined:config.references,orderedInputs:inputs.length?[...inputs]:undefined});
}

/** Temporary ingress shape for a genuinely unmigrated channel. This preserves
 * its existing server API without reviving UI capability enforcement. Once all
 * bindings are migrated the server compatibility lane and this shape retire. */
export function selectVideoUiIntent(config:VideoNodeConfig,model:VideoCatalogModel,intent:import('./mode-selection').VideoCreationIntent|'auto'):VideoNodeConfig{
 const next=selectVideoUiModel(config,model);
 return model.execution?{...next,intentPreference:intent==='auto'?undefined:intent,mode:undefined}:{...next,intentPreference:undefined,mode:intent==='auto'?undefined:intent==='image_reference'||intent==='omni_reference'?'reference':intent};
}
