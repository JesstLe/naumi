import "server-only";
import {currentCreationContext,frozenCreationScope,type CreationContext} from "../saas/creation-context";
import type {ImagegenRequest} from "./types";

export class ImagegenScopeError extends Error {
 readonly code="IMAGEGEN_SCOPE_CONFLICT";readonly status=409;
 constructor(){super("任务不存在或与当前工作空间不符");}
}
/** Only an authorized current context can select scope; saved data never selects it. */
export function imagegenCreationScopeKey(owner?:string){
 const current=currentCreationContext();
 if(owner&&current&&current.actorEmail!==owner.toLowerCase())throw new ImagegenScopeError();
 return JSON.stringify([current?.scopeKind||"personal",current?.tenantId||null,current?.parentContext||null]);
}
export function imagegenFrozenCreationScope(value:unknown,owner:string):CreationContext|undefined {
 let saved:CreationContext|undefined;
 try{saved=frozenCreationScope(value,owner);}catch{throw new ImagegenScopeError();}
 if(value!=null&&!saved)throw new ImagegenScopeError();
 return saved;
}
export function assertImagegenCreationScope(value:unknown,owner:string):CreationContext|undefined {
 const saved=imagegenFrozenCreationScope(value,owner);
 const current=currentCreationContext();
 imagegenCreationScopeKey(owner);
 // Older receipts carry no scope. They remain personal, including when read
 // from an old personal project, and can never be relabelled into a tenant.
 if(!saved){if(current?.scopeKind==="tenant"||current?.tenantId)throw new ImagegenScopeError();return undefined;}
 if(saved.scopeKind!==(current?.scopeKind||"personal")||saved.tenantId!==(current?.tenantId||null)||(saved.parentContext||null)!==(current?.parentContext||null))throw new ImagegenScopeError();
 return saved;
}
/** Compatibility for an exact server-stored personal request accepted before
 * uploaded canvases kept their project. Never rewrite its frozen scope or use
 * arbitrary reference images/current tenant membership to select a project. */
export async function assertAcceptedImagegenCreationScope(value:unknown,owner:string,request?:ImagegenRequest):Promise<CreationContext|undefined>{
 try{return assertImagegenCreationScope(value,owner);}catch(error){
  if(!(error instanceof ImagegenScopeError))throw error;
  const saved=imagegenFrozenCreationScope(value,owner),current=currentCreationContext();
  if(!saved||saved.scopeKind!=="personal"||saved.tenantId!==null||saved.parentContext||!current||current.actorEmail!==owner.toLowerCase()||current.scopeKind!=="personal"||current.tenantId!==null||!current.parentContext||request?.entry!=="canvas")throw error;
  const project=/^(tree|batch):([A-Za-z0-9][A-Za-z0-9._:-]{0,159})$/.exec(current.parentContext);
  const target=Array.isArray(request.inputs)?request.inputs.find(input=>input.role==="edit-target"):undefined;
  const source=request.sourceNodeId||target?.originalArtworkId||target?.reference?.sourceNodeId||target?.artworkId;
  if(!project||typeof source!=="string"||!source||source.startsWith("asset-")||source.length>160)throw error;
  const {getPool}=await import("../db");
  const proof=await getPool().query(`SELECT 1 FROM app_artworks
   WHERE email=$1 AND id=$2 AND deleted_at IS NULL
    AND (($3='tree' AND (id=$4 OR group_id=$4)) OR ($3='batch' AND batch_id=$4))
   UNION ALL SELECT 1 FROM app_canvas_text_nodes WHERE email=$1 AND id=$2 AND project_key=$5 LIMIT 1`,[owner.toLowerCase(),source,project[1],project[2],current.parentContext]);
  if(!proof.rowCount)throw error;
  return saved;
 }
}
