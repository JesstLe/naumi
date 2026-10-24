import "server-only";
import {randomUUID} from "node:crypto";
import {dbEnabled,ensureSchema,getPool} from "../db";
import {imagegenCreationScopeKey} from "./creation-scope";
import {assertCurrentCreationFeature} from "../saas/creation-context";
import {userFeaturePolicy,FeatureAccessError} from "../feature-access/server";
import {allows} from "../feature-access/catalog";
import {imagegenFingerprint} from "./plan";
import {imagegenRequestSchema} from "./schema";
import {readImagegenInputs} from "./inputs";
import type {ImagegenPlan,ImagegenRequest} from "./types";

export const IMAGEGEN_QUOTE_TTL_MS=15*60*1000;
export type ImagegenSubmissionConfirmation={quoteId?:string;confirmed?:boolean;billingVersion?:number;modelVersion?:number;credits?:number};
type QuoteRow={id:string;owner:string;operation_id:string;fingerprint:string;context_key:string;request:ImagegenRequest;plan:ImagegenPlan;expires_at:Date|string;expired?:boolean};
const memory=new Map<string,QuoteRow>();
let ready:Promise<void>|undefined;
export async function ensureImagegenQuotes(){
 if(!dbEnabled)return;
 if(!ready)ready=ensureSchema().then(()=>getPool().query(`CREATE TABLE IF NOT EXISTS app_imagegen_quotes(
 id uuid PRIMARY KEY,owner text NOT NULL REFERENCES app_users(email),operation_id uuid NOT NULL,
 fingerprint text NOT NULL,context_key text NOT NULL,request jsonb NOT NULL,plan jsonb NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS app_imagegen_quotes_owner ON app_imagegen_quotes(owner,operation_id);
 CREATE INDEX IF NOT EXISTS app_imagegen_quotes_expiry ON app_imagegen_quotes(expires_at);`)).then(()=>{}).catch(e=>{ready=undefined;throw e;});
 await ready;
}
export class ImagegenQuoteError extends Error {
 readonly code="IMAGEGEN_QUOTE_INVALID";readonly status=400;
 constructor(){super("本次报价凭据与账号、输入或工作空间不符，请重新预览");}
}
export function assertImagegenQuoteReference(id:unknown,operationId:unknown):asserts id is string {
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(typeof id!=="string"||!uuid.test(id)||typeof operationId!=="string"||!uuid.test(operationId))throw new ImagegenQuoteError();
}
/** Full BillingQuote facts stay server-side, including recursively frozen children. */
export function publicImagegenPlan(plan:ImagegenPlan):ImagegenPlan {
 const visible=structuredClone(plan);
 for(const step of visible.steps){delete step.billingQuote;delete step.preparedImage;}
 if(visible.children)visible.children=visible.children.map(child=>({...child,plan:publicImagegenPlan(child.plan)}));
 return visible;
}
/** Preview persistence is not an accepted generation, wallet reservation or supplier call. */
export async function issueImagegenQuote(raw:ImagegenRequest,owner:string,plan:ImagegenPlan):Promise<ImagegenPlan>{
 const request=imagegenRequestSchema.parse(raw),fingerprint=imagegenFingerprint(request);
 if(plan.fingerprint!==fingerprint)throw new ImagegenQuoteError();
 await ensureImagegenQuotes();
 // Re-previewing the same operation is still the original intent, not consent
 // to current prices. TTL is maintenance metadata, not permission to reprice.
 const existing=await latestImagegenQuote(request,owner);
 if(existing){const saved=await readImagegenQuote(existing,owner,request.operationId);return {...publicImagegenPlan(saved.plan),quote:{id:saved.id,expiresAt:new Date(saved.expires_at).toISOString()}};}
 const row:QuoteRow={id:randomUUID(),owner:owner.toLowerCase(),operation_id:request.operationId,fingerprint,context_key:imagegenCreationScopeKey(owner),request,plan,expires_at:new Date(Date.now()+IMAGEGEN_QUOTE_TTL_MS)};
 if(dbEnabled){const saved=(await getPool().query("INSERT INTO app_imagegen_quotes(id,owner,operation_id,fingerprint,context_key,request,plan,expires_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,now()+interval '15 minutes') RETURNING expires_at",[row.id,row.owner,row.operation_id,row.fingerprint,row.context_key,JSON.stringify(request),JSON.stringify(plan)])).rows[0];row.expires_at=saved.expires_at;}
 else memory.set(row.id,structuredClone(row));
 return {...publicImagegenPlan(plan),quote:{id:row.id,expiresAt:new Date(row.expires_at).toISOString()}};
}
/** The original intent keeps its saved price/plan beyond maintenance TTL. */
export async function readImagegenQuote(id:string,owner:string,operationId:string){
 assertImagegenQuoteReference(id,operationId);
 await ensureImagegenQuotes();
 const row:QuoteRow|undefined=dbEnabled?(await getPool().query("SELECT *,expires_at<=now() AS expired FROM app_imagegen_quotes WHERE id=$1 AND owner=$2 AND operation_id=$3",[id,owner.toLowerCase(),operationId])).rows[0]:memory.get(id);
 if(!row||row.owner!==owner.toLowerCase()||row.operation_id!==operationId||row.context_key!==imagegenCreationScopeKey(owner)||row.fingerprint!==imagegenFingerprint(row.request)||row.plan.fingerprint!==row.fingerprint)throw new ImagegenQuoteError();
 return structuredClone(row);
}
/** Old pages ignore quote.id, but their preview still created a server quote.
 * Resolve that original request directly; never compare its browser versions
 * or claimed amount to current configuration. */
export async function latestImagegenQuote(request:ImagegenRequest,owner:string){
 await ensureImagegenQuotes();const fingerprint=imagegenFingerprint(request),context=imagegenCreationScopeKey(owner);
 const row:QuoteRow|undefined=dbEnabled?(await getPool().query("SELECT * FROM app_imagegen_quotes WHERE owner=$1 AND operation_id=$2 AND fingerprint=$3 AND context_key=$4 ORDER BY created_at DESC,id DESC LIMIT 1",[owner.toLowerCase(),request.operationId,fingerprint,context])).rows[0]:[...memory.values()].reverse().find(q=>q.owner===owner.toLowerCase()&&q.operation_id===request.operationId&&q.fingerprint===fingerprint&&q.context_key===context);
 return row?.id;
}
export async function frozenImagegenQuote(request:ImagegenRequest,owner:string,confirmation:ImagegenSubmissionConfirmation){
 const row=await readImagegenQuote(confirmation.quoteId!,owner,request.operationId);
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
