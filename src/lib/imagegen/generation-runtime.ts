import "server-only";
import {imageRatioValidationPolicy} from "@/lib/imagegen/request-size";
import {imageRatioWarning, imageOutputNotice} from "@/lib/imagegen/output-advisory";
import {storedDeliveryCheckpoint} from "@/lib/imagegen/delivery-checkpoint";
import {withImagegenStep} from "@/lib/imagegen/context";
import {inspectImagegenPixels} from "@/lib/imagegen/postprocess";
import {getPool} from "@/lib/db";
import {readManagedObject} from "@/lib/storage";
import {runPostprocess, PostprocessPending} from "@/lib/media-postprocess";
import {currentModelExecution} from "@/lib/model-config/context";
import {auditSettledImage} from "@/lib/image-quality-request";
import {resolveConfiguredImageQuality} from "@/lib/model-config/image-quality";
import {DurableImageJobs} from "@/lib/durable-image-jobs";
import {provenanceEntry} from "@/lib/artwork-provenance";
import {dbEnabled, addArtworks, ensureTemplateRoot, getUser, getImageJobChargedCredits} from "@/lib/db";
import {safeError} from "@/lib/api-error";
import {storageEnabled, uploadImage, dataUrlToBytes} from "@/lib/storage";
import {getOpenAISettings} from "@/lib/settings";
import {getImageModelCatalog, type ImageModelDescriptor} from "@/lib/image-model-catalog";
import {isQualityUnsupportedError} from "@/lib/image-quality";
import {ImageOperationPending} from "@/lib/image-gateway";
import {assertUserImageBaseUrlAllowed, restoreUserImageProvider, upstreamUserImageModel} from "@/lib/user-image-provider";
import type {GenParams,GeneratedImage} from "./generation-types";
import {buildPrompt,ratioPrompt} from "./generation-prompt";
import {openaiImages,newApiFlowImages,mockImages} from "./generation-provider";
import {enforceOutputShape,attachImageDimensions,upscaleImages,persistToStorage} from "./generation-output";
type Job = {
  status: "pending" | "done" | "error" | "needs_attention";
  images?: GeneratedImage[];
  user?: Awaited<ReturnType<typeof getUser>>;
  creditsUsed?: number;
  mock?: boolean;
  mode?: string;
  persisted?: boolean;
  error?: string;
  imagegenOutputError?:string;
  imagegenOutputWarning?:string;
  deliveryAttempts?:number;
  deliveryFailure?:{stage:string;name:string;code:string};
  createdAt: number;
  sourceUrl?: string | null;
  /** 质量审计:请求档 vs 实际执行档与回退原因(通道不支持时回退默认档)。 */
  quality?: { requested: string; executed: string; fallbackReason: string | null; executedQualities?: string[] };
};

