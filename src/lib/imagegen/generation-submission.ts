import {imageExecutionSizingModel} from "../model-config/context";
import "server-only";
import {exactImageRequestSize, ExactImageSizeError} from "@/lib/imagegen/request-size";
import {unsupportedReverseHubRatio, REVERSE_HUB_RATIO_MESSAGE} from "@/lib/imagegen/ratio-support";
import {currentImagegenStep} from "@/lib/imagegen/context";
import {legacyImagegenIntent} from "@/lib/imagegen/legacy-intent";
import {currentModelExecution} from "@/lib/model-config/context";
import {featureForRequest} from "@/lib/model-config/feature-path";
import {assertPlatformImageSelection} from "@/lib/model-config/selection-policy";
import {resolveConfiguredImageQuality} from "@/lib/model-config/image-quality";
import { TeamError } from "@/lib/teams/errors";
import {imageQualityCost} from "@/lib/image-quality-request";
import {BillingError} from "@/lib/billing/types";
import {MAX_GENERATION_DIMENSION, resolutionForLongSide} from "@/lib/mock-data";
import {sweepStaleReservations} from "@/lib/billing/reservations";
import {dbEnabled} from "@/platform/db/pool";
import {isBanned} from "@/lib/accounts/repository";
import {safeError} from "@/lib/api-error";
import {getOpenAISettings} from "@/lib/settings";
import {getStyleGuide} from "@/lib/prompt-config";
import {getImageModelCatalog, getUserDefaultImageModel} from "@/lib/image-model-catalog";
import {routeImageModel} from "@/lib/image-model-routing";
import {assertUserImageBaseUrlAllowed, getUserImageProvider, freezeUserImageProvider, upstreamUserImageModel, USER_IMAGE_MODEL_PREFIX} from "@/lib/user-image-provider";
import type {GenParams,GenerationBody,GenerationResult} from "./generation-types";
import type {BillingFacts,BillingQuote} from "../billing/types";
import {billingFailure} from "../billing/request";
import {buildPrompt,ratioPrompt} from "./generation-prompt";
import {JOBS} from "./generation-jobs";
import {kickGeneration} from "./generation-runtime";
export type GenerationContext={actor:()=>Promise<string|null>;ip:string|null;featureModel?:string|null;quote:(facts:Partial<BillingFacts>&{feature:BillingFacts["feature"];quantity:number;ratio?:string},options:{allowResolutionFallback:boolean})=>Promise<BillingQuote|undefined>};
export function generationResult(body:GenerationBody,options?:{status:number}):GenerationResult{return {body,status:options?.status??200};}
export function generationBillingError(error:unknown):GenerationResult {const {status,...body}=billingFailure(error);return {status,body};}
export async function submitGeneration(p: GenParams, context: GenerationContext): Promise<GenerationResult> {
  p.ratioContractVersion = currentImagegenStep() ? currentImagegenStep()!.ratioContractVersion : 2;
  try { assertPlatformImageSelection(p.model, context.featureModel); }
  catch (error) { return generationBillingError(error); }
  // 改比例(ratiogen)用固定重构图指令,可以没有用户提示词;其余路径仍要求 prompt。
  const advanced=currentImagegenStep();
  const inferred=advanced?.intent||legacyImagegenIntent({prompt:p.userPrompt||p.prompt,transparent:p.transparent,origin:p.origin},p.images.length);
  if(inferred?.conflicts.length)return generationResult({error:inferred.conflicts.join("；")},{status:400});
  if(inferred?.background!==null&&inferred?.background!==undefined)p.transparent=inferred.background==="transparent";
  if(advanced)p.imagegen=structuredClone(advanced);
  if (!p.prompt && !p.ratiogen) {
    return generationResult({ error: "prompt 不能为空" }, { status: 400 });
  }
  const hasCustomWidth = p.targetWidth !== 0;
  const hasCustomHeight = p.targetHeight !== 0;
  if (
    hasCustomWidth !== hasCustomHeight ||
    p.targetWidth < 0 || p.targetHeight < 0 ||
    p.targetWidth > MAX_GENERATION_DIMENSION || p.targetHeight > MAX_GENERATION_DIMENSION ||
    (hasCustomWidth && (p.targetWidth < 64 || p.targetHeight < 64))
  ) {
    return generationResult(
      { error: `自定义尺寸需同时填写 64–${MAX_GENERATION_DIMENSION} 的宽和高` },
      { status: 400 }
    );
  }
  if (hasCustomWidth) p.resolution = resolutionForLongSide(Math.max(p.targetWidth, p.targetHeight));
  if (p.images.some((im) => im.buf.length > 12 * 1024 * 1024)) {
    return generationResult(
      { error: "单张上传图片过大（请 < 12MB）" },
      { status: 400 }
    );
  }

  try {
  const { apiKey, model: defaultModel, cutoutModel } = await getOpenAISettings();
  const ip = context.ip;


  // 先解析真实登录账号，再生成该账号专属模型目录；不能让客户端用 email 指向他人配置。
  let actorEmail: string | null = null;
  if (dbEnabled) {
    actorEmail = await context.actor();
    if (!actorEmail) {
      return generationResult(
        { error: "请先登录后再生成" },
        { status: 401 }
      );
    }
    p.email = actorEmail;
  }

  // New legacy frames were resolved before model binding in POST. Do not choose
  // the first product image here after the quote/model facts have been frozen.

  const userDefaultModel = actorEmail
    ? await getUserDefaultImageModel(actorEmail)
    : null;
  const catalog = await getImageModelCatalog(actorEmail);
  const imageScope = currentModelExecution("image");
  // Managed admission already resolved the public model against the frozen
  // quote/frame. Tool entry points must not route a second directional alias.
  const acceptedModel = imageScope?.frozen.publicModelId;
  const requestedModel = acceptedModel || p.model || userDefaultModel || defaultModel;
  const model = acceptedModel || routeImageModel(requestedModel, p.ratio, catalog);
  const imageModel = catalog.find((item) => item.id === model);
  if (!imageModel) {
    return generationResult(
      {
        error: model.startsWith(USER_IMAGE_MODEL_PREFIX)
          ? "自定义图片接口已停用或模型已移除，请到账号中心重新配置"
          : "所选生图模型不可用，请刷新模型列表后重试",
      },
      { status: 400 }
    );
  }
  if (model !== requestedModel) {
    console.info(
      `[gen-model-route] requested=${requestedModel} routed=${model} ratio=${p.ratio} resolution=${p.resolution}`
    );
  }
  if (p.images.length > 0 && !imageModel.supportsEdit) {
    return generationResult(
      { error: "所选模型不支持参考图生成，请切换图生图模型" },
      { status: 400 }
    );
  }
  // Reject a new local size-contract error BEFORE quote/reservation/job creation.
  // The worker branch above resumes its original frozen contract unchanged.
  if(imageScope){
    const candidates=imageScope.supplierRouting?.targets.map(t=>t.scope)||[imageScope];
    if(candidates.length&&candidates.every(candidate=>unsupportedReverseHubRatio(p.ratio,candidate.connection.options?.imageAdapter)))
      return generationResult({error:REVERSE_HUB_RATIO_MESSAGE,code:"IMAGEGEN_RATIO_UNSUPPORTED",accepted:false},{status:422});
  }
  if (p.ratioContractVersion && imageModel.provider !== "user-openai-images" && imageModel.provider !== "user-chat-completions") {
    try { exactImageRequestSize(p.ratio, imageExecutionSizingModel(imageScope) || model, p.ratioContractVersion === 2); }
    catch (error) {
      if (error instanceof ExactImageSizeError) return generationResult({error:error.message,code:error.code,accepted:false},{status:400});
      throw error;
    }
  }
  let userProvider: { baseUrl: string; apiKey: string; model: string } | null = null;
  let byokSnapshot: string | undefined;
  if (
    imageModel.provider === "user-openai-images" ||
    imageModel.provider === "user-chat-completions"
  ) {
    const configured = actorEmail ? await getUserImageProvider(actorEmail) : null;
    const upstreamModel = upstreamUserImageModel(imageModel.id);
    if (
      !configured ||
      !configured.baseUrl ||
      !configured.apiKey ||
      !configured.models.includes(upstreamModel)
    ) {
      return generationResult(
        { error: "当前账号的自定义图片接口配置不完整，请重新保存后再试" },
        { status: 400 }
      );
    }
    await assertUserImageBaseUrlAllowed(configured.baseUrl);
    byokSnapshot = freezeUserImageProvider(p.email, configured);
    userProvider = {
      baseUrl: configured.baseUrl,
      apiKey: configured.apiKey,
      model: upstreamModel,
    };
  }
  const useDb = dbEnabled && p.email.length > 0;
  // 改比例只出 1 张,固定按 1 张计费(防止 count 被改大而超扣)。
  if (p.ratiogen) p.count = 1;
  // BYOK(用户自带接口)豁免计费:算力与费用都发生在用户自己的上游,
  // 站内不预扣、不结算、不记流水。
  // 按请求质量基础价叠加尺寸差价，提交时固定报价。
  // 选档→扣费→结算链路;请求档进任务审计,恢复/重放后结算口径不变。
  const qualityAudit = resolveConfiguredImageQuality(p.quality);
  const billingQuote=useDb?await context.quote({feature:featureForRequest("/api/generate-image",p)!,quantity:p.count,quality:qualityAudit.requested||"medium",resolution:p.resolution,ratio:p.ratio,modelId:imageModel.id},{allowResolutionFallback:!p.targetWidth&&!p.targetHeight}):undefined;
  // A new accepted tier fallback is frozen before the job is persisted. Old
  // job payloads/recovery are never reinterpreted or enlarged to fake 4K.
  if (!p.targetWidth && !p.targetHeight) p.resolution=billingQuote?.effectiveParameters?.resolution || imageScope?.frozen.facts?.requestedResolution || p.resolution;
  const cost = billingQuote?.requestedCredits ?? (userProvider ? 0 : p.count * await imageQualityCost(qualityAudit, p.resolution));

  if (dbEnabled && (await isBanned(p.email, ip))) {
    return generationResult(
      { error: "账号或 IP 已被封禁，请联系管理员" },
      { status: 403 }
    );
  }

  if (useDb) await sweepStaleReservations(billingQuote?.staleReservationMinutes).catch(() => {});
  const jobId = `job-${crypto.randomUUID()}`;
  // 质量参数:入口即解析。p.quality 固化为实际执行档(恢复/重放确定性),
  // 请求档与回退原因进任务审计快照,供后台核对「请求了什么、跑了什么」。
  p.quality = qualityAudit.executed;
  p.qualityDefault = resolveConfiguredImageQuality("").executed;
  p.compiledPrompt = p.ratiogen ? ratioPrompt(p) : buildPrompt(p, await getStyleGuide());
  p.model = imageModel.id;
  try {
  await JOBS.create(jobId, p.email, { status: "pending", createdAt: Date.now(), quality: qualityAudit }, { p, cost, byok: !!userProvider, byokSnapshot }, cost, true,billingQuote);
  } catch(error) {
    if(error instanceof TeamError)return generationResult({error:error.message},{status:error.status});
    const message=error instanceof Error ? error.message : "";
    return generationResult({error:safeError(error,"任务保存失败，请稍后重试")},{status:message.includes("积分不足") ? 402 : 503});
  }
  await kickGeneration(jobId).catch(error=>console.error("[image-job] deferred kickoff:",error instanceof Error ? error.message : "unknown"));

  return generationResult({ jobId });
  } catch (e) {
    // 兜底:任何未预期异常都回 JSON,避免前端拿到纯文本 500("Internal Server Error")
    if(e instanceof BillingError)return generationBillingError(e);
    return generationResult(
      { error: safeError(e, "生成服务暂时不可用,请稍后重试") },
      { status: 500 }
    );
  }
}
