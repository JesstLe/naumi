import 'server-only';
import {createHash} from 'node:crypto';
import {readManagedObject} from '../../object-storage/managed-read';
import {readBounded} from '../../supplier-cost/io';
import {modelEndpointFetch} from '../../model-config/transport';
import {currentModelExecution} from '../../model-config/context';
import {currentPrivateVideoContext} from './private-context';
import {videoWireEndpoint} from './wire-endpoint';
import {mediaExtension} from '../media-formats';
import type {VideoProviderRuntimeConfig} from './config';
import type {ResolvedVideoAsset} from '../execution-contract';
import type {WorkflowVideoRecipe} from '../profiles/workflow-profile';
/** Execution-only byte upload; no request compilation, model metadata or task
 * create. Hash-addressed filename prevents another queued operation overwriting
 * a different asset uploaded to the same endpoint under the same reference id. */
export async function uploadCompiledWorkflowAsset(config:VideoProviderRuntimeConfig,asset:ResolvedVideoAsset,delivery:NonNullable<WorkflowVideoRecipe['media']['image']>):Promise<string>{
 if(delivery.delivery!=='upload')throw Error('Workflow upload recipe required');
 const input=await readManagedObject(`/media/${asset.storageKey}`,250*1024*1024);
 if(input.bytes.byteLength!==asset.bytes||createHash('sha256').update(input.bytes).digest('hex')!==asset.sha256)throw Error('Frozen workflow bytes changed');
 const trustedOrigins=(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||'').split(/[\s,]+/).filter(Boolean);
 if(currentPrivateVideoContext()?.config.id===config.id&&(process.env.USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK==='true'||process.env.NODE_ENV!=='production'))trustedOrigins.push(new URL(config.baseUrl).origin);
 const scope=currentModelExecution('video'),transport=modelEndpointFetch(config.baseUrl,{trustedOrigins},scope?{...scope.connection,costDisabled:true}:undefined);
 const form=new FormData();for(const [key,value]of Object.entries(delivery.form))form.set(key,value==='$credential'?config.apiKey:value);
 const filename=`naumi-${asset.sha256}.${mediaExtension(asset.mimeType)}`;
 form.set(delivery.fileField,new Blob([Uint8Array.from(input.bytes)],{type:asset.mimeType}),filename);
 const headers:Record<string,string>={};if(config.apiKey)headers.authorization=`Bearer ${config.apiKey}`;
 const response=await transport(videoWireEndpoint(config,delivery.path),{method:'POST',headers,body:form,signal:AbortSignal.timeout(120000)});
 if(!response.ok){await response.body?.cancel();throw Error('Workflow upload HTTP '+response.status);}
 const data=JSON.parse(await readBounded(response,512*1024));
 const read=(path:string[])=>path.reduce((value,key)=>value&&typeof value==='object'&&Object.hasOwn(value,key)?value[key]:undefined,data);
 const name=read(delivery.namePath),subfolder=delivery.subfolderPath?read(delivery.subfolderPath):undefined;
 if(typeof name!=='string'||subfolder!==undefined&&typeof subfolder!=='string')throw Error('Workflow upload receipt missing');
 return subfolder?`${subfolder}/${name}`:name;
}
