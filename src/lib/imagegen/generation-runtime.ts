import "server-only";
import {imageRatioValidationPolicy} from "@/lib/imagegen/request-size";
import {storedDeliveryCheckpoint} from "@/lib/imagegen/delivery-checkpoint";
import {withImagegenStep} from "@/lib/imagegen/context";
import {getPool} from "@/lib/db";
import {PostprocessPending} from "@/lib/media-postprocess";
import {currentModelExecution} from "@/lib/model-config/context";
import {auditSettledImage} from "@/lib/image-quality-request";
import {resolveConfiguredImageQuality} from "@/lib/model-config/image-quality";
import {dbEnabled,getUser} from "@/lib/db";
import {safeError} from "@/lib/api-error";
import {getOpenAISettings} from "@/lib/settings";
import {getImageModelCatalog, type ImageModelDescriptor} from "@/lib/image-model-catalog";
import {isQualityUnsupportedError} from "@/lib/image-quality";
import {ImageOperationPending} from "@/lib/image-gateway";
import {assertUserImageBaseUrlAllowed, restoreUserImageProvider, upstreamUserImageModel} from "@/lib/user-image-provider";
import type {GenParams,GeneratedImage} from "./generation-types";
import {openaiImages,newApiFlowImages,mockImages} from "./generation-provider";
import {JOBS} from "./generation-jobs";
import {completeImageDelivery} from "./complete-image-delivery";
export {JOBS} from "./generation-jobs";

