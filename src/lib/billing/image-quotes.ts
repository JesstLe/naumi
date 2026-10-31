import {ensureImageBillingQuotes} from "@/lib/billing/image-quote-schema";
export {ensureImageBillingQuotes};

import "server-only";
import {randomUUID} from "node:crypto";
import {dbEnabled,getPool} from "@/platform/db/pool";

import {resolveUserEmail} from "../admin-auth";
import {currentCreationContext} from "@/lib/saas/creation-scope";
import {ModelConfigError} from "../model-config/types";
import {BillingError,type BillingQuote} from "./types";
import {imageBillingFeature} from "./image-quote-policy";

type Row={id:string;owner:string;scope_key:string;quote:BillingQuote;expires_at:Date|string;expired?:boolean};
function scopeKey(){const c=currentCreationContext();return JSON.stringify([c?.scopeKind||"personal",c?.tenantId||null]);}

/** Only opaque IDs leave the server; complete tariffs and cost facts remain private. */
export async function issueImageBillingQuote(request:Request,quote:BillingQuote){
  if(!imageBillingFeature(quote.facts.feature)||!dbEnabled)return undefined;
  const owner=await resolveUserEmail(request);if(!owner)throw new BillingError("INVALID_RESULT","请先登录",401);
  await ensureImageBillingQuotes();
  const row:Row={id:randomUUID(),owner:owner.toLowerCase(),scope_key:scopeKey(),quote:structuredClone(quote),expires_at:new Date(Date.now()+900000)};
  await getPool().query("INSERT INTO app_image_billing_quotes(id,owner,scope_key,quote,expires_at) VALUES($1,$2,$3,$4::jsonb,now()+interval '15 minutes')",[row.id,row.owner,row.scope_key,JSON.stringify(row.quote)]);
  return {id:row.id,expiresAt:new Date(row.expires_at).toISOString()};
}
/** This is an owner/scope-bound server quote, not a client version/amount assertion. */
export async function imageBillingQuoteForRequest(request:Request,authenticatedActor?:string|null):Promise<BillingQuote|undefined>{
  const id=request.headers.get("x-naumi-image-quote");if(!id)return undefined;
  const invalid=()=>new ModelConfigError("IMAGE_QUOTE_INVALID","本次报价凭据与账号或工作空间不符",400);
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw invalid();
  const owner=authenticatedActor===undefined?await resolveUserEmail(request):authenticatedActor;if(!owner)throw invalid();await ensureImageBillingQuotes();
  const row:Row|undefined=dbEnabled?(await getPool().query("SELECT *,expires_at<=now() expired FROM app_image_billing_quotes WHERE id=$1 AND owner=$2",[id,owner.toLowerCase()])).rows[0]:undefined;
  if(!row||row.owner!==owner.toLowerCase()||row.scope_key!==scopeKey()||!imageBillingFeature(row.quote.facts.feature))throw invalid();
  // This opaque, owner-bound record freezes a price for the same input. Its
  // maintenance TTL must not turn a legitimate submit into a new purchase.
  return structuredClone(row.quote);
}
/** Input identity is checked, never the browser's claimed price or current versions. */
export function assertImageBillingSelection(q:BillingQuote,input:{feature:string;quantity:number;modelId?:string;quality?:string;resolution?:string;ratio?:string}){
  // Older tool estimates omit ratio altogether; it was not an identity or price
  // input in that quote. The authenticated handler resolves its frame against
  // the quoted historical model. Explicitly quoted ratios remain immutable.
  const allowed=(name:"quality"|"resolution"|"ratio",value:string|undefined)=>value===undefined||name==="ratio"&&q.facts.ratio===undefined||[q.facts[name],q.requestedParameters?.[name],q.effectiveParameters?.[name]].some(saved=>name==="quality"?typeof saved==="string"&&saved.trim().toLowerCase()===value.trim().toLowerCase():saved===value);
  if(input.feature!==q.facts.feature||input.quantity!==q.facts.quantity||(input.modelId!==undefined&&input.modelId!==q.facts.modelId)||!allowed("quality",input.quality)||!allowed("resolution",input.resolution)||!allowed("ratio",input.ratio))
    throw new BillingError("OPERATION_CONFLICT","本次输入与原报价不符",409);
}
