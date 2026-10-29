import {SupplierAdapterResponseError,adapterFailureEvidence,recordSupplierAdapterFailure} from "../supplier-cost/adapter-failure";
import "server-only";
import { apimartImageParameters } from "./apimart-image-parameters";
import { seedreamPreflight } from "./seedream-preflight";
import { guardChannelSubmission } from "./channel-availability";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ModelExecutionScope } from "./context";
import type { ValidationOptions } from "./schema";
import { modelEndpointFetch } from "./transport";
import { effectiveImageParameters } from "./image-preset";
import { ModelConfigError } from "./types";
import { currentImageOperationId, currentImageOperationParameters, ImageOperationPending, ImageOperationDeferred } from "../image-gateway";
import { supplierContext } from "../supplier-cost/collect";
import { supplierLedger, accountIdentity } from "../supplier-cost/runtime";
import { apimartTask, submittedAPIMartTask, genericReceipt } from "../supplier-cost/adapters";
import { parseReceiptJson } from "../supplier-cost/money";
import { readBounded, readBoundedBytes } from "../supplier-cost/io";
import {recordBillingUsage, currentSynchronousBilling} from "@/lib/billing/synchronous-operation";
import {validatedChannelImageResponse} from "./channel-image-response";

/** Actual submission parameters, not the original UI audit request. Old preset
 * and legacy tasks keep their previous precedence when no effective quote or
 * explicit new non-preset frozen fallback exists. No resolution is guessed. */
export function apimartExecutionParameters(scope: ModelExecutionScope, body:Record<string,any>, quote?:Pick<import("../billing/types").BillingQuote,"requestedParameters"|"effectiveParameters">, operation?:ReturnType<typeof currentImageOperationParameters>) {
  const p=scope.imagePreset;
  const requested={...(scope.frozen.requestedParameters || {quality:scope.frozen.facts?.quality||String(body.quality||"medium"),resolution:scope.frozen.facts?.requestedResolution||scope.frozen.facts?.resolution||"1K",ratio:scope.frozen.facts?.ratio||"1:1"}),...quote?.requestedParameters};
  if(!p&&scope.frozen.requestedParameters&&scope.frozen.facts?.requestedResolution)requested.resolution=scope.frozen.facts.requestedResolution;
  if(!p&&operation?.quality&&scope.capabilities.qualities.includes(operation.quality as never))requested.quality=operation.quality;
  if(operation?.ratio)requested.ratio=operation.ratio;
  if(operation?.resolution)requested.resolution=operation.resolution;
  if(!p&&quote?.effectiveParameters){
    requested.resolution=quote.effectiveParameters.resolution;
    requested.ratio=quote.effectiveParameters.ratio;
    // Billing may use a wire alias (hd) or auto to mean omitted quality.
    // The adapter still needs a declared semantic choice for policyQuality().
    if(scope.capabilities.qualities.includes(quote.effectiveParameters.quality as never))requested.quality=quote.effectiveParameters.quality;
  }
  // New preset delivery fallback is explicit; old prompt-only preset requests
  // had no differing effective tier and retain their historical precedence.
  if(p && quote?.effectiveParameters && quote.requestedParameters?.resolution!==quote.effectiveParameters.resolution) requested.resolution=quote.effectiveParameters.resolution;
  else if(p && scope.frozen.requestedParameters && scope.frozen.facts && scope.frozen.requestedParameters.resolution!==scope.frozen.facts.resolution) requested.resolution=scope.frozen.facts.resolution;
  return requested;
}

