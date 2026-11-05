import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {databaseSchemaReadiness} from '@/platform/db/schema-readiness';
import type {ModelRegistryStartup} from "../model-config/startup";
import {applicationTasksRunHere} from "./task-execution";

export type WebStartupReport={mode:"application"|"no-database"|"sidecar";steps:string[];modelRegistry?:ModelRegistryStartup};

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
  // The actual pool is the lifecycle identity, not this bundle's module cache.
  // A drained/closed generation must not lend its readiness to a new database.
  const state=databaseSchemaReadiness<WebStartupReport>(getPool(),'application-startup');
  if(!state.pending)state.pending=initialize().catch(error=>{state.pending=undefined;throw error;});
  return state.pending;
}
