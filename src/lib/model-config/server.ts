import "server-only";
import {getBillingRuntime} from "../billing/runtime";
import {initializeModelRegistry} from "./lifecycle";
import {createModelRuntime} from "./runtime";
export {modelTrustedOrigins} from "./environment";

let assembled:Promise<Awaited<ReturnType<typeof assemble>>>|undefined;
async function assemble() {
  const registry=await initializeModelRegistry();
  const billing=(await getBillingRuntime()).config;
  const runtime=createModelRuntime({...registry,billing:()=>billing.current(),billingByVersion:version=>billing.byVersion(version)});
  return {...registry,runtime,billing};
}
export async function getModelAdministration() {
  if(!assembled)assembled=assemble().catch(error=>{assembled=undefined;throw error;});
  return assembled;
}
export async function getModelRuntime() { return (await getModelAdministration()).runtime; }
