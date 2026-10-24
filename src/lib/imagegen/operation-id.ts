import {createHash} from "node:crypto";

/** Persisted child IDs are a compatibility contract, including pre-refactor jobs. */
export function imagegenStepId(operationId:string,key:string){const h=createHash("sha256").update(`${operationId}:${key}`).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
