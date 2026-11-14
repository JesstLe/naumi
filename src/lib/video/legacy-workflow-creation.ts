import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {getPool} from '@/platform/db/pool';
import {decryptAtRest} from '../settings';
import {canonicalConfig} from '../model-config/snapshot-value';
import {ModelConfigError} from '../model-config/types';
import type {FrozenWorkflowStage} from './workflow-freeze';
import type {CreateVideoInput} from './submission-types';
type OwnedStage={actor:string;runId:string;nodeId:string};
const stages=new AsyncLocalStorage<OwnedStage>();
export const legacyWorkflowCreationActive=()=>!!stages.getStore();
export function assertLegacyWorkflowCreation(actor:string,input:CreateVideoInput){
 const stage=stages.getStore();
 if(!stage||stage.actor!==actor.toLowerCase()||input.source!=='workflow'||input.workflowRunId!==stage.runId||input.workflowNodeId!==stage.nodeId)
  throw new ModelConfigError('WORKFLOW_SNAPSHOT_UNAVAILABLE','历史制作链阶段身份不一致',503);
}
/** Grant compatibility only from the actual owned, encrypted pre-compiler
 * stage. Neither HTTP flags, current config nor caller-created objects suffice. */
export async function runOwnedLegacyWorkflowStage<T>(actor:string,stage:FrozenWorkflowStage|undefined,owned:Omit<OwnedStage,'actor'>|undefined,run:()=>Promise<T>):Promise<T>{
 const fail=():never=>{throw new ModelConfigError('WORKFLOW_SNAPSHOT_UNAVAILABLE','历史制作链冻结记录不可核对',503);};
 if(!owned||stage?.compiledVersion!==undefined||stage?.compiled!==undefined||stage?.bundle?.video?.video?.execution)return fail();
 const row=(await getPool().query('SELECT frozen_nodes_enc,plan,execution_version FROM app_video_workflow_runs WHERE id=$1 AND email=$2',[owned.runId,actor.toLowerCase()])).rows[0];
 if(row?.execution_version!==0)return fail();
 if(!row?.plan?.nodes?.some((node:{id:string})=>node.id===owned.nodeId))return fail();
 if(!stage){if(row.execution_version!==0||row.frozen_nodes_enc)return fail();return stages.run({actor:actor.toLowerCase(),...owned},run);}
 if(!row.frozen_nodes_enc)return fail();
 let saved:Record<string,FrozenWorkflowStage>;try{saved=JSON.parse(decryptAtRest(row.frozen_nodes_enc)||'null');}catch{return fail();}
 if(!saved?.[owned.nodeId]||canonicalConfig(saved[owned.nodeId])!==canonicalConfig(stage))return fail();
 return stages.run({actor:actor.toLowerCase(),...owned},run);
}
