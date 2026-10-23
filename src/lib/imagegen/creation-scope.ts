import "server-only";
import {currentCreationContext,frozenCreationScope,type CreationContext} from "../saas/creation-context";

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
