import { AsyncLocalStorage } from "node:async_hooks";
import process from "node:process";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { accountKey, releaseRuntimeEnabled, releaseSecret, ReleaseRuntimeError } from "./identity";
import { activeAcceptedParent, consumeAgentContinuation, type AcceptedParent } from "./store";

const acceptedKey=Symbol.for("naumi.release.accepted-context.v1");
const processScope=process as typeof process & {[acceptedKey]?:AsyncLocalStorage<AcceptedParent>};
const accepted = processScope[acceptedKey] ||= new AsyncLocalStorage<AcceptedParent>();
export const CONTINUATION_HEADER = "x-naumi-agent-continuation";
export const currentAcceptedParent = () => accepted.getStore();
// These exact endpoints enter the normal authenticated withBiRequest wrapper.
// Other tools do not receive a continuation exemption until their lifecycle is integrated.
export function continuationPathAllowed(path: string, method: string) {
  return method === "POST" && /^\/api\/(?:generate-image|retouch|recolor|replicate|suite|aplus|packaging3d)$/.test(new URL(path,"http://internal.invalid").pathname) && path.startsWith("/api/") && !/[\\\u0000-\u0020]/.test(path);
}
type Claim = AcceptedParent & { method: string; path: string; at: number; nonce: string };
const mac = (payload: string) => createHmac("sha256", releaseSecret()).update("agent-continuation-v1:"+payload).digest("hex");
export function withAcceptedExecution<T>(parent: AcceptedParent | undefined, action: () => Promise<T>): Promise<T> {
  return parent ? accepted.run(parent, action) : action();
}
export async function signAgentContinuation(email: string, path: string, method: string): Promise<string | undefined> {
  if(!releaseRuntimeEnabled())return undefined;
  const parent=accepted.getStore();
  if(!parent||!continuationPathAllowed(path,method))return undefined;
  if(parent.account!==accountKey(email)||!await activeAcceptedParent(parent))throw new ReleaseRuntimeError("AGENT_CONTINUATION_INACTIVE",409);
  const claim:Claim={...parent,path,method,at:Date.now(),nonce:randomUUID()};
  const encoded=Buffer.from(JSON.stringify(claim)).toString("base64url");
  return encoded+"."+mac(encoded);
}
export async function verifyAgentContinuation(request:Request,email:string|null,consume=false):Promise<AcceptedParent|undefined>{
  const token=request.headers.get(CONTINUATION_HEADER);
  if(!token)return undefined;
  if(!releaseRuntimeEnabled()||!email||token.length>4096)throw new ReleaseRuntimeError("AGENT_CONTINUATION_FORGED",403);
  const [encoded,supplied,...extra]=token.split(".");
  if(extra.length||!encoded||!/^[a-f0-9]{64}$/.test(supplied||"")||!timingSafeEqual(Buffer.from(mac(encoded)),Buffer.from(supplied)))throw new ReleaseRuntimeError("AGENT_CONTINUATION_FORGED",403);
  let claim:Claim;try{claim=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8"));}catch{throw new ReleaseRuntimeError("AGENT_CONTINUATION_FORGED",403);}
  const path=new URL(request.url).pathname+new URL(request.url).search;
  if(!claim||claim.account!==accountKey(email)||claim.method!==request.method||claim.path!==path||!continuationPathAllowed(path,request.method)||!Number.isSafeInteger(claim.at)||Math.abs(Date.now()-claim.at)>30000||!/^[a-f0-9-]{36}$/i.test(claim.nonce)||!/^[a-f0-9-]{36}$/i.test(claim.id)||!/^[a-f0-9-]{36}$/i.test(claim.bootId))throw new ReleaseRuntimeError("AGENT_CONTINUATION_INVALID",403);
  const parent:AcceptedParent={id:claim.id,account:claim.account,instanceId:claim.instanceId,bootId:claim.bootId};
  if(!await activeAcceptedParent(parent))throw new ReleaseRuntimeError("AGENT_CONTINUATION_INACTIVE",409);
  if(consume)await consumeAgentContinuation(claim.nonce,parent.id,createHash("sha256").update(encoded).digest("hex"));
  return parent;
}
export async function withAcceptedContinuationRequest<T>(request:Request,email:string,action:()=>Promise<T>):Promise<T>{
  const parent=await verifyAgentContinuation(request,email,true);
  return withAcceptedExecution(parent,action);
}