export async function runJob(
  jobId: string,
  p: GenParams,
  apiKey: string,
  imageModel: ImageModelDescriptor,
  cutoutModel: string,
  defaultModel: string,
  userProvider: { baseUrl: string; apiKey: string; model: string } | null,
  useDb: boolean,
  cost: number,
  deliveryAttempt = 0
) {
  let billingSettled = false;
  let deliveryStage = "supplier-result";
  try {
    const saved = await JOBS.get(jobId);
    const checkpoint=saved&&storedDeliveryCheckpoint(saved);
    let images:GeneratedImage[], final=false;
    if(saved?.images?.length&&saved.deliveryComplete!==false){images=saved.images;final=true;}
    else if(checkpoint?.allDone){images=checkpoint.images as GeneratedImage[];final=checkpoint.final;}
    else if(deliveryAttempt>0)throw Error("原结果交付检查点缺失");
    else if (imageModel.provider === "user-chat-completions" && userProvider) {
      images = await JOBS.paidOperation(jobId, "flow:" + userProvider.model, { id: jobId }, () => newApiFlowImages(p, userProvider.model, {
        baseUrl: userProvider.baseUrl,
        apiKey: userProvider.apiKey,
      }));
    } else if (imageModel.provider === "user-openai-images" && userProvider) {
      // 质量参数回退:BYOK 上游报错不识别 quality(连默认档也不收)时,切换默认
      // API(td key)+默认档重试一次,与老链路出图完全一致;计费不变。
      images = await JOBS.paidOperation(jobId, userProvider.model, { id: jobId, managedGateway: false, resolution: p.resolution as "1K" | "2K" | "4K", quality: p.quality, preserveIdentity: p.images.length > 0 }, async () => {
        try {
          return await openaiImages(
            p,
            userProvider.apiKey,
            userProvider.model,
            userProvider.model,
            userProvider.baseUrl,
            { auditUpstream: `byok:${userProvider.model}` }
          );
        } catch (e) {
          if (!apiKey || !defaultModel || !isQualityUnsupportedError(e)) throw e;
          console.error(`[gen-quality-fallback] BYOK 不支持质量参数,回退默认 API: job=${jobId} provider=${userProvider.model}`);
          // 使用提交时固化的默认档，成功结果中保留供应商回退信息。
          return openaiImages(
            { ...p, quality: p.qualityDefault || resolveConfiguredImageQuality("").executed },
            apiKey,
            defaultModel,
            cutoutModel,
            undefined,
            { auditUpstream: `default:${defaultModel} (from byok:${userProvider.model})`, providerFallback: true }
          );
        }
      });
    } else if (imageModel.provider === "new-api-flow" && !p.transparent) {
      images = await JOBS.paidOperation(jobId, "flow:" + imageModel.id, { id: jobId }, () => newApiFlowImages(p, imageModel.id));
    } else {
      images = apiKey
        ? await JOBS.paidOperation(jobId, imageModel.id, {
            id: jobId, resolution: p.resolution as "1K" | "2K" | "4K", quality: p.quality, ratio:p.ratio,
            task: p.category === "detail" ? "detail" : p.images.length ? "product" : "draft",
            preserveIdentity: p.images.length > 0,
          }, () => openaiImages(p, apiKey, imageModel.id, cutoutModel, undefined, { auditUpstream: `default:${imageModel.id}` }))
        : mockImages(p);
    }
    // Persisted supplier metadata is authoritative; legacy Flow had no quality field.
    if(!final&&(imageModel.provider==="user-chat-completions"||imageModel.provider==="new-api-flow"))images=images.map(image=>({...image,execution:image.execution||{
      quality:p.qualityDefault||"medium",upstream:userProvider?`byok:${userProvider.model}`:`flow:${imageModel.id}`,
      reason:p.quality!==p.qualityDefault?"quality-downgrade":"generated",platformFunded:!userProvider,
    }}));
    const scope=currentModelExecution("image");
    const delivery=await completeImageDelivery({jobId,owner:p.email,params:p,images,final,useDb,legacyCost:userProvider?0:cost,
      mock:!apiKey&&!userProvider&&imageModel.provider!=="new-api-flow",
      policy:{known:true,modelVersion:scope?.frozen.modelVersion,post:scope?.businessOption?.postprocess,preset:!!scope?.imagePreset,
        ratio:scope?imageRatioValidationPolicy(scope.supplierRouting?scope.supplierRouting.targets.map(target=>target.scope.connection):[scope.connection]):undefined},
      stage:value=>{deliveryStage=value;},
    });
    images=delivery.images;billingSettled=delivery.billing.confirmed;
    const {imagegenOutputError,imagegenOutputWarning}=delivery;
    const user=useDb?await getUser(p.email).catch(()=>null):null;
    // Audit successful, settled images using persisted execution metadata.
    const chargedCredits = delivery.billing.chargedCredits;
    for (const image of billingSettled?images:[]) {
      const execution = image.execution || { quality: p.quality || p.qualityDefault || "medium", upstream: userProvider ? `byok:${userProvider.model}` : `default:${imageModel.id}`, reason: "generated", platformFunded: !userProvider && !!apiKey };
      await auditSettledImage(p.email,chargedCredits/images.length,{requested:saved?.quality?.requested||"medium",executed:execution.quality as import("@/lib/image-quality").ExecutedQuality,fallbackReason:null},jobId,image.id,p.resolution,execution);
    }
    const executedQualities = images.map(image => image.execution?.quality || p.quality || p.qualityDefault || "medium");
    const quality = saved?.quality ? { ...saved.quality, executed: new Set(executedQualities).size > 1 ? "mixed" : executedQualities[0], executedQualities,
      fallbackReason: images.some(image => image.execution?.reason === "provider-fallback") ? "provider-fallback" : images.some(image => image.execution?.reason === "quality-downgrade") ? "upstream-unsupported" : saved.quality.fallbackReason } : undefined;
    deliveryStage = "final-receipt";
    await JOBS.patch(jobId, {
      status: "done",
      error:undefined,
      deliveryComplete:delivery.complete,
      billingStatus:billingSettled?"confirmed":"unavailable",
      images,
      user,
      creditsUsed: chargedCredits,
      mock:
        !apiKey &&
        !userProvider &&
        imageModel.provider !== "new-api-flow",
      mode: p.images.length > 0 ? "edit" : "generate",
      persisted: useDb,
      createdAt: saved?.createdAt||Date.now(),
      quality,
      imagegenOutputError,
      imagegenOutputWarning,
    });
  } catch (e) {
    if (e instanceof ImageOperationPending) { await JOBS.handlePending(jobId, e); return; }
    if (e instanceof PostprocessPending) {
      const exhausted = e instanceof PostprocessPending && (await getPool().query("SELECT 1 FROM app_media_postprocess WHERE operation_id=$1 AND attempts>=3",[e.operationId])).rowCount;
      await JOBS.patch(jobId, { status: exhausted ? "error" : "pending", error: e.message });
      return;
    }
    const retained = await JOBS.get(jobId, false);
    const checkpoint=retained&&storedDeliveryCheckpoint(retained);
    if(checkpoint){
      // Do not log raw messages: they may contain prompts, URLs or credentials.
      const failure={stage:deliveryStage,name:e instanceof Error?e.name:"Error",code:String((e as {code?:unknown})?.code||"DELIVERY_FAILED").replace(/[^A-Za-z0-9_-]/g,"").slice(0,64)};
      console.error("[generate-image] delivery failed",JSON.stringify({jobId,...failure,attempt:deliveryAttempt+1}));
      await JOBS.patch(jobId,{deliveryAttempts:deliveryAttempt+1,deliveryFailure:failure});
      if(deliveryAttempt<2&&checkpoint.allDone){
        await new Promise(resolve=>setTimeout(resolve,250*(deliveryAttempt+1)));
        // The retry branch reads only stored bytes, bypassing every supplier call.
        return runJob(jobId,p,apiKey,imageModel,cutoutModel,defaultModel,userProvider,useDb,cost,deliveryAttempt+1);
      }
      await JOBS.patch(jobId,{status:"error",error:"图片已生成，正在恢复交付"});return;
    }
    if (useDb && !billingSettled) await JOBS.settleResults(jobId, 0, "图片生成失败",{state:"failed",items:[]});
    // 原始上游 message 可能含 openai/gpt/quota 等字样,经 safeError 净化后再落库,
    // 避免随 GET 轮询回传给用户暴露所用模型。详细原因只打服务端日志。
    console.error(
      "[generate-image] job failed:",
      e instanceof Error ? e.message : e
    );
    await JOBS.set(jobId, {
      ...(await JOBS.get(jobId,false)),
      status:"error",
      error: safeError(e, "图片生成失败,请稍后重试"),
      createdAt: Date.now(),
    });
  }
}

