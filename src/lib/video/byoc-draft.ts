import {inputReference,type VideoNodeConfig} from './client-settings';
import type {OrderedInput} from './references';

/** One lossless BYOC ingress projection for preview, Workbench, Canvas and
 * Agent. It selects no model capability and does not discard structured input.
 * Legacy mode is not a workflow intent; explicit intentPreference is preserved
 * for the common compiler to diagnose instead of silently overriding it. */
export function videoByocDraft(config:VideoNodeConfig,inputs:readonly OrderedInput[]){
 return {workflowId:config.comfyWorkflowId!,prompt:config.prompt??'',parameters:config.parameters,
  intentPreference:config.intentPreference,shots:config.shots,elements:config.elements,camera:config.camera,
  width:config.width,height:config.height,providerOptions:config.providerOptions,
  durationSeconds:config.durationSeconds&&config.durationSeconds>0?config.durationSeconds:undefined,
  resolution:config.resolution,aspectRatio:config.aspectRatio,negativePrompt:config.negativePrompt,generateAudio:config.generateAudio,watermark:config.watermark,
  references:inputs.length?undefined:config.references,orderedInputs:inputs.length?[...inputs]:undefined,inputMappings:config.comfyInputs,...config.comfyOverrides};
}

/** Keep the original Workbench envelope ordering and reference projection:
 * its serialized bytes identify persisted local operation receipts. New input
 * semantics append only when provided; unchanged drafts retain their old key. */
export function videoByocWorkbenchDraft(config:VideoNodeConfig,inputs:readonly OrderedInput[]){
 const draft=videoByocDraft(config,inputs),references=inputs.length?inputs.flatMap(input=>{const ref=inputReference(input);return ref?[ref]:[];}):config.references;
 return {mediaType:'video' as const,workflowId:draft.workflowId,source:'workbench' as const,prompt:draft.prompt,parameters:draft.parameters,
  negativePrompt:draft.negativePrompt,resolution:draft.resolution,aspectRatio:draft.aspectRatio,generateAudio:draft.generateAudio,watermark:draft.watermark,
  durationSeconds:draft.durationSeconds,references,orderedInputs:draft.orderedInputs,inputMappings:draft.inputMappings,...config.comfyOverrides,
  intentPreference:draft.intentPreference,shots:draft.shots,elements:draft.elements,camera:draft.camera,width:draft.width,height:draft.height,providerOptions:draft.providerOptions};
}
