import {ensureImagegenQuotes} from "@/lib/imagegen/storage-schema";
export {ensureImagegenQuotes};

import "server-only";
import {imagegenQuoteId} from "./operation-id";
import {dbEnabled,getPool} from "@/platform/db/pool";

import {imagegenCreationScopeKey,assertAcceptedImagegenCreationScope,ImagegenScopeError} from "./creation-scope";
import {assertCurrentCreationFeature} from "@/lib/saas/creation-access";
import {userFeaturePolicy,FeatureAccessError} from "@/lib/feature-access/repository";
import {allows} from "../feature-access/catalog";
import {imagegenFingerprint} from "./plan";
import {imagegenRequestSchema} from "./schema";
import {readImagegenInputs} from "./inputs";
import type {ImagegenPlan,ImagegenRequest} from "./types";

export const IMAGEGEN_QUOTE_TTL_MS=15*60*1000;
export type ImagegenSubmissionConfirmation={quoteId?:string;confirmed?:boolean;billingVersion?:number;modelVersion?:number;credits?:number};
type QuoteRow={id:string;owner:string;operation_id:string;fingerprint:string;context_key:string;request:ImagegenRequest;plan:ImagegenPlan;expires_at:Date|string;expired?:boolean};
const memory=new Map<string,QuoteRow>();

export class ImagegenQuoteError extends Error {
 readonly code="IMAGEGEN_QUOTE_INVALID";readonly status=400;
 constructor(){super("本次报价凭据与账号、输入或工作空间不符，请重新预览");}
}
export function assertImagegenQuoteReference(id:unknown,operationId:unknown):asserts id is string {
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(typeof id!=="string"||!uuid.test(id)||typeof operationId!=="string"||!uuid.test(operationId))throw new ImagegenQuoteError();
}
async function matchesQuoteScope(row:QuoteRow,owner:string){
 if(row.context_key===imagegenCreationScopeKey(owner))return true;
 // Old uploaded-image previews may precede the stable project binding. Keep
 // their exact original price only when their stored canvas anchor proves it.
 if(row.context_key!==JSON.stringify(["personal",null,null]))return false;
 try{await assertAcceptedImagegenCreationScope({actorEmail:row.owner,scopeKind:"personal",tenantId:null},owner,row.request);return true;}
 catch(error){if(error instanceof ImagegenScopeError)return false;throw error;}
}
/** Full BillingQuote facts stay server-side, including recursively frozen children. */
export function publicImagegenPlan(plan:ImagegenPlan):ImagegenPlan {
 const visible=structuredClone(plan);
 for(const step of visible.steps){delete step.billingQuote;delete step.preparedImage;}
 if(visible.children)visible.children=visible.children.map(child=>({...child,plan:publicImagegenPlan(child.plan)}));
 return visible;
}
function publicQuote(row:QuoteRow):ImagegenPlan {
 return {...publicImagegenPlan(row.plan),quote:{id:row.id,expiresAt:new Date(row.expires_at).toISOString()}};
}
function assertStoredQuote(row:QuoteRow|undefined,owner:string,operationId:string):asserts row is QuoteRow {
 if(!row||row.owner!==owner.toLowerCase()||row.operation_id!==operationId||row.fingerprint!==imagegenFingerprint(row.request)||row.plan.fingerprint!==row.fingerprint)throw new ImagegenQuoteError();
}
/** The quote owner loads the original candidate and checks its current scope. */
async function latestQuoteRow(request:ImagegenRequest,owner:string):Promise<QuoteRow|undefined>{
 const fingerprint=imagegenFingerprint(request),context=imagegenCreationScopeKey(owner),contexts=[context,JSON.stringify(["personal",null,null])];
 const row:QuoteRow|undefined=dbEnabled?(await getPool().query("SELECT * FROM app_imagegen_quotes WHERE owner=$1 AND operation_id=$2 AND fingerprint=$3 AND context_key=ANY($4::text[]) ORDER BY created_at DESC,id DESC LIMIT 1",[owner.toLowerCase(),request.operationId,fingerprint,contexts])).rows[0]:[...memory.values()].reverse().find(q=>q.owner===owner.toLowerCase()&&q.operation_id===request.operationId&&q.fingerprint===fingerprint&&contexts.includes(q.context_key));
 return row&&await matchesQuoteScope(row,owner)?row:undefined;
}
/** Preview persistence is not an accepted generation, wallet reservation or supplier call. */
export async function issueImagegenQuote(raw:ImagegenRequest,owner:string,plan:ImagegenPlan):Promise<ImagegenPlan>{
 const request=imagegenRequestSchema.parse(raw),fingerprint=imagegenFingerprint(request),frozenPlan=structuredClone(plan);
 if(frozenPlan.fingerprint!==fingerprint)throw new ImagegenQuoteError();
 await ensureImagegenQuotes();
 const existing=await latestQuoteRow(request,owner);
 if(existing){assertStoredQuote(existing,owner,request.operationId);return publicQuote(existing);}
 const contextKey=imagegenCreationScopeKey(owner);
 const row:QuoteRow={id:imagegenQuoteId(request.operationId,owner,fingerprint,contextKey),owner:owner.toLowerCase(),operation_id:request.operationId,fingerprint,context_key:contextKey,request,plan:frozenPlan,expires_at:new Date(Date.now()+IMAGEGEN_QUOTE_TTL_MS)};
 if(dbEnabled){
  // The existing primary key arbitrates concurrent previews atomically. No
  // extra transaction/lock, schema, writer, or current-price overwrite exists.
  const inserted=(await getPool().query("INSERT INTO app_imagegen_quotes(id,owner,operation_id,fingerprint,context_key,request,plan,expires_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,now()+interval '15 minutes') ON CONFLICT(id) DO NOTHING RETURNING expires_at",[row.id,row.owner,row.operation_id,row.fingerprint,row.context_key,JSON.stringify(request),JSON.stringify(frozenPlan)])).rows[0];
  if(inserted){row.expires_at=inserted.expires_at;return publicQuote(row);}
 }else if(!memory.has(row.id)){
  // Check and insert without an await; a concurrent caller reads this winner.
  memory.set(row.id,structuredClone(row));return publicQuote(row);
 }
 // Conflict may mean a lost preview ACK, not a new purchase or permission to
 // replace its plan. Validate the winner by full stored identity, not ID alone.
 const winner=await readImagegenQuote(row.id,owner,request.operationId);
 if(winner.fingerprint!==fingerprint)throw new ImagegenQuoteError();
 return publicQuote(winner);
}
/** The original intent keeps its saved price/plan beyond maintenance TTL. */
export async function readImagegenQuote(id:string,owner:string,operationId:string){
 assertImagegenQuoteReference(id,operationId);
 await ensureImagegenQuotes();
 const row:QuoteRow|undefined=dbEnabled?(await getPool().query("SELECT *,expires_at<=now() AS expired FROM app_imagegen_quotes WHERE id=$1 AND owner=$2 AND operation_id=$3",[id,owner.toLowerCase(),operationId])).rows[0]:memory.get(id);
 assertStoredQuote(row,owner,operationId);
 if(!await matchesQuoteScope(row,owner))throw new ImagegenQuoteError();
 return structuredClone(row);
}
/** Old pages ignore quote.id, but their preview still created a server quote.
 * Resolve that original request directly; never compare its browser versions
 * or claimed amount to current configuration. */
