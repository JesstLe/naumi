import "server-only";
import {getSession} from "./runtime";
import {releaseRuntimeEnabled, ReleaseRuntimeError} from "../release-runtime/identity";
import {sessionOwner} from "../release-runtime/store";

export function assertLocalAgentIdle(email:string,id:string) {
  const session=getSession(email,id);
  if(session?.running||session?.canvasExecuting)throw new ReleaseRuntimeError("AGENT_SESSION_BUSY",409);
}
export async function agentHistoryRunning(email:string,id:string) {
  const session=getSession(email,id);
  const owner=releaseRuntimeEnabled()?await sessionOwner(email,id,id.startsWith("cv-")?"canvas":"workbench"):null;
  if(owner?.state==="unknown")throw new ReleaseRuntimeError("AGENT_OWNER_UNKNOWN",409);
  return owner?.state==="running"||!!(session?.running||session?.canvasExecuting);
}
export async function agentHistoryResponse(run:()=>Promise<Response>):Promise<Response> {
  try{return await run();}
  catch(error){
    if(error instanceof ReleaseRuntimeError)return Response.json({error:error.code==="AGENT_SESSION_BUSY"?"会话仍在执行，请先停止任务": "会话执行状态尚未核实，请稍后重新打开",code:error.code},{status:error.status,headers:{"cache-control":"private, no-store"}});
    return Response.json({error:"会话记录暂时不可用，请稍后重试"},{status:503,headers:{"cache-control":"private, no-store"}});
  }
}