export const JOBS = new DurableImageJobs<Job>("generate");

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
    const priorNotice = imageOutputNotice(saved?.imagegenOutputError, saved?.imagegenOutputWarning, !!saved?.images?.length);
    let imagegenOutputError=priorNotice.error;
    let imagegenOutputWarning=priorNotice.warning;
    let images: GeneratedImage[];
    if (saved?.images?.length) images = saved.images;
    else {
    if(deliveryAttempt>0){
      const checkpoint=saved&&storedDeliveryCheckpoint(saved);
      if(!checkpoint?.allDone)throw Error("原结果交付检查点缺失");
      images=checkpoint.images as GeneratedImage[];
    } else if (imageModel.provider === "user-chat-completions" && userProvider) {
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
    // Chat-completions channels have no quality parameter; audit their default tier.
    if (imageModel.provider === "user-chat-completions" || imageModel.provider === "new-api-flow") {
      images = images.map(image => ({ ...image, execution: {
        quality: p.qualityDefault || "medium",
        upstream: userProvider ? `byok:${userProvider.model}` : `flow:${imageModel.id}`,
        reason: p.quality !== p.qualityDefault ? "quality-downgrade" : "generated",
        platformFunded: !userProvider,
      } }));
    }
    deliveryStage = "output-processing";
    const scope = currentModelExecution("image"), post = scope?.businessOption?.postprocess;
    const ratioPolicy = scope ? imageRatioValidationPolicy(scope.supplierRouting ? scope.supplierRouting.targets.map(target => target.scope.connection) : [scope.connection]) : undefined;
    let nativeRatioChecked = false;
    if(p.transparent){for(const image of images){const raw=dataUrlToBytes(image.url);const pixels=await inspectImagegenPixels(raw?Buffer.from(raw.bytes):(await readManagedObject(image.url,64*1024*1024)).bytes);if(!pixels.transparentPixels||!pixels.visiblePixels)imagegenOutputError="模型未返回有效透明主体；已生成原图保留，实际生成积分已结算，请调整透明能力配置";}}
    if(imagegenOutputError){await JOBS.patch(jobId,{imagegenOutputError});}
    else if (post?.enabled) {
      images = await Promise.all(images.map(async (image,index) => {
        const decoded = dataUrlToBytes(image.url);
        const bytes = decoded ? Buffer.from(decoded.bytes) : (await readManagedObject(image.url,64*1024*1024)).bytes;
        const result = await runPostprocess({ id: `${jobId}:postprocess:${index}`, parentId:jobId, email:p.email, modelVersion:scope!.frozen.modelVersion, bytes, policy:post });
        return { ...image,url:result.url,width:result.width,height:result.height,processingKind:result.kind,postprocessStatus:result.status };
      }));
    } else {
    images = await enforceOutputShape(images, p);
    if (!scope?.imagePreset && !(p.targetWidth > 0 && p.targetHeight > 0)) {
      // Validate the supplier's native grid before an existing, administrator-
      // permitted local upscale. Its rounding cell must not be measured in 4K
      // pixels, and no crop/reshape is introduced to satisfy this validation.
      if (ratioPolicy && p.ratioContractVersion && p.origin === "canvas") {
        images = await attachImageDimensions(images);
        imagegenOutputWarning ||= images.map(image => imageRatioWarning(p.ratio, image, ratioPolicy)).find(Boolean);
        nativeRatioChecked = true;
      }
      images = await upscaleImages(images, p.resolution);
    }
    }
    images = await attachImageDimensions(images);
    if (!nativeRatioChecked && p.ratioContractVersion && p.origin === "canvas" && !(p.targetWidth > 0 && p.targetHeight > 0)) {
      imagegenOutputWarning ||= images.map(image => imageRatioWarning(p.ratio, image, ratioPolicy)).find(Boolean);
    }
    images = images.map((image, index) => ({ ...image, id: `art-${jobId}-${index}` }));
    deliveryStage = "storage";
    images = await persistToStorage(images);
    // Keep quality notices with the original result without rejecting delivery.
    // Recovery must not re-POST a paid image to chase a preferred ratio.
    deliveryStage = "image-checkpoint";
    await JOBS.patch(jobId, { images, imagegenOutputError, imagegenOutputWarning });
    }
    // Persist the first uploaded source image so "再次生成" can restore it.
    let sourceUrl: string | null = saved?.sourceUrl || null;
    if (!sourceUrl && p.images[0] && storageEnabled) {
      try {
        const first = p.images[0];
        const ext = (first.type || "image/png").split("/")[1] || "png";
        sourceUrl = await uploadImage(
          first.buf,
          first.type || "image/png",
          `sources/${jobId}.${ext}`
        );
      } catch {
        /* non-fatal */
      }
    }

    await JOBS.patch(jobId, { sourceUrl });
    let user: Awaited<ReturnType<typeof getUser>> = null;
    if (useDb) {
      const title =
        p.prompt.length > 16 ? `${p.prompt.slice(0, 16)}…` : p.prompt;
      const batchId = `b-${jobId}`;
      // 血缘父节点:优先用显式 parentId;否则若来自模板「做同款」,在用户名下
      // 找/建该模板的"模板原图"根节点,本次生成挂它下面。
      let parent: string | null = p.parentId || null;
      if (!parent && p.templateId && p.templateImage) {
        parent = await ensureTemplateRoot(p.email, {
          templateId: p.templateId,
          image: p.templateImage,
          prompt: p.templatePrompt || p.prompt,
          title: p.templatePrompt || p.prompt,
        }).catch(() => null);
      }
        deliveryStage = "artworks";
        await addArtworks(
          p.email,
          images.map((im) => ({
            id: im.id,
            title,
            category: p.category,
            // 落库只存用户原始提示词(有就用,空则退回完整 prompt),保护系统提示词不外泄。
            prompt: p.userPrompt || p.prompt,
            status: "completed",
            image: im.url,
            gradient: im.gradient,
            style: p.style || null,
            ratio: im.ratio || p.ratio || null,
            resolution: p.resolution || null,
            source: sourceUrl,
            parentId: parent,
            parentIds: p.parentIds.filter((x) => x && x !== parent),
            groupId: p.projectGroupId || undefined,
            origin: p.origin || null,
            creationProvenance: { version: 1, operation: "generate", entry: p.origin === "canvas" ? "canvas" : provenanceEntry(p.entry), ref: jobId, evidence: "server-route" },
            width: im.width ?? null,
            height: im.height ?? null,
            processingKind: im.processingKind ?? null,
            postprocessStatus: im.postprocessStatus ?? null,
          })),
          batchId
        );
      // 按提交时的单张报价结算；部分成功和后续配置变化不会重算价目。
      const actualCost = userProvider ? 0 : images.length * (cost / p.count);
      deliveryStage = "settlement";
      await JOBS.settleResults(jobId, actualCost, `生成 ${images.length} 张图`,{state:"succeeded",items:images.map(image=>({id:image.id,state:"succeeded",executedQuality:image.execution?.quality||p.quality||"medium",platformFunded:image.execution?.platformFunded}))});
      billingSettled = true;
      user = await getUser(p.email).catch(() => null);
    }


    // Audit successful, settled images using persisted execution metadata.
    const chargedCredits = await getImageJobChargedCredits(jobId);
    for (const image of images) {
      const execution = image.execution || { quality: p.quality || p.qualityDefault || "medium", upstream: userProvider ? `byok:${userProvider.model}` : `default:${imageModel.id}`, reason: "generated", platformFunded: !userProvider && !!apiKey };
      await auditSettledImage(p.email,chargedCredits/images.length,{requested:saved?.quality?.requested||"medium",executed:execution.quality as import("@/lib/image-quality").ExecutedQuality,fallbackReason:null},jobId,image.id,p.resolution,execution);
    }
    const executedQualities = images.map(image => image.execution?.quality || p.quality || p.qualityDefault || "medium");
    const quality = saved?.quality ? { ...saved.quality, executed: new Set(executedQualities).size > 1 ? "mixed" : executedQualities[0], executedQualities,
      fallbackReason: images.some(image => image.execution?.reason === "provider-fallback") ? "provider-fallback" : images.some(image => image.execution?.reason === "quality-downgrade") ? "upstream-unsupported" : saved.quality.fallbackReason } : undefined;
    deliveryStage = "final-receipt";
    await JOBS.set(jobId, {
      status: "done",
      images,
      user,
      creditsUsed: chargedCredits,
      mock:
        !apiKey &&
        !userProvider &&
        imageModel.provider !== "new-api-flow",
      mode: p.images.length > 0 ? "edit" : "generate",
      persisted: useDb,
      createdAt: Date.now(),
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
