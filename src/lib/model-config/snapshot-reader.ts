import "server-only";
import {currentExecutionBundle,currentModelExecution,currentModelSnapshot} from "./context";
import {modelConfigurationEnabled} from "./availability";
import {readPublishedModelSnapshot} from "./published";

/** Resolve once per operation and pass the snapshot onward. No cache of mutable current across requests. */
export async function readManagedModelSnapshot(version?:number){
  if(!await modelConfigurationEnabled())return null;
  const accepted=version||currentExecutionBundle()?.modelVersion||currentModelExecution()?.frozen.modelVersion;
  const existing=currentModelSnapshot();
  if(existing&&(!accepted||existing.version===accepted))return existing;
  return readPublishedModelSnapshot(accepted||undefined);
}
