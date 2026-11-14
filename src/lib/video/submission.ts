import 'server-only';
import {currentModelExecution} from '../model-config/context';
import {VideoContractError} from './contract';
import {createCompiledVideo} from './compiled-submission';
import {legacyWorkflowCreationActive} from './legacy-workflow-creation';
import type {VideoTaskRow} from './task-types';
import type {VideoGenerationRequest} from './types';
import type {CreateVideoInput} from './submission-types';
export {requireOwnedVideoText} from './owned-text';
import {videoCreationInputDigest} from './submission-identity';
export {videoCreationInputDigest} from './submission-identity';
/** New requests have one execution lane. Missing mapping is a configuration
 * diagnostic, never permission to re-enter capability-era normalization. */
export async function createValidatedVideo(email:string,input:CreateVideoInput,hooks:{submit:(email:string,task:VideoTaskRow,request:VideoGenerationRequest)=>Promise<void>;creationError:(email:string,task:VideoTaskRow,error:unknown)=>Promise<void>}):Promise<{taskId:string;cost:number}>{
 const execution=currentModelExecution('video');
 if(!execution?.frozen.video?.execution&&legacyWorkflowCreationActive())return (await import('./legacy-workflow-submission')).createLegacyWorkflowVideo(email,input,hooks);
 if(!execution?.frozen.video?.execution)throw new VideoContractError('VIDEO_EXECUTION_NOT_CONFIGURED','此通道尚未发布视频执行映射',['binding']);
 return createCompiledVideo(email,input,execution,hooks,videoCreationInputDigest(input));
}
