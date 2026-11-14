import 'server-only';
import {startAccountWork,endAccountWork} from '../release-runtime/account-work';
import {currentAcceptedParent,withAcceptedExecution} from '../release-runtime/accepted-context';
import {activeAcceptedParent} from '../release-runtime/store';
import {accountKey,releaseRuntimeEnabled,ReleaseRuntimeError} from '../release-runtime/identity';

/** Admission's local lifetime, not supplier success. Durable tasks/workflows
 * retain their own UNKNOWN. Register before preparation, serialized with drain;
 * existing server-attested work may finish its children. Replay comes first. */
export async function withNewVideoAdmission<T>(actor:string,run:()=>Promise<T>):Promise<T>{
 const parent=currentAcceptedParent();
 if(parent){
  if(releaseRuntimeEnabled()&&(parent.account!==accountKey(actor)||!await activeAcceptedParent(parent)))throw new ReleaseRuntimeError('VIDEO_ADMISSION_PARENT_UNAVAILABLE',409);
  return run();
 }
 const work=await startAccountWork(actor,'video-admission');
 try{return await withAcceptedExecution(work?.parent,run);}
 finally{await endAccountWork(work,true);}
}
