import "server-only";
import {createHash} from "node:crypto";
import {submissionFingerprint} from "./submission-identity";
import {acceptedModelVersions} from "../model-config/accepted-context";
import {getModelAdministration} from "../model-config/server";
import {provenanceEntry} from "../artwork-provenance";
import {dbEnabled} from "@/platform/db/pool";
import {resolveUserEmail} from "../admin-auth";
import {quoteForRequest} from "./server";
import {getBillingRuntime} from "@/lib/billing/runtime";
import type {FeatureId} from "./types";
import {operationIdFor,requestQuoteConfirmation,billingErrorResponse} from "./request";
import {billingJson} from "./access";
import {currentCreationContext,withCreationRequest} from "../saas/creation-context";
import {prepareOriginalCreationInput} from "../saas/creation-writer";
import {TeamError} from "../teams/server";
import {withSynchronousOperation,type SynchronousResult} from "./synchronous-operation";
// Existing tools keep this compatibility export; no second billing implementation.
export {currentSynchronousBilling,recordBillingUsage,markBillingUpstream,exposeAbandonedBillingOperations,synchronousCost,settleSynchronous,configuredToolCost,synchronousChargedCredits,completeSynchronousStream,failSynchronousStream} from "./synchronous-operation";

export async function billingRequestIdentity(request: Request) {
    const copy = request.clone(), entries: unknown[] = [];
    let body: Record<string, unknown> = {};
    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
        const form = await copy.formData();
        const creation=currentCreationContext();if(creation){
            const text=form.get('userPrompt')||form.get('prompt')||form.get('instruction')||form.get('requirements');if(typeof text==='string')creation.requestText=text.slice(0,50000);
            creation.parameters={...creation.parameters,...Object.fromEntries(['ratio','resolution','quality','count','size','mode'].filter(k=>form.has(k)).map(k=>[k,form.get(k)]))};
        }
        let filePosition=0;
        for (const [key, value] of Array.from(form.entries()).sort(([a], [b]) => a.localeCompare(b))) {
            if (key === "billingVersion" || key === "billingCredits")
                continue;
            if(typeof value==='string')entries.push([key,value]);else {const bytes=Buffer.from(await value.arrayBuffer());entries.push([key,{name:value.name,type:value.type,size:value.size,sha256:createHash('sha256').update(bytes).digest('hex')}]);
                await prepareOriginalCreationInput(bytes,value.type||'application/octet-stream',key==='mask'?'mask':'reference',key==='mask'?0:filePosition++);
            }
        }
        body = { billingVersion: form.get("billingVersion") ?? undefined, billingCredits: form.get("billingCredits") ?? undefined };
    }
    else if ((request.headers.get("content-type") || "").includes("json")) {
        body = await copy.json();
        entries.push(Object.fromEntries(Object.entries(body).filter(([k]) => k !== "billingVersion" && k !== "billingCredits").sort(([a], [b]) => a.localeCompare(b))));
    }
    else
        entries.push(await copy.text());
    return { hash: submissionFingerprint(new URL(request.url).pathname,request.headers.get("x-naumi-image-quality"),request.headers.get("x-naumi-text-model"),request.headers.get("x-naumi-feature-model"),entries), confirmation: requestQuoteConfirmation(request, body) };
}
/** HTTP transport adapter. Streaming responses retain their original body and timing. */
export async function withBillingRequest(request:Request,feature:FeatureId,action:()=>Promise<Response>):Promise<Response>{
    if(!dbEnabled)return action();
    try{
        const email=await resolveUserEmail(request);
        if(!email)return billingJson({error:"请先登录"},401);
        if(!currentCreationContext())return await withCreationRequest(request,email,()=>withBillingRequest(request,feature,action));
        const operationId=operationIdFor(request);
        let originalResponse:Response|undefined,projected:SynchronousResult|undefined;
        const result=await withSynchronousOperation({email,feature,operationId,path:new URL(request.url).pathname,
            identity:()=>billingRequestIdentity(request),ip:request.headers.get("x-real-ip"),entry:provenanceEntry(request.headers.get("x-naumi-client-entry"),new URL(request.url).pathname.startsWith("/api/canvas/")?"canvas":"toolbox"),
            snapshot:async()=>{const accepted=await acceptedModelVersions(request);return accepted?(await getModelAdministration()).billing.byVersion(accepted.billingVersion):(await getBillingRuntime()).config.current();},
            quote:(facts,snapshot)=>quoteForRequest(request,facts,snapshot)},async()=>{
                originalResponse=await action();
                projected=originalResponse.headers.get("content-type")?.includes("text/event-stream")
                    ?{status:originalResponse.status,body:null,stream:true}
                    :{status:originalResponse.status,body:await originalResponse.clone().json().catch(()=>null)};
                return projected;
            });
        if(result===projected&&originalResponse)return originalResponse;
        if(result.replayed&&feature==="canvas.assistant"){
            const saved=result.body;
            if(Array.isArray(saved?.agentFrames)){
                const frames=saved.agentFrames.map((frame:{type:string;data:unknown})=>`event: ${frame.type}\ndata: ${JSON.stringify(frame.data)}\n\n`).join("");
                return new Response(frames+`event: done\ndata: ${JSON.stringify({ok:true,replayed:true})}\n\n`,{headers:{"content-type":"text/event-stream; charset=utf-8","cache-control":"private, no-store"}});
            }
            const events=`event: delta\ndata: ${JSON.stringify({text:saved?.text||""})}\n\nevent: done\ndata: ${JSON.stringify({ok:true,replayed:true})}\n\n`;
            return new Response(events,{headers:{"content-type":"text/event-stream; charset=utf-8","cache-control":"private, no-store"}});
        }
        return billingJson(result.body,result.status);
    }catch(error){if(error instanceof TeamError)return billingJson({error:error.message},error.status);return billingErrorResponse(error);}
}
