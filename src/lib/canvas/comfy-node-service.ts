import "server-only";
import {getPool} from "@/platform/db/pool";
import {ModelConfigError} from "../model-config/types";
import {bindActualCreationProject,assertCreationProjectInput} from "../saas/creation-access";
import {authorizeCanvasProject,mayCreateCanvasRoot} from "./project-access";
import {comfyNodeWriteSchema} from "./comfy-node-schema";
import {ensureComfyNodeSchema,findComfyOperation,getComfyNode,saveComfyNodeTx} from "./comfy-node-repository";
export {getComfyNode,listComfyNodes} from "./comfy-node-repository";
export async function saveComfyNode(actorRaw:string,raw:unknown){
 const actor=actorRaw.toLowerCase(),parsed=comfyNodeWriteSchema.safeParse(raw);
 if(!parsed.success)throw new ModelConfigError("INVALID_COMFY_DOCUMENT",parsed.error.issues[0]?.message||"工作流字段无效",422);
 const input=parsed.data;await ensureComfyNodeSchema();
 const old=await getComfyNode(actor,input.id,true),projectKey=input.projectKey||old?.projectKey||`tree:${input.id}`;
 const replay=await findComfyOperation(actor,input.operationId,{input,projectKey});if(replay){await assertCreationProjectInput(actor,projectKey,undefined,true);return replay;}
 let newRoot=false;
 try{await authorizeCanvasProject(actor,projectKey);}catch(error){if(!(error instanceof ModelConfigError)||old||input.expectedRevision!==0||!await mayCreateCanvasRoot(actor,input,projectKey))throw error;newRoot=true;}
 const tx=await getPool().connect();try{await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
 await bindActualCreationProject(actor,projectKey,{tx,newRoot});const node=await saveComfyNodeTx(tx,actor,input,projectKey);await tx.query("COMMIT");return node;
 }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
