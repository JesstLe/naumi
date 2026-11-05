import {createHash} from "node:crypto";

/** Persisted child IDs are a compatibility contract, including pre-refactor jobs. */
export function imagegenStepId(operationId:string,key:string){const h=createHash("sha256").update(`${operationId}:${key}`).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}

/** New previews have one opaque ID per owner/operation/input/scope. Historical
 * random quote IDs remain authoritative when already saved; prices/versions
 * deliberately do not participate in this identity. Child ID bytes stay exact. */
export function imagegenQuoteId(operationId:string,owner:string,fingerprint:string,contextKey:string){
 return imagegenStepId(operationId,"quote:v1:"+JSON.stringify([owner.toLowerCase(),fingerprint,contextKey]));
}