export async function latestImagegenQuote(request:ImagegenRequest,owner:string){
 await ensureImagegenQuotes();return (await latestQuoteRow(request,owner))?.id;
}
/** Existing-intent preview owns row loading, current access and public metadata.
 * It does not query current models/prices or delegate errors to a new planner. */
export async function readOriginalImagegenQuote(request:ImagegenRequest,owner:string):Promise<ImagegenPlan|undefined>{
 await ensureImagegenQuotes();const row=await latestQuoteRow(request,owner);if(!row)return undefined;
 assertStoredQuote(row,owner,request.operationId);
 const saved=structuredClone(row);await authorizedFrozenPlan(saved,request,owner,{});return publicQuote(saved);
}
export async function frozenImagegenQuote(request:ImagegenRequest,owner:string,confirmation:ImagegenSubmissionConfirmation){
 const row=await readImagegenQuote(confirmation.quoteId!,owner,request.operationId);
 return authorizedFrozenPlan(row,request,owner,confirmation);
}
async function authorizedFrozenPlan(row:QuoteRow,request:ImagegenRequest,owner:string,confirmation:ImagegenSubmissionConfirmation){
 if(row.fingerprint!==imagegenFingerprint(request))throw new ImagegenQuoteError();
 if(confirmation.confirmed===false)throw new Error("已取消提交");
 await assertCurrentCreationFeature("/api/imagegen");
 // Only current authorization and owned input access are rechecked. No current
 // model/billing lookup, repricing or second plan is allowed on this branch.
 const plan=row.plan,access=await userFeaturePolicy(owner),imageAllowed=["generate","batchshot","variations","fuse"].some(id=>allows(access,id));
 if(plan.request.entry==="canvas"&&!allows(access,"canvas")||plan.request.entry==="agent"&&!allows(access,"agent")||plan.intent.operation!=="postprocess"&&!imageAllowed||plan.intent.operation==="postprocess"&&!["canvas","works","generate"].some(id=>allows(access,id))||plan.request.mode==="batch"&&!allows(access,"batchshot")||plan.steps.some(s=>s.operation==="cutout")&&!allows(access,"cutout"))throw new FeatureAccessError("此图像功能尚未授权");
 await readImagegenInputs(plan.request,owner);
 return plan;
}
