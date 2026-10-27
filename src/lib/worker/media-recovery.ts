import {randomUUID} from 'node:crypto';
import type {BackgroundScope} from '@/lib/release-runtime/background-activity';

type Lane = {state:'idle'|'running'|'draining'|'failed'; startedAt?:string; completedAt?:string; lastProcessed?:number; error?:string};
type Dependencies = {
  detach:(scope:BackgroundScope,key:string,admission:'claim',action:()=>Promise<void>)=>Promise<boolean>;
  mirrors:()=>Promise<number>; jobs:()=>Promise<number>;
};
/** Media publication has its own durable release activity, not the tick's HTTP
 * lifetime. Each lane is single-flight; a slow NAS never serializes generation
 * dispatch. Existing row/advisory locks still own cross-process idempotency. */
export function createMediaRecoveryScheduler(deps:Dependencies) {
  const lanes:{mirrors:Lane;jobs:Lane}={mirrors:{state:'idle'},jobs:{state:'idle'}};
  const busy=new Set<keyof typeof lanes>();
  async function start(name:keyof typeof lanes,scope:BackgroundScope) {
    if(busy.has(name))return;
    busy.add(name);lanes[name]={...lanes[name],state:'running',startedAt:new Date().toISOString(),error:undefined};
    try {
      const admitted=await deps.detach(scope,`recovery-dispatch:${name}:${randomUUID()}`,'claim',async()=>{
        try {const count=await deps[name]();lanes[name]={...lanes[name],state:'idle',lastProcessed:count,completedAt:new Date().toISOString()};}
        catch(error){
          const code=(error as {code?:unknown})?.code;
          lanes[name]={...lanes[name],state:'failed',completedAt:new Date().toISOString(),error:typeof code==='string'&&/^[A-Z0-9_]{2,64}$/.test(code)?code:'MEDIA_RECOVERY_FAILED'};
          throw error;
        }finally{busy.delete(name);}
      });
      if(!admitted){busy.delete(name);lanes[name]={...lanes[name],state:'draining'};}
    }catch(error){busy.delete(name);lanes[name]={...lanes[name],state:'failed',error:'MEDIA_REGISTRATION_FAILED'};throw error;}
  }
  const status=()=>({mirrors:{...lanes.mirrors},jobs:{...lanes.jobs}});
  const schedule=async()=>{await Promise.all([start('mirrors','media-mirror'),start('jobs','media-job')]);return status();};
  schedule.status=status;
  return schedule;
}

let scheduler:ReturnType<typeof createMediaRecoveryScheduler>|undefined;
export async function scheduleMediaRecovery() {
  if(!scheduler){
    const [{detachBackgroundActivity},{recoverMediaMirrors},{recoverMediaJobs}]=await Promise.all([
      import('@/lib/release-runtime/background-activity'),import('@/lib/media-assets'),import('@/lib/video/media-jobs')]);
    // Recheck after module loading: concurrent first ticks must share one lane set.
    scheduler ||= createMediaRecoveryScheduler({detach:detachBackgroundActivity,mirrors:recoverMediaMirrors,jobs:recoverMediaJobs});
  }
  return scheduler();
}
