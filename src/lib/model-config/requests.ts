import {publicUpstreamIds} from "./channel-policy";
import {assertDisplayResolution} from "./resolution-options";
import { featureForRequest } from "./feature-path";
import { requestedFeatureModel, assertPlatformImageSelection } from "./selection-policy";
import {qualityPresentation} from "./quality-policy";
import { selectedBusinessOption, FEATURE_BINDINGS } from "./business";
import "server-only";
import { dbEnabled, getPool } from "../db";
import { getModelAdministration } from "./server";
import { getModelExecutor } from "./execution";
import { legacyModelExecutionActive, type ExecutionBundle } from "./context";
import { ModelConfigError, type ModelFacts } from "./types";
import type { ModelBinding } from "./bindings";
import { resolutionForLongSide } from "../mock-data";
import { acceptedModelVersions } from "./accepted-context";
import { effectiveImageParameters, selectedImagePreset, presetPublicId } from "./image-preset";
import { routeImageModel } from "../image-model-routing";
import { featureDefaultModel } from "./tool-scope";

export async function modelConfigurationEnabled() {
  if (!dbEnabled || legacyModelExecutionActive()) return false;
  if (process.env.NAUMI_ROUTER_MANAGEMENT_URL) return true;
  const table = (await getPool().query("SELECT to_regclass('app_model_config_state') AS name")).rows[0]?.name;
  if (table && (await getPool().query("SELECT 1 FROM app_model_config_state WHERE singleton=true")).rowCount) throw new ModelConfigError("CONFIG_UNAVAILABLE", "模型配置连接丢失，请联系管理员核对", 503);
  return false;
}
async function requestFacts(request: Request) {
  let body: Record<string, any> = {}, references = 0;
  if (!["POST", "PUT"].includes(request.method)) return { body, references };
  const copy = request.clone();
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await copy.formData();
      for (const [key, value] of Array.from(form.entries())) {
        if (/mask/i.test(key) && typeof value !== "string") body.needsMask = true;
        if (typeof value === "string") body[key] = value;
        else if (/image|reference|original|product|file/i.test(key) && !/mask/i.test(key)) references++;
      }
    } else if (request.headers.get("content-type")?.includes("json")) {
      body = await copy.json();
      references = Array.isArray(body.images) ? body.images.length : Array.isArray(body.sourceIds) ? body.sourceIds.length : Array.isArray(body.contextIds) ? body.contextIds.length : body.anchorId ? 1 : body.image || body.imageUrl || body.originalUrl || body.artworkId ? 1 : 0;
    }
  } catch { /* The route owns detailed payload validation; no generation is performed here. */ }
  return { body, references: Math.min(32, references) };
}
function imageRatio(width:number,height:number) { const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a; const g=gcd(Math.round(width),Math.round(height)); return `${Math.round(width)/g}:${Math.round(height)/g}`; }
function purposeFor(path: string): { image?: ModelBinding; text?: ModelBinding; vision?: ModelBinding; video?: ModelBinding; primary: "image" | "text" | "vision" | "video" } {
  if (path === "/api/video/generate") return { video: "video.generate", primary: "video" };
  if (path === "/api/agent") return { text: "agent.text", vision: "agent.vision", primary: "text" };
  if (path.includes("verify-image")) return { vision: "vision.review", primary: "vision" };
  if (path.includes("/canvas/ocr")) return { vision: "vision.ocr", primary: "vision" };
  if (path.includes("title-gen")) return { text: "text.title", primary: "text" };
  if (path.includes("replicate/analyze") || /\/competitors\/[^/]+\/action/.test(path) || path.includes("ipcheck")) return { text: "text.competitor", vision: "vision.reference", primary: "text" };
  if (path.includes("/canvas/text-generate") || path.includes("/canvas/assistant") || path.includes("prompt-assist")) return { text: "text.generate", vision: "vision.reference", primary: "text" };
  if (path.includes("suite") || path.includes("aplus")) return { image: "image.generate", text: "text.generate", vision: "vision.reference", primary: "image" };
  return { image: path.includes("cutout") ? "image.cutout" : path.includes("generate-image") ? "image.generate" : "image.edit", primary: "image" };
}
export async function withModelRequest<T>(request: Request, run: () => Promise<T>): Promise<T> {
  const [managed, parsed] = await Promise.all([modelConfigurationEnabled(), requestFacts(request)]);
  assertPlatformImageSelection(parsed.body.model, parsed.body.modelId, request.headers.get("x-naumi-feature-model"));
  if (!managed) return run();
  const admin = await getModelAdministration();
  const accepted = await acceptedModelVersions(request);
  if (new URL(request.url).pathname === "/api/aplus" && parsed.body.jobId && ["approve_source", "redo_source", "generate"].includes(parsed.body.action)) return run();
  const [snapshot, billing] = await Promise.all([accepted ? admin.repo.byVersion(accepted.modelVersion) : admin.repo.current(), accepted ? admin.billing.byVersion(accepted.billingVersion) : admin.billing.current()]);
  const quotedVersion = request.headers.get("x-naumi-model-version") || parsed.body.modelVersion;
  if (quotedVersion !== undefined && quotedVersion !== null && quotedVersion !== "" && (!/^[1-9][0-9]{0,15}$/.test(String(quotedVersion)) || Number(quotedVersion) !== snapshot.version)) throw new ModelConfigError("MODEL_CHANGED", "模型配置已更新，请刷新模型列表后重新提交；原输入已保留", 409);
  const feature = featureForRequest(new URL(request.url).pathname, parsed.body);
  const purpose = purposeFor(new URL(request.url).pathname), executor = await getModelExecutor();
  if (feature === "canvas.image") purpose.image = "image.edit";
  if (feature === "competitor.action" && parsed.body.action !== "analyze") Object.assign(purpose, { image:"image.edit", text:"text.competitor", vision:"vision.reference", primary:"image" });
  const mainFeature = feature === "competitor.action" && parsed.body.action === "analyze" ? undefined : feature;
  const bundle: ExecutionBundle = { modelVersion: snapshot.version, billingVersion: billing.version, primary: purpose.primary };
  let standaloneSegmentation = false;
  if (purpose.image === "image.cutout" && !snapshot.config.business?.["tool.cutout"] && !snapshot.config.bindings["image.cutout"]) {
    const { getCutoutSettings } = await import("../settings");
    const cutout = await getCutoutSettings();
    standaloneSegmentation = cutout.backend !== "openai" && !!cutout.replicateToken;
  }
  if (purpose.image && !standaloneSegmentation) {
    const selected = String(parsed.body.model || parsed.body.modelId || "").trim();
    const explicit = request.headers.get("x-naumi-feature-model") || selected || "";
    const explicitModelId = requestedFeatureModel(mainFeature, explicit.startsWith("byok:") ? undefined : explicit || undefined);
    const featureDefault = featureDefaultModel(snapshot.config,mainFeature,purpose.image);
    const configuredModelId = explicitModelId || featureDefault || snapshot.config.bindings[purpose.image];
    const outputResolution = Number(parsed.body.targetWidth) > 0 && Number(parsed.body.targetHeight) > 0 ? resolutionForLongSide(Math.max(Number(parsed.body.targetWidth), Number(parsed.body.targetHeight))) : String(parsed.body.resolution || "1K");
    const ratio = /^\d+:\d+$/.test(String(parsed.body.ratio||parsed.body.size||"")) ? String(parsed.body.ratio||parsed.body.size) : Number(parsed.body.targetWidth)>0&&Number(parsed.body.targetHeight)>0 ? imageRatio(Number(parsed.body.targetWidth),Number(parsed.body.targetHeight)) : "1:1";
    const routedModelId = routeImageModel(
      configuredModelId,
      ratio,
      snapshot.config.publicModels.filter(model => model.enabled && model.modality === "image"),
    );
    const requestedModelId = requestedFeatureModel(mainFeature, (explicitModelId || featureDefault || routedModelId !== configuredModelId) ? routedModelId : undefined);
    const preset = selectedImagePreset(snapshot.config, mainFeature, requestedModelId, purpose.image);
    const option = selectedBusinessOption(snapshot.config, mainFeature, requestedModelId);
    if (option?.parameters?.inputTypes && ((parsed.references > 0 && !option.parameters.inputTypes.includes("image")) || (parsed.body.needsMask && !option.parameters.inputTypes.includes("mask")))) throw new ModelConfigError("MODEL_INCOMPATIBLE", "本功能模型未开放该输入类型", 400);
    const model = snapshot.config.publicModels.find(m => m.id === (preset ? presetPublicId(preset,requestedModelId) : option?.modelId || requestedModelId || featureDefaultModel(snapshot.config,mainFeature,purpose.image)));
    assertDisplayResolution(model,outputResolution);
    const ids=model?publicUpstreamIds(snapshot.config,model):[];
    const upstreams=snapshot.config.upstreamModels.filter(u=>ids.includes(u.id)&&u.enabled&&snapshot.config.providers.some(p=>p.id===u.providerId&&p.enabled));
    const presentation = qualityPresentation(upstreams);
    const qualities = presentation?.qualities || option?.parameters?.qualities || Array.from(new Set(upstreams.flatMap(u => u.capabilities.qualities)));
    if (option?.parameters?.ratios?.length && !option.parameters.ratios.includes(ratio)) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型未开放该比例", 400);
    const requestedQuality = String(parsed.body.quality || request.headers.get("x-naumi-image-quality") || "medium");
    const presetParams = preset ? effectiveImageParameters(preset, { quality: requestedQuality, resolution: outputResolution, ratio }) : null;
    const canvasRequest = parsed.body.origin === "canvas" || new URL(request.url).pathname.startsWith("/api/canvas/");
    if (canvasRequest && presetParams && parsed.body.resolution && (!presetParams.nativeResolution || !presetParams.nativeRatio)) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型未核验该尺寸与比例组合，请选择已开放参数", 400);
    const effectiveQuality = presetParams?.effective.quality || requestedQuality;
    if ((option || presentation) && (parsed.body.quality || request.headers.get("x-naumi-image-quality")) && qualities.length && !qualities.includes(requestedQuality as any)) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选功能模型不支持该质量，不会静默退档", 400);
    const defaultQuality = qualities.some(q => q === (process.env.OPENAI_IMAGE_QUALITY || "medium")) ? process.env.OPENAI_IMAGE_QUALITY || "medium" : qualities[0] || process.env.OPENAI_IMAGE_QUALITY || "medium";
    if (!model?.displayResolutions && option?.parameters?.resolutions?.length && !option.parameters.resolutions.includes(outputResolution as any)) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型未开放该尺寸", 400);
    const native = presetParams ? presetParams.nativeResolution : !upstreams.some(u=>u.parameterMap.resolutionPolicy) && ["1K", "2K", "4K"].includes(outputResolution) && upstreams.some(u => u.capabilities.nativeResolutions.includes(outputResolution as "1K" | "2K" | "4K"));
    const needsEdit = purpose.image === "image.edit" || purpose.image === "image.cutout" || parsed.references > 0;
    const needsText = new URL(request.url).pathname.includes("/canvas/image-tasks");
    const task = String(parsed.body.taskType || parsed.body.task || "");
    const facts: ModelFacts = { task: ["draft", "product", "detail", "layout"].includes(task) ? task as ModelFacts["task"] : needsText ? "layout" : "product", quality: qualities.includes(effectiveQuality as any) ? effectiveQuality : defaultQuality, resolution: native ? outputResolution : "1K", requestedResolution:outputResolution, ratio, needsEdit, preserveIdentity: needsEdit, needsText, nativeResolution: native && outputResolution !== "1K", references: parsed.references, quantity: 1, inputLength: String(parsed.body.prompt || parsed.body.text || "").length };
    facts.needsMask = !!parsed.body.needsMask || new URL(request.url).pathname.includes("/canvas/image-tasks");
    if (presetParams) { facts.quality = requestedQuality; facts.resolution = outputResolution; }
    bundle.image = await executor.resolve({ scopeSystem:parsed.body.origin==="canvas"?"canvas":undefined, feature: mainFeature, binding: purpose.image, requestedModelId, snapshot, billing, facts });
  }
  const requestedTextModelId = requestedFeatureModel(mainFeature, purpose.primary === "text" || purpose.primary === "vision" ? request.headers.get("x-naumi-feature-model")?.trim() || request.headers.get("x-naumi-text-model")?.trim() || String(parsed.body.modelId || parsed.body.model || "").trim() || undefined : undefined);
  if (purpose.video) bundle.video = await executor.resolve({ feature, binding: purpose.video, requestedModelId: request.headers.get("x-naumi-feature-model")?.trim() || parsed.body.modelId || undefined, snapshot, billing });
  if (purpose.text && (requestedTextModelId || snapshot.config.bindings[purpose.text] || purpose.primary === "text" && mainFeature && snapshot.config.business?.[mainFeature])) bundle.text = await executor.resolve({ ...(purpose.primary === "text" ? { feature: mainFeature } : {}), binding: purpose.text, requestedModelId: requestedTextModelId, snapshot, billing, facts: { task: "product", quality: "medium", resolution: "1K", needsEdit: false, needsText: false, preserveIdentity: false, nativeResolution: false, references: parsed.references, inputLength: JSON.stringify(parsed.body.messages || parsed.body.prompt || "").length } });
  if (purpose.primary === "text" && purpose.text && mainFeature && snapshot.config.business?.[mainFeature] && bundle.text) {
    const scope = await executor.describe(bundle.text);
    if (parsed.references && scope.businessOption?.parameters?.inputTypes && !scope.businessOption.parameters.inputTypes.includes("image")) throw new ModelConfigError("MODEL_INCOMPATIBLE", "本功能未开放图片输入", 400);
    if (scope.capabilities.vision) bundle.vision = bundle.text;
    else if (parsed.references || (Array.isArray(parsed.body.sourceIds) && parsed.body.sourceIds.length) || parsed.body.anchorId) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选功能模型不支持图片输入", 400);
  }
  if (!bundle.vision && purpose.vision && (snapshot.config.bindings[purpose.vision] || purpose.primary === "vision" && feature && snapshot.config.business?.[feature])) bundle.vision = await executor.resolve({ ...(purpose.primary === "vision" ? { feature, requestedModelId: requestedTextModelId } : {}), binding: purpose.vision, snapshot, billing });
  if (purpose.primary === "vision" && !bundle.vision || purpose.primary === "text" && !bundle.text || purpose.primary === "video" && !bundle.video) throw new ModelConfigError("MODEL_UNAVAILABLE", "当前用途没有可用模型绑定，请联系管理员配置", 503);
  if (new URL(request.url).pathname === "/api/agent" && parsed.references > 0) {
    if (!bundle.vision) throw new ModelConfigError("MODEL_INCOMPATIBLE", "Agent 视觉用途尚未配置，请联系管理员", 400);
    bundle.primary = "vision"; bundle.text = bundle.vision;
  }
  return executor.runBundle(bundle, billing, run);
}
