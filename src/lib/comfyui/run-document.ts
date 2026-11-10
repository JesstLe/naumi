import "server-only";
import {getComfyWorkflow} from "./repository";
import {getComfyNode} from "../canvas/comfy-node-service";
import {assertCreationProjectInput} from "../saas/creation-access";
import {ModelConfigError} from "../model-config/types";
import {parseComfyDocument,compileComfyDocument,type ComfyObjectInfo} from "./document";
/** Resolve one saved document under the actual owner/project. Called only by
 * execution; editor/library reads never resolve endpoint capabilities. */
export async function readComfyRunDocument(actor:string,id:string,expectedRevision?:number){
 if(id.startsWith("canvas-comfy:")){
  const node=await getComfyNode(actor,id.slice("canvas-comfy:".length));
  if(!node)throw new ModelConfigError("COMFY_NOT_FOUND","工作流不存在",404);
  await assertCreationProjectInput(actor,node.projectKey,undefined,true);
  if(expectedRevision!==undefined&&node.revision!==expectedRevision)throw new ModelConfigError("COMFY_REVISION_CONFLICT","工作流已更新，请读取最新内容后运行",409);
  return {id,name:node.title,document:node.workflow,projectKey:node.projectKey};
 }
 const workflow=await getComfyWorkflow(actor,id);if(!workflow)throw new ModelConfigError("COMFY_NOT_FOUND","工作流不存在",404);
 return {id,name:workflow.name,document:parseComfyDocument(workflow.apiJson),projectKey:undefined};
}
export function compileComfyRunDocument(document:Parameters<typeof compileComfyDocument>[0],info?:ComfyObjectInfo){
 try{return compileComfyDocument(document,info);}catch(error){throw new ModelConfigError("COMFY_PARAMETERS_UNRESOLVED",error instanceof Error?error.message:"工作流参数待确认",422);}
}
