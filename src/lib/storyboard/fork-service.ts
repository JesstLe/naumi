import "server-only";
import {createHash} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {authorizeCanvasProject} from "../canvas/project-access";
import {copyVideoNodes,getVideoNode} from "../canvas/video-node-service";
import {assertCreationProjectInput,bindActualCreationProject} from "../saas/creation-access";
import {ensureCreationSchema} from "../saas/creation-schema";
import {assertCreationInputsTx} from "../saas/creation-writer";
import {canonicalConfig} from "../model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import {assertStoryboardTake} from "./service";
import {ensureStoryboardSchema,readStoryboardPlan,saveStoryboardTx} from "./repository";
import {storyboardForkSchema,independentStoryboardDocument,type StoryboardForkResult} from "./fork";

/** One shared graph transaction: copied generation intent + immutable take provenance + plan + operation receipt. */
export async function forkStoryboardPlan(actorRaw:string,raw:unknown):Promise<StoryboardForkResult>{
  const actor=actorRaw.toLowerCase(),input=storyboardForkSchema.parse(raw);
  await ensureStoryboardSchema();await ensureCreationSchema();await authorizeCanvasProject(actor,input.projectKey);await assertCreationProjectInput(actor,input.projectKey,undefined,true);
  const digest=createHash("sha256").update(canonicalConfig(input)).digest("hex"),tx=await getPool().connect();
  try{
    await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`storyboard-fork:${actor}:${input.operationId}`]);
    await bindActualCreationProject(actor,input.projectKey,{tx});
    const prior=(await tx.query("SELECT digest,result FROM app_storyboard_fork_operations WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0];
    if(prior){if(prior.digest!==digest)throw new ModelConfigError("STORYBOARD_OPERATION_CONFLICT","分叉编号已用于另一请求",409);await tx.query("COMMIT");return prior.result;}
    const source=await readStoryboardPlan(actor,input.planId,tx);
    if(!source||source.projectKey!==input.projectKey||source.revision!==input.revision)throw new ModelConfigError("STORYBOARD_REVISION_CONFLICT","分叉来源已改变，请重新读取方案",409);
    if(source.document.shots.length!==input.nodes.length||source.document.shots.some(shot=>!input.nodes.some(node=>node.id===shot.nodeId)))throw new ModelConfigError("STORYBOARD_NODE_UNAVAILABLE","分叉必须包含方案的全部镜头及当前版本",422);
    const mediaIds=[...source.document.shots.flatMap(shot=>shot.takes.map(take=>take.artworkId)),...(source.document.audio||[]).map(audio=>audio.artworkId)];
    if(mediaIds.length)await assertCreationInputsTx(tx,actor,[...new Set(mediaIds)]);
    const sourceNodes=await Promise.all(input.nodes.map(node=>getVideoNode(actor,node.id,false,tx)));
    if(sourceNodes.some(node=>!node||node.projectKey!==input.projectKey))throw new ModelConfigError("STORYBOARD_NODE_UNAVAILABLE","分叉镜头已移除",409);
    const offsetX=Math.max(...sourceNodes.map(node=>node!.x+node!.width))-Math.min(...sourceNodes.map(node=>node!.x))+96;
    const copied=await copyVideoNodes(actor,source.document.shots.map(shot=>shot.nodeId),input.projectKey,input.operationId,{tx,offset:{x:offsetX,y:0},expectedRevisions:Object.fromEntries(input.nodes.map(node=>[node.id,node.revision]))});
    const document=independentStoryboardDocument(source.document,copied.idMap,input.title);
    // Validate actual task/node ownership and freeze only takes that existed at the fork point.
    // A future task on the old node cannot be injected through an ancestry wildcard.
    for(const shot of source.document.shots)for(const take of shot.takes){
      const origin=await assertStoryboardTake(actor,input.projectKey,shot.nodeId,take,tx);
      await tx.query("INSERT INTO app_storyboard_take_origins(email,project_key,node_id,task_id,artwork_id,origin_node_id,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[actor,input.projectKey,copied.idMap[shot.nodeId],take.taskId,take.artworkId,origin,input.operationId]);
    }
    const plan=await saveStoryboardTx(tx,actor,{id:input.operationId,projectKey:input.projectKey,expectedRevision:0,operationId:input.operationId,document},async()=>{
      await assertCreationProjectInput(actor,input.projectKey,tx);
    },{sourcePlanId:source.id,sourceRevision:source.revision,operationId:input.operationId,sourceNodes:input.nodes});
    const result:StoryboardForkResult={plan,...copied};
    await tx.query("INSERT INTO app_storyboard_fork_operations(email,operation_id,digest,result) VALUES($1,$2,$3,$4::jsonb)",[actor,input.operationId,digest,JSON.stringify(result)]);
    await tx.query("COMMIT");return result;
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