export async function kickGeneration(id: string) {
  await JOBS.kick(id, async (payload) => {
    const p = payload.p as GenParams;
    const settings = await getOpenAISettings();
    if (payload.byok && typeof payload.byokSnapshot !== "string") {
      await JOBS.patch(id, { status: "needs_attention", error: "旧任务缺少自定义接口快照，已暂停提交，请联系管理员核查" });
      return;
    }
    const provider = payload.byok ? restoreUserImageProvider(p.email, payload.byokSnapshot as string) : null;
    const imageModel: ImageModelDescriptor | undefined = provider ? {
      id: p.model, label: `自定义 · ${upstreamUserImageModel(p.model)}`,
      provider: provider.protocol === "chat-completions" ? "user-chat-completions" : "user-openai-images",
      supportsEdit: provider.protocol === "chat-completions" || upstreamUserImageModel(p.model).startsWith("gpt-image"),
    } : (await getImageModelCatalog(p.email)).find((model) => model.id === p.model);
    if (!imageModel) throw new Error("任务模型暂时不可用");
    if (payload.byok && !provider) throw new Error("自定义图片接口暂时不可用");
    if (provider) await assertUserImageBaseUrlAllowed(provider.baseUrl);
    const execute=()=>runJob(id, p, settings.apiKey, imageModel, settings.cutoutModel, settings.model,
      provider ? { ...provider, model: upstreamUserImageModel(p.model) } : null,
      dbEnabled && !!p.email, Number(payload.cost));
    if(p.imagegen)await withImagegenStep(p.imagegen.request,p.imagegen.intent,execute);else await execute();
  });
}
