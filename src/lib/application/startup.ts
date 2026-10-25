import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";

export type WebStartupReport={mode:"application"|"no-database"|"sidecar";steps:string[]};
let initializing:Promise<WebStartupReport>|undefined;

/** Application composition only. Domain owners retain their transactions,
 * schema readiness and compatibility behavior. No discovery or task execution. */
async function initialize():Promise<WebStartupReport>{
  const pool=getPool(),steps:string[]=[];
  await(await import("../persistence/schema")).ensureSchema();steps.push("persistence");
  await(await(await import("../billing/runtime")).getBillingRuntime()).config.current();steps.push("billing");
  await(await import("../model-config/schema")).ensureModelSchema(pool);steps.push("models");
  await(await import("../model-config/runtime-schema")).ensureModelRuntimeSchema(pool);steps.push("model-runtime");
  await(await import("../video/frozen-capability")).ensureVideoDefaultsSchema(pool);steps.push("video-defaults");
  await(await import("../saas/creation-schema")).ensureCreationSchema();steps.push("creation");
  await(await import("../media-assets")).ensureMediaSchema();steps.push("media");
  await(await import("../auth-login-limit")).ensureLoginGuardSchema(pool);steps.push("login");
  await(await import("../image-skills/server")).ensureImageSkills();steps.push("image-skills");
  await(await import("../imagegen/quotes")).ensureImagegenQuotes();steps.push("imagegen-quotes");
  await(await import("../billing/image-quotes")).ensureImageBillingQuotes();steps.push("billing-quotes");
  await(await import("../imagegen/batch-repository")).ensureImagegenBatches();steps.push("imagegen-batches");
  await(await import("../reference-workbench/repository")).ensureWorkbench();steps.push("workbench");
  return {mode:"application",steps};
}

export function initializeWebApplication():Promise<WebStartupReport>{
  if(!dbEnabled)return Promise.resolve({mode:"no-database",steps:[]});
  if(process.env.FLEET_PORTAL_ONLY==="1"||process.env.NAUMI_AUTH_LOGIN_ONLY==="1")return Promise.resolve({mode:"sidecar",steps:[]});
  if(!initializing)initializing=initialize().catch(error=>{initializing=undefined;throw error;});
  return initializing;
}