/** One durable submission. A timeout/unknown acceptance only queries the original task. */
export function apimartImagesFetch(scope: ModelExecutionScope, options: ValidationOptions = {}, overrides?: { transport?: typeof fetch; media?: typeof fetch; pollMs?: number }): typeof fetch {
  const c=scope.connection,p=scope.imagePreset,policy=scope.parameterMap.apimartImages;
  if(!p&&!policy)throw new ModelConfigError("INVALID_CONFIG","APIMart图片缺少显式执行契约");
  const transport=overrides?.transport || modelEndpointFetch(c.baseUrl,options,{...c,costDisabled:true,costScope:scope});
  const base=c.baseUrl.replace(/\/v1\/?$/,"").replace(/\/$/,"");
  const auth={Authorization:`Bearer ${c.apiKey}`};
  const json=async (path:string,init:RequestInit={}) => {
    const response=await transport(`${base}${path}`,{...init,headers:{...auth,...init.headers}});
    const raw=await readBounded(response,2*1024*1024);
    let parsed: any;
    try { parsed=parseReceiptJson(raw); }
    catch { throw new SupplierAdapterResponseError(response.status,raw,undefined,true); }
    if(!response.ok) throw new SupplierAdapterResponseError(response.status,raw,parsed);
    return parsed;
  };
  return async(input,init)=>{
    const request=new Request(input,init);
    if(new URL(request.url).origin!==new URL(c.baseUrl).origin || request.method!=="POST" || !/\/images\/(generations|edits)$/.test(new URL(request.url).pathname)) throw new ModelConfigError("INVALID_REQUEST","APIMart适配器仅接图片生成和编辑");
    let body:Record<string,any>,files:File[]=[],mask:File|undefined;
    if(request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form=await request.formData();body=Object.fromEntries(Array.from(form.entries()).filter(([,v])=>typeof v==="string"));
      for(const [key,value] of Array.from(form.entries())) if(typeof value!=="string") {if(/^image(?:\[\])?$/.test(key))files.push(value);else if(key==="mask")mask=value;}
    } else body=await request.json();
    if (body.background === "transparent" && !scope.capabilities.transparent && !(scope.frozen.imageParameterPlanVersion===1&&scope.parameterMap.imagegen?.transparent==="background")) throw new ModelConfigError("MODEL_INCOMPATIBLE","当前实际模型未核验透明背景能力",422);
    const editing=new URL(request.url).pathname.endsWith("/edits");
    if(body.image_urls || body.image || body.mask || body.mask_url)throw new ModelConfigError("INVALID_REQUEST","参考图和蒙版需要使用受控文件上传");
    const n=Number(body.n??1);
    if(!Number.isInteger(n)||n<1||n>(policy?.maxOutputs??4)||typeof body.prompt!=="string"||!body.prompt.trim()||files.length>scope.capabilities.maxReferenceImages) throw new ModelConfigError("INVALID_REQUEST","图片数量、提示词或参考图参数无效");
    if(!p && (!scope.capabilities[editing?"edit":"generate"] || editing&&!files.length || !editing&&files.length))throw new ModelConfigError("MODEL_INCOMPATIBLE","图片操作与已声明能力不匹配",422);
    if(mask&&!(p?.supportsMask??policy?.supportsMask))throw new ModelConfigError("MODEL_INCOMPATIBLE","当前APIMart实际模型不支持蒙版");
    for(const f of files)if(!/^image\/(png|jpeg|webp)$/.test(f.type)||f.size>20*1024*1024)throw new ModelConfigError("INVALID_REQUEST","参考图格式或大小超出支持范围");
    // Decode and validate every local input BEFORE upload or paid submission.
    for(const file of [...files,...(mask?[mask]:[])]) {
      try{await sharp(Buffer.from(await file.arrayBuffer()),{failOn:"error",limitInputPixels:100_000_000}).resize(1,1).raw().toBuffer();}
      catch{throw new ModelConfigError("INVALID_REQUEST","参考图或蒙版内容无效");}
    }
    if(mask){
      if(!files[0]||mask.type!=="image/png"||mask.size>4*1024*1024)throw new ModelConfigError("INVALID_REQUEST","蒙版需要PNG、参考图且不超过4MiB");
      const m=await sharp(Buffer.from(await mask.arrayBuffer())).metadata(),i=await sharp(Buffer.from(await files[0].arrayBuffer())).metadata();
      if(!m.hasAlpha||m.width!==i.width||m.height!==i.height)throw new ModelConfigError("INVALID_REQUEST","蒙版透明通道和像素必须匹配首张参考图");
    }
    const requested=apimartExecutionParameters(scope,body,currentSynchronousBilling()?.operation?.quote,currentImageOperationParameters());
    const params=p?effectiveImageParameters(p,requested):apimartImageParameters(scope,requested);
    const unit=currentImageOperationId();if(!unit)throw new ModelConfigError("INVALID_REQUEST","默认APIMart调用缺少稳定操作ID");
    const context=await supplierContext(scope), ledger=supplierLedger(),accountId=accountIdentity(c.baseUrl,c.apiKey);
    await ledger.account({id:accountId,providerId:c.providerId,protocol:c.protocol,baseUrl:c.baseUrl,credentialRef:c.credentialRef});
    // Keep the original preset namespace for all already accepted preset tasks.
    const attemptId=createHash("sha256").update(p?`apimart-preset:${scope.frozen.modelVersion}:${unit}`:JSON.stringify(["apimart-images-v1",scope.frozen.modelVersion,scope.frozen.publicModelId,c.providerId,c.wireModel,unit])).digest("hex");
    const procurement=p?p.prices.find(v=>v.quality===params.effective.quality&&v.resolution===params.effective.resolution)?.procurement:scope.procurement;
    const row=await ledger.begin({...context,attemptId,accountId,providerId:c.providerId,model:c.wireModel,procurement,fx:p?.fx?{currency:"USD",...p.fx}:null});
    const requestHash=createHash("sha256").update(JSON.stringify({model:c.wireModel,version:p?p.versionParameter:scope.parameterMap.version,params,n,prompt:body.prompt,images:await Promise.all(files.map(async f=>createHash("sha256").update(Buffer.from(await f.arrayBuffer())).digest("hex"))),mask:mask?createHash("sha256").update(Buffer.from(await mask.arrayBuffer())).digest("hex"):null})).digest("hex");
    // Claim the only paid POST with a persisted marker. A crashed marker without
    // task ID is unknown, never a license to submit again (even after key expiry).
    // Pin the channel before uploads/marker, including competing family selections.
    // Restoring a marker or task bypasses this gate: no new POST is possible.
    const previous=(await ledger.pool.query("SELECT parameters,task_id FROM app_supplier_calls WHERE id=$1",[row.id])).rows[0];
    // New model-specific checks apply only before any accepted/unknown marker.
    // Never reinterpret a frozen task as unaccepted or authorize a new POST.
    if(!p&&!previous.parameters&&!previous.task_id)await seedreamPreflight(c.wireModel,body.prompt,files,n);
    if(!previous.parameters&&!previous.task_id)await guardChannelSubmission(ledger.pool,scope);
    const claimed=await ledger.pool.query(`UPDATE app_supplier_calls SET parameters=$2::jsonb,billing_unit_id=$3 WHERE id=$1 AND parameters IS NULL RETURNING id`,[row.id,JSON.stringify({requested:params.requested,effective:params.effective,upstream:params.upstream,...("parameterPlan" in params?{parameterPlan:params.parameterPlan}:{}),requestHash,modelVersion:scope.frozen.modelVersion,...(p?{factorBps:p.factorBps}:{adapter:"apimart-images-v1"})}),unit]);
    const original=(await ledger.pool.query("SELECT * FROM app_supplier_calls WHERE id=$1",[row.id])).rows[0];
    if(original.parameters?.requestHash!==requestHash)throw new ModelConfigError("OPERATION_CONFLICT","相同调用编号的请求内容发生变化",409);
    let taskId=original.task_id as string|undefined;
    if(!claimed.rowCount&&!taskId)throw new ImageOperationPending(unit,new Error("APIMart原调用受理状态待核查"));
    let generationPosted=!!taskId;
    let adapterStage="upload";
    try {
      if(!taskId) {
        const image_urls:string[]=[];
        for(const file of files){const form=new FormData();form.set("file",file);const upload=await json("/v1/uploads/images",{method:"POST",body:form,signal:request.signal});if(typeof upload.url!=="string"||!/^https:\/\//.test(upload.url))throw new Error("APIMart upload receipt missing URL");image_urls.push(upload.url);}
        let mask_url:string|undefined;
        if(mask)mask_url=`data:image/png;base64,${Buffer.from(await mask.arrayBuffer()).toString("base64")}`;
        // Generic async channels send only configured fields. Gemini uses this
        // field as response transport (url), not the locally exported PNG format.
        // Keep the historical GPT preset's explicit contract and administrator maps.
        const payload={model:c.wireModel,...((p?p.versionParameter:scope.parameterMap.version)?{version:p?p.versionParameter:scope.parameterMap.version}:{}),prompt:[body.prompt,...params.promptConstraints].join("\n"),n,...params.upstream,...(image_urls.length?{image_urls}:{}),...(mask_url?{mask_url}:{}),...(scope.frozen.imageParameterPlanVersion!==1&&body.background === "transparent" ? {background:"transparent"} : {}),...(p&&!("output_format" in params.upstream)&&!(scope.frozen.imageParameterPlanVersion===1&&scope.parameterMap.imagegen?.outputFormat==="omit")?{output_format:"png"}:{})};
        generationPosted=true;
        adapterStage="submit";
        const submitted=await json("/v1/images/generations",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":attemptId,"X-APIMart-Response-Version":"2026-07-27"},body:JSON.stringify(payload),signal:request.signal});
        adapterStage="submit-receipt";
        taskId=submittedAPIMartTask(submitted)||undefined;if(!taskId)throw new ImageOperationPending(unit,new Error("APIMart受理响应缺少明确任务ID"));
        adapterStage="persist-task";
        await ledger.apply(row.id,{state:"submitted",taskId,status:"pending",source:"apimart-submit",evidence:{source:"apimart-submit"}});
        await ledger.enqueue(`task:${row.id}`,"task",{callId:row.id},accountId);
      }
      const deadline=Date.now()+Math.min(240000,c.timeoutMs);
      // Poll only the original task. Back off when it makes no progress, but
      // never extend this invocation's existing query/recovery budget.
      let unchangedPolls=0,lastState:string|undefined,lastProgress:number|undefined;
      const waitForPoll=async()=>{
        const remaining=deadline-Date.now();if(remaining<=0)return;
        const delay=overrides?.pollMs??Math.round(Math.min(8000,2000*2**Math.min(unchangedPolls++,2))*(0.8+0.2*Math.random()));
        await new Promise<void>((resolve,reject)=>{
          const finish=()=>{request.signal.removeEventListener("abort",abort);resolve();};
          const timer=setTimeout(finish,Math.min(delay,remaining));
          const abort=()=>{clearTimeout(timer);request.signal.removeEventListener("abort",abort);reject(request.signal.reason);};
          request.signal.addEventListener("abort",abort,{once:true});if(request.signal.aborted)abort();
        });
      };
      while(Date.now()<deadline) {
        request.signal.throwIfAborted();
        adapterStage="poll";
        let raw:any;
        try{
          // A loop deadline alone does not bound a stalled response header or
          // body. Cancel the same GET at the remaining deadline, not a new one.
          raw=await json(`/v1/tasks/${encodeURIComponent(taskId!)}`,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))]),cache:"no-store"});
        }catch(error){
          const code=(error as {code?:string;cause?:{code?:string}})?.code||(error as {cause?:{code?:string}})?.cause?.code;
          const transient=error instanceof SupplierAdapterResponseError
            ? [408,429,500,502,503,504].includes(error.status)
            : ["ECONNRESET","ETIMEDOUT","EPIPE","UND_ERR_SOCKET","ERR_STREAM_PREMATURE_CLOSE","UND_ERR_CONNECT_TIMEOUT"].includes(code||"");
          if(!transient||request.signal.aborted||Date.now()>=deadline)throw error;
          try{await recordSupplierAdapterFailure(ledger.pool,row.id,adapterFailureEvidence(error,"poll"),false);}
          catch{console.error("[apimart-adapter] diagnostic-write-failed",{callId:row.id,stage:"poll"});}
          await waitForPoll();continue;
        }
        const receipt=apimartTask(raw,taskId!);
        // parseReceiptJson deliberately preserves numeric lexemes as strings
        // for money. Interpret only this scheduling hint, not accounting data.
        const rawProgress=raw.data?.progress;
        const progressNumber=typeof rawProgress==="number"?rawProgress:
          typeof rawProgress==="string"&&rawProgress.trim()!==""?Number(rawProgress):NaN;
        const progress=Number.isFinite(progressNumber)&&progressNumber>=0?progressNumber:undefined;
        if(receipt.state!==lastState||progress!==undefined&&(lastProgress===undefined||progress>lastProgress))unchangedPolls=0;
        lastState=receipt.state;if(progress!==undefined)lastProgress=progress;
        if(receipt.amountMicros==null&&receipt.usage&&procurement?.basis==="tokens") {
          const estimate=genericReceipt({status:receipt.state,usage:receipt.usage},receipt.state,procurement);
          if(estimate.amountMicros!=null)Object.assign(receipt,{amountMicros:estimate.amountMicros,currency:estimate.currency,status:"estimated",source:"usage-price-snapshot"});
        }
        await ledger.apply(row.id,receipt);
        const deliveryNotices:string[]=[];
        if(receipt.actualModel && receipt.actualModel!==c.wireModel)deliveryNotices.push("actual-model-differs");
        if(["failed","cancelled","canceled"].includes(receipt.state))return Response.json({error:{message:"APIMart任务失败，费用记录已保留",type:"supplier_failure",billing_status:"task_failed"}},{status:422});
        if(["completed","success","succeeded"].includes(receipt.state)) {
          const urls=raw.data?.result?.images?.flatMap((g:any)=>Array.isArray(g.url)?g.url:[])||[];
          if(!urls.length)throw new Error("APIMart returned no images");
          if(urls.length!==n)deliveryNotices.push("output-count-differs");
          const data=[],actualDimensions:{width?:number;height?:number}[]=[];
          for(const url of urls.slice(0,n)) {
           try{
            adapterStage="download";
            const parsed=new URL(url);
            if(parsed.protocol!=="https:"&&!options.trustedOrigins?.includes(parsed.origin))throw new Error("untrusted image protocol");
            const fetchMedia=overrides?.media||modelEndpointFetch(parsed.origin,options);
            let bytes:Buffer|undefined;
            for(let attempt=0;attempt<2;attempt++)try{
              const response=await fetchMedia(url,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(30000)]),redirect:"error",cache:"no-store"});
              if(!response.ok){await response.body?.cancel();throw new Error("APIMart image download failed");}
              bytes=Buffer.from(await readBoundedBytes(response,32*1024*1024));break;
            }catch(error){if(attempt===1||request.signal.aborted)throw error;}
            if(!bytes)throw new Error("APIMart image download empty");
            await sharp(bytes,{failOn:"error",limitInputPixels:100_000_000}).resize(1,1).raw().toBuffer();
            const meta=await sharp(bytes).metadata();
            const expected=p?(params.nativeRatio&&params.nativeResolution?p.outputDimensions?.[`${requested.resolution}:${requested.ratio}`]:undefined)
              : "expectedPixels" in params ? params.expectedPixels : undefined;
            if(expected&&(meta.width!==expected.width||meta.height!==expected.height))
              deliveryNotices.push("actual-pixels-differ");
            actualDimensions.push({width:meta.width,height:meta.height});
            data.push({b64_json:bytes.toString("base64")});
           }catch(error){if(request.signal.aborted)throw error;deliveryNotices.push("output-download-incomplete");}
          }
          if(!data.length)throw new Error("APIMart no decodable output downloaded");
          adapterStage="deliver";
          // Supplier completion is not yet customer delivery. A polling worker
          // may update the receipt, but only this pixel/download acceptance can
          // authorize billing for the output. No image URLs or prompt persist.
          await ledger.pool.query("UPDATE app_supplier_calls SET parameters=parameters || $2::jsonb WHERE id=$1",[row.id,JSON.stringify({acceptedOutputs:data.length,actualDimensions,deliveryNotices:[...new Set(deliveryNotices)],preparation:scope.frozen.feature==="image.aplus"&&unit.includes(":source:")})]);
          recordBillingUsage(receipt.usage,files.length>0);
          const payload=JSON.stringify({created:Math.floor(Date.now()/1000),data,usage:receipt.usage});
          // Preserve the existing whole-response bound without parsing and
          // decoding images a second time in the outer health/routing layers.
          if(Buffer.byteLength(payload,"utf8")>48*1024*1024)throw new Error("receipt too large");
          return validatedChannelImageResponse(new Response(payload,{headers:{"content-type":"application/json"}}));
        }
        await waitForPoll();
      }
      throw new ImageOperationPending(unit,new Error("APIMart任务仍在处理中"));
    }catch(error){
      const failure=adapterFailureEvidence(error,adapterStage);
      try { await recordSupplierAdapterFailure(ledger.pool,row.id,failure,generationPosted&&!taskId); }
      catch { console.error("[apimart-adapter] diagnostic-write-failed",{callId:row.id,stage:adapterStage}); }
      if(error instanceof ImageOperationDeferred && !taskId && claimed.rowCount){
        await ledger.pool.query("UPDATE app_supplier_calls SET parameters=NULL,state='pre-submission-failed' WHERE id=$1 AND task_id IS NULL AND parameters->>'requestHash'=$2",[row.id,requestHash]);
        throw error;
      }
      const explicitNotCharged=(error as {notCharged?:boolean})?.notCharged===true;
      if(!taskId&&(!generationPosted || explicitNotCharged || error instanceof ModelConfigError && error.code==="PROVIDER_BUSY")){
        if(explicitNotCharged)await ledger.apply(row.id,{state:"rejected",status:"reported",amountMicros:"0",currency:procurement?.currency||"USD",source:"explicit-not-charged",evidence:{...failure,source:"explicit-not-charged"}});
        if(scope.channelGuard?.operationKey)await ledger.pool.query("DELETE FROM app_model_channel_operations WHERE operation_key=$1 AND upstream_id=$2",[scope.channelGuard.operationKey,scope.channelGuard.upstreamId]);
        await ledger.pool.query("UPDATE app_supplier_calls SET parameters=NULL,state='pre-submission-failed' WHERE id=$1 AND task_id IS NULL",[row.id]);
        const busy=error instanceof ModelConfigError&&error.code==="PROVIDER_BUSY";
        const message=busy?"APIMart通道繁忙，未提交生图":explicitNotCharged?"APIMart明确拒绝受理，未产生生成费用":"APIMart参考图上传或参数校验失败，未提交生图";
        return Response.json({error:{message,billing_status:"not_charged"}},{status:busy?429:422,...(busy?{headers:{"x-naumi-local-capacity":"1"}}:{})});
      }
      // Every post-submission error, including invalid output/model, retains the original task and fee evidence.
      throw new ImageOperationPending(unit,error);
    }
  };
}

/** Compatibility name: the historical preset shares the same durable core. */
export const apimartPresetFetch = apimartImagesFetch;
