import {currentImagegenStep} from "../imagegen/context";
import { featureForRequest } from "./feature-path";
import {imageBillingQuoteForRequest} from "../billing/image-quotes";
import { requestedFeatureModel, assertPlatformImageSelection } from "./selection-policy";
import "server-only";
import {getModelExecutionServices} from "./execution-services";
import {featureDefaultModel} from "./feature-model-policy";
import { getModelExecutor } from "./execution";
import { type ExecutionBundle } from "./context";
import { ModelConfigError } from "./types";
import {prepareImageOperation} from "./image-preparation";
import {validatePreparedImage} from "./prepared-image-contract";
import type { ModelBinding } from "./bindings";
import { acceptedModelVersions } from "./accepted-context";
import {canvasSourceFrameEdit,canvasSourceFrameRatio} from "../canvas/generation-parameters";

import {modelConfigurationEnabled} from "./availability";
export {modelConfigurationEnabled} from "./availability";

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
        else if (!/mask/i.test(key) && (value.type.startsWith("image/") || /image|reference|original|product|file|^(ref|top|bottom)$/i.test(key))) references++;
      }
    } else if (request.headers.get("content-type")?.includes("json")) {
      const parsed = await copy.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
      references = Array.isArray(body.images) ? body.images.length : Array.isArray(body.sourceIds) ? body.sourceIds.length : Array.isArray(body.contextIds) ? body.contextIds.length : body.anchorId ? 1 : body.image || body.imageUrl || body.originalUrl || body.artworkId ? 1 : 0;
      if (new URL(request.url).pathname === "/api/canvas/text-generate") {
        // Only this route supports text-node IDs as text context. Product
        // images still require vision, even when no source image was selected.
        const general = body.mode !== "reverse" && body.mode !== "assist";
        const sourceIds = (Array.isArray(body.sourceIds) ? body.sourceIds : []).map((id: unknown) => String(id).trim()).filter(Boolean);
        const productIds = (Array.isArray(body.productIds) ? body.productIds : []).map((id: unknown) => String(id).trim()).filter(Boolean);
        const inlineImages = Array.isArray(body.images) ? body.images.filter((image: unknown) => typeof image === "string" && image.trim()).length : 0;
        references = inlineImages + new Set([...sourceIds.filter((id: string) => !general || !id.startsWith("text-")), ...productIds]).size;
      }
    }
  } catch { /* The route owns detailed payload validation; no generation is performed here. */ }
  // Expand can edit the padded reference without a mask: the handler restores
  // original pixels locally. User-supplied masks in other routes stay required.
  return { body, references: Math.min(32, references) };
}
function purposeFor(path: string): { image?: ModelBinding; text?: ModelBinding; vision?: ModelBinding; video?: ModelBinding; primary: "image" | "text" | "vision" | "video" } {
  if (path === "/api/packaging-strategy") return { text: "text.generate", primary: "text" };
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
export async function withModelRequest<T>(request: Request, run: () => Promise<T>, authenticatedActor?:string|null): Promise<T> {
  const domainPath=new URL(request.url).pathname;
  // Imagegen owns nested parameters, input authorization, planning and frozen
  // execution. A generic image scope here reads top-level defaults (1K/1:1)
  // and can change its quote or reject a valid plan before the domain runs.
  // BI/creation/continuation authorization still wraps the owning HTTP route.
  if(domainPath === "/api/imagegen") return run();
  // The owned node or previous task supplies its model after domain authorization.
  if(/^\/api\/canvas\/video-nodes\/[^/]+\/(?:generate|batch)$/.test(domainPath)||/^\/api\/video\/tasks\/[^/]+\/retry$/.test(domainPath))return run();
  const [managed, parsed] = await Promise.all([modelConfigurationEnabled(), requestFacts(request)]);
  assertPlatformImageSelection(parsed.body.model, parsed.body.modelId, request.headers.get("x-naumi-feature-model"));
  if (!managed) return run();
  if ((domainPath === "/api/canvas/expand" || canvasSourceFrameEdit(domainPath)) && typeof parsed.body.artworkId === "string") {
    // Expand inherits the owned artwork's resolution in its handler. Freeze
    // that same selection before channel admission and price confirmation.
    const {resolveUserEmail} = await import("../admin-auth");
    const email = authenticatedActor===undefined?await resolveUserEmail(request):authenticatedActor;
    if (email) {
      const {listArtworksByIds} = await import("@/lib/artworks/repository");
      const artwork = (await listArtworksByIds(email, [parsed.body.artworkId]))[0];
      if (artwork) {
        parsed.body.resolution = artwork.resolution || "1K";
        if(canvasSourceFrameEdit(domainPath))parsed.body.ratio = canvasSourceFrameRatio(artwork);
      }
    }
  }
  return runModelOperation({path:domainPath,body:parsed.body,references:parsed.references,
    featureModel:request.headers.get("x-naumi-feature-model"),quality:request.headers.get("x-naumi-image-quality"),textModel:request.headers.get("x-naumi-text-model"),
    quote:await imageBillingQuoteForRequest(request,authenticatedActor),versions:await acceptedModelVersions(request,authenticatedActor)},run);
}

/** Trusted operation facts, already authenticated by the owning entry. Never accepts HTTP-supplied snapshots. */
export type ModelOperationInput={path:string;body:Record<string,any>;references:number;featureModel?:string|null;quality?:string|null;textModel?:string|null;
  preparedImage?:import("./image-preparation").PreparedImageOperation;quote?:import("../billing/types").BillingQuote;versions?:{modelVersion:number;billingVersion:number}|null};
export async function withModelOperation<T>(input:ModelOperationInput,run:()=>Promise<T>):Promise<T>{
  assertPlatformImageSelection(input.body.model,input.body.modelId,input.featureModel);
  if(!await modelConfigurationEnabled())return run();
  return runModelOperation(input,run);
}
async function runModelOperation<T>(input:ModelOperationInput,run:()=>Promise<T>):Promise<T>{
  const parsed={body:input.body,references:input.references};
  const services=getModelExecutionServices();
  const quotedImage=input.quote;
  const accepted = input.versions || (quotedImage?.modelVersion?{modelVersion:quotedImage.modelVersion,billingVersion:quotedImage.configVersion}:null);
  if (input.path === "/api/aplus" && parsed.body.jobId && ["approve_source", "redo_source", "generate"].includes(parsed.body.action)) return run();
  const [snapshot,billing]=await Promise.all([accepted?services.models.byVersion(accepted.modelVersion):services.models.current(),accepted?services.billing.byVersion(accepted.billingVersion):services.billing.current()]);
  const feature = featureForRequest(input.path, parsed.body);
  const purpose = purposeFor(input.path), executor = await getModelExecutor();
  if (feature === "canvas.image") {
    const step = currentImagegenStep();
    const hasReferences = step ? step.request.inputs.some(input => input.role !== "mask") : parsed.references > 0;
    purpose.image = hasReferences ? "image.edit" : "image.generate";
  }
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
    if(input.preparedImage){
      const expected=input.path==="/api/cutout"?"image.cutout":input.path==="/api/generate-image"?(input.references>0?"image.edit":"image.generate"):purpose.image;
      if(input.preparedImage.binding!==expected)throw new ModelConfigError("EXECUTION_MISMATCH","准备方案与输入用途不一致",503);
    }
    const advanced=currentImagegenStep();
    const prepared=input.preparedImage?validatePreparedImage(input.preparedImage,snapshot,billing,mainFeature,input.preparedImage.binding):prepareImageOperation({...input,feature:mainFeature,binding:purpose.image,accepted:!!accepted,advanced,...(advanced?{resolvedFrame:{ratio:advanced.request.parameters.ratio,preserveModelIdentity:!!advanced.billing}}:{})},snapshot,billing);
    bundle.image=await executor.resolve({imageParameterPlanVersion:advanced?.billing?.quote.imageParameterPlanVersion??quotedImage?.imageParameterPlanVersion??(accepted?0:1),imageParameterPlans:advanced?.billing?.quote.imageParameterPlans??quotedImage?.imageParameterPlans,preparedImage:prepared,feature:mainFeature,binding:prepared.binding,requestedModelId:prepared.modelId,snapshot,billing,scopeSystem:parsed.body.origin==="canvas"?"canvas":undefined});
  }

  const requestedTextModelId = requestedFeatureModel(mainFeature, purpose.primary === "text" || purpose.primary === "vision" ? input.featureModel?.trim() || input.textModel?.trim() || String(parsed.body.modelId || parsed.body.model || "").trim() || undefined : undefined);
  if (purpose.video) bundle.video = await executor.resolve({ feature, binding: purpose.video, requestedModelId: input.featureModel?.trim() || parsed.body.modelId || undefined, snapshot, billing });
  if (purpose.text && (requestedTextModelId || snapshot.config.bindings[purpose.text] || purpose.primary === "text" && mainFeature && snapshot.config.business?.[mainFeature])) bundle.text = await executor.resolve({ ...(purpose.primary === "text" ? { feature: mainFeature } : {}), binding: purpose.text, requestedModelId: requestedTextModelId, snapshot, billing, facts: { task: "product", quality: "medium", resolution: "1K", needsEdit: false, needsText: false, preserveIdentity: false, nativeResolution: false, references: parsed.references, inputLength: JSON.stringify(parsed.body.messages || parsed.body.prompt || "").length } });
  if (purpose.primary === "text" && purpose.text && mainFeature && (snapshot.config.business?.[mainFeature] || input.path === "/api/canvas/text-generate" && ["infer","chat-plan"].includes(parsed.body.referenceTask)) && bundle.text) {
    const scope = await executor.describe(bundle.text);
    if (parsed.references && scope.businessOption?.parameters?.inputTypes && !scope.businessOption.parameters.inputTypes.includes("image")) throw new ModelConfigError("MODEL_INCOMPATIBLE", "本功能未开放图片输入", 400);
    if (scope.capabilities.vision) bundle.vision = bundle.text;
    else if (parsed.references || (input.path !== "/api/canvas/text-generate" && Array.isArray(parsed.body.sourceIds) && parsed.body.sourceIds.length) || parsed.body.anchorId) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选功能模型不支持图片输入", 400);
  }
  // A visible, explicitly selected OCR model does not require an additional
  // legacy default binding. resolve still enforces vision capability/tool scope.
  if (!bundle.vision && purpose.vision && (snapshot.config.bindings[purpose.vision] || purpose.primary === "vision" && (requestedTextModelId || featureDefaultModel(snapshot.config, feature, purpose.vision)))) bundle.vision = await executor.resolve({ ...(purpose.primary === "vision" ? { feature, requestedModelId: requestedTextModelId } : {}), binding: purpose.vision, snapshot, billing });
  if (purpose.primary === "vision" && !bundle.vision || purpose.primary === "text" && !bundle.text || purpose.primary === "video" && !bundle.video) throw new ModelConfigError("MODEL_UNAVAILABLE", "当前用途没有可用模型绑定，请联系管理员配置", 503);
  if (input.path === "/api/agent" && parsed.references > 0) {
    if (!bundle.vision) throw new ModelConfigError("MODEL_INCOMPATIBLE", "Agent 视觉用途尚未配置，请联系管理员", 400);
    bundle.primary = "vision"; bundle.text = bundle.vision;
  }
  return executor.runBundle(bundle, billing, run, snapshot);
}
