import 'server-only';
import {createHash} from 'node:crypto';
import {extractWorkflowInputs,type ApiWorkflow} from '../comfyui/workflow';
import {videoModelBindingSchema,emptyVideoExecutionPolicy} from './execution-contract';
import {workflowVideoRecipeSchema,createWorkflowVideoProfile,type WorkflowVideoRecipe} from './profiles/workflow-profile';
import {canonicalConfig} from '../model-config/snapshot-value';
import {encryptAtRest,decryptAtRest} from '../settings';
import type {FrozenByocRecipe} from './byoc-recipe';
import type {CreateVideoInput} from './submission-types';
import type {VideoByocOverrides} from './byoc-settings';
/** Trusted binding assembly from the owned, frozen workflow recipe, not a
 * user-supplied compiled plan or inferred model capability. */
export function bindByocWorkflowRecipe(recipe:FrozenByocRecipe,input:VideoByocOverrides&{workflowRevision?:number}){
 const manifest=structuredClone(recipe.manifest),slots=extractWorkflowInputs(manifest.template as ApiWorkflow);
 const positives=slots.texts.filter(slot=>slot.role==='positive'),targets=positives.length?positives:slots.texts.length===1?slots.texts:[];
 // Existing saved text overrides are intentional and never overwritten by the
 // global prompt. An unmapped non-empty prompt is diagnosed by the Profile.
 if(!manifest.inputs.some(slot=>slot.type==='prompt'))for(const slot of targets)if(!Object.hasOwn(input.texts??{},slot.nodeId))manifest.inputs.push({name:`prompt-${slot.nodeId}`,type:'prompt',path:[slot.nodeId,'inputs','text']});
 const upload={delivery:'upload' as const,path:'/upload/image',fileField:'image',namePath:['name'],subfolderPath:['subfolder'],form:{overwrite:'true'}};
 const parameters:WorkflowVideoRecipe["parameters"]={durationSeconds:{type:'number',default:-1,send:'value'},resolution:{type:'string',default:'workflow',send:'value'}};
 const types:Record<string,'string'|'number'|'boolean'>={negativePrompt:'string',duration:'number',resolution:'string',aspectRatio:'string',generateAudio:'boolean',watermark:'boolean'};
 for(const slot of manifest.inputs){const name=slot.type==='duration'?'durationSeconds':slot.type;
  if(types[slot.type])parameters[name]={...parameters[name],type:types[slot.type],send:'value'};
  if(slot.type==='custom')parameters[slot.name]={type:'json',send:'value'};
 }
 const profile=createWorkflowVideoProfile(),binding=videoModelBindingSchema.parse({publicModelId:recipe.workflowId,wireModel:recipe.workflowId,connectionId:recipe.config.id,revision:input.workflowRevision??0,profileId:profile.profileId,profileVersion:profile.version,
  recipe:workflowVideoRecipeSchema.parse({manifest,parameters,media:{image:upload,video:upload,audio:upload}})});
 const frozen=JSON.parse(decryptAtRest(recipe.snapshot)!);
 return {binding,profile,policy:emptyVideoExecutionPolicy(),snapshot:encryptAtRest(JSON.stringify({...frozen,executionBinding:binding})),digest:createHash('sha256').update(canonicalConfig(binding)).digest('hex')};
}
export function byocVideoSubmissionInput(input:{prompt?:string;parameters?:CreateVideoInput['parameters'];durationSeconds?:number;resolution?:string;negativePrompt?:string;aspectRatio?:string;generateAudio?:boolean;watermark?:boolean;artworkId?:string;imageUrl?:string;references?:CreateVideoInput['references'];orderedInputs?:CreateVideoInput['orderedInputs'];source?:CreateVideoInput['source'];projectKey?:string;nodeId?:string;expectedRevision?:number;workflowId:string;idempotencyKey:string}):CreateVideoInput{
 const references=[...(input.references??[])];
 if(input.artworkId)references.unshift({id:input.artworkId,kind:'image',role:'reference',artworkId:input.artworkId});else if(input.imageUrl)references.unshift({id:'byoc-image',kind:'image',role:'reference',url:input.imageUrl});
 return {source:input.nodeId?'canvas':input.source??'workflow',sourceId:input.nodeId??input.workflowId,nodeId:input.nodeId,nodeRevision:input.expectedRevision,projectKey:input.projectKey,modelId:input.workflowId,prompt:input.prompt??'',seconds:'',size:'',
  parameters:input.parameters,durationSeconds:input.durationSeconds,resolution:input.resolution,negativePrompt:input.negativePrompt,aspectRatio:input.aspectRatio,generateAudio:input.generateAudio,watermark:input.watermark,references,orderedInputs:input.orderedInputs,idempotencyKey:input.idempotencyKey};
}
