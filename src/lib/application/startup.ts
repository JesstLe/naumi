import "server-only";
import {dbEnabled} from "@/platform/db/pool";
import type {ModelRegistryStartup} from "../model-config/startup";
import {applicationTasksRunHere} from "./task-execution";

export type WebStartupReport={mode:"application"|"no-database"|"sidecar";steps:string[];modelRegistry?:ModelRegistryStartup};
let initializing:Promise<WebStartupReport>|undefined;

/** Application composition only. Domain owners retain their transactions,
 * schema readiness and compatibility behavior. No discovery or task execution. */
async function initialize():Promise<WebStartupReport>{
 const steps=await(await import("./persistence")).initializeApplicationPersistence();
 const modelRegistry=await(await import("../model-config/startup")).prepareModelRegistry();
 return {mode:"application",steps,modelRegistry};
}

export function initializeWebApplication():Promise<WebStartupReport>{
  applicationTasksRunHere();
  if(!dbEnabled)return Promise.resolve({mode:"no-database",steps:[]});
  if(process.env.FLEET_PORTAL_ONLY==="1"||process.env.NAUMI_AUTH_LOGIN_ONLY==="1")return Promise.resolve({mode:"sidecar",steps:[]});
  if(!initializing)initializing=initialize().catch(error=>{initializing=undefined;throw error;});
  return initializing;
}
