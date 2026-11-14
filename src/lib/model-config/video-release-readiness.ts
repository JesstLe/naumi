import 'server-only';
import {modelConfigurationEnabled} from './availability';
import {readPublishedModelSnapshot} from './published';
import {configuredVideoProviders} from '../video/providers/config';
import {videoExecutionReadiness,assertVideoExecutionReady} from './video-execution-readiness';
/** Published reads only. Readiness never bootstraps, migrates, changes a task,
 * opens credentials, or invokes an upstream endpoint. */
export async function videoReleaseReadiness(){
 if(await modelConfigurationEnabled())return videoExecutionReadiness(await readPublishedModelSnapshot());
 const providers=configuredVideoProviders();
 return {schemaVersion:1 as const,modelVersion:0,modelDigest:'',ready:providers.length===0,featureDisabled:false,models:providers.reduce((n,p)=>n+p.models.length,0),channels:providers.length,issues:providers.map(p=>({publicModelId:'',upstreamId:p.id,code:'VIDEO_MANAGED_BINDING_REQUIRED'}))};
}
export async function assertVideoReleaseReady(){assertVideoExecutionReady(await videoReleaseReadiness());}
