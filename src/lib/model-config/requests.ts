import "server-only";
import { dbEnabled, getPool } from "../db";
import { getModelAdministration } from "./server";
import { getModelExecutor } from "./execution";
import { legacyModelExecutionActive, type ExecutionBundle } from "./context";
import { ModelConfigError, type ModelFacts } from "./types";
import type { ModelBinding } from "./bindings";
import { resolutionForLongSide } from "../mock-data";
import { acceptedModelVersions } from "./accepted-context";

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
      references = Array.isArray(body.images) ? body.images.length : body.image || body.imageUrl || body.originalUrl || body.artworkId ? 1 : 0;
    }
  } catch { /* The route owns detailed payload validation; no generation is performed here. */ }
  return { body, references: Math.min(32, references) };
}
function purposeFor(path: string): { image?: ModelBinding; text?: ModelBinding; vision?: ModelBinding; video?: ModelBinding; primary: "image" | "text" | "vision" | "video" } {
  if (path === "/api/video/generate") return { video: "video.generate", primary: "video" };
  if (path === "/api/agent") return { text: "agent.text", vision: "agent.vision", primary: "text" };
  if (path.includes("verify-image")) return { text: "agent.text", vision: "agent.vision", primary: "vision" };
  if (path.includes("/canvas/ocr")) return { vision: "vision.ocr", primary: "vision" };
  if (path.includes("title-gen")) return { text: "text.title", primary: "text" };
  if (path.includes("replicate/analyze") || /\/competitors\/[^/]+\/action/.test(path) || path.includes("ipcheck")) return { text: "text.competitor", vision: "vision.reference", primary: "text" };
  if (path.includes("/canvas/text-generate") || path.includes("/canvas/assistant") || path.includes("prompt-assist")) return { text: "text.generate", vision: "vision.reference", primary: "text" };
  if (path.includes("suite") || path.includes("aplus")) return { image: "image.generate", text: "text.generate", vision: "vision.reference", primary: "image" };
  return { image: path.includes("cutout") ? "image.cutout" : path.includes("generate-image") ? "image.generate" : "image.edit", primary: "image" };
}
export async function withModelRequest<T>(request: Request, run: () => Promise<T>): Promise<T> {
  if (!await modelConfigurationEnabled()) return run();
  const admin = await getModelAdministration();
  const [accepted, parsed] = await Promise.all([acceptedModelVersions(request), requestFacts(request)]);
  if (new URL(request.url).pathname === "/api/aplus" && parsed.body.jobId && ["approve_source", "redo_source", "generate"].includes(parsed.body.action)) return run();
  const [snapshot, billing] = await Promise.all([accepted ? admin.repo.byVersion(accepted.modelVersion) : admin.repo.current(), accepted ? admin.billing.byVersion(accepted.billingVersion) : admin.billing.current()]);
  const quotedVersion = request.headers.get("x-naumi-model-version") || parsed.body.modelVersion;
  if (quotedVersion !== undefined && quotedVersion !== null && quotedVersion !== "" && (!/^[1-9][0-9]{0,15}$/.test(String(quotedVersion)) || Number(quotedVersion) !== snapshot.version)) throw new ModelConfigError("MODEL_CHANGED", "模型配置已更新，请刷新模型列表后重新提交；原输入已保留", 409);
  const purpose = purposeFor(new URL(request.url).pathname), executor = await getModelExecutor();
  const bundle: ExecutionBundle = { modelVersion: snapshot.version, billingVersion: billing.version, primary: purpose.primary };
  let standaloneSegmentation = false;
  if (purpose.image === "image.cutout" && !snapshot.config.bindings["image.cutout"]) {
    const { getCutoutSettings } = await import("../settings");
    const cutout = await getCutoutSettings();
    standaloneSegmentation = cutout.backend !== "openai" && !!cutout.replicateToken;
  }
  if (purpose.image && !standaloneSegmentation) {
    const selected = String(parsed.body.model || parsed.body.modelId || "").trim();
    const requestedModelId = selected.startsWith("byok:") ? undefined : selected || undefined;
    const model = snapshot.config.publicModels.find(m => m.id === (requestedModelId || snapshot.config.bindings[purpose.image!]));
    const upstreams = model?.target.type === "pool" ? snapshot.config.upstreamModels.filter(u => snapshot.config.pools.find(p => p.id === model.target.id)?.candidates.includes(u.id)) : snapshot.config.upstreamModels.filter(u => u.id === model?.target.id);
    const qualities = Array.from(new Set(upstreams.flatMap(u => u.capabilities.qualities)));
    const requestedQuality = String(parsed.body.quality || request.headers.get("x-naumi-image-quality") || "medium");
    const defaultQuality = qualities.some(q => q === (process.env.OPENAI_IMAGE_QUALITY || "medium")) ? process.env.OPENAI_IMAGE_QUALITY || "medium" : qualities[0] || process.env.OPENAI_IMAGE_QUALITY || "medium";
    const outputResolution = Number(parsed.body.targetWidth) > 0 && Number(parsed.body.targetHeight) > 0 ? resolutionForLongSide(Math.max(Number(parsed.body.targetWidth), Number(parsed.body.targetHeight))) : String(parsed.body.resolution || "1K");
    const native = ["1K", "2K", "4K"].includes(outputResolution) && upstreams.some(u => u.capabilities.nativeResolutions.includes(outputResolution as "1K" | "2K" | "4K"));
    const needsEdit = purpose.image === "image.edit" || purpose.image === "image.cutout" || parsed.references > 0;
    const needsText = new URL(request.url).pathname.includes("/canvas/image-tasks");
    const facts: ModelFacts = { task: needsText ? "layout" : "product", quality: qualities.includes(requestedQuality as any) ? requestedQuality : defaultQuality, resolution: native ? outputResolution : "1K", needsEdit, preserveIdentity: needsEdit, needsText, nativeResolution: native && outputResolution !== "1K", references: parsed.references, quantity: 1 };
    facts.needsMask = !!parsed.body.needsMask || new URL(request.url).pathname.includes("/canvas/image-tasks");
    bundle.image = await executor.resolve({ binding: purpose.image, requestedModelId, snapshot, billing, facts });
  }
  const requestedTextModelId = request.headers.get("x-naumi-text-model")?.trim() || undefined;
  if (purpose.video) bundle.video = await executor.resolve({ binding: purpose.video, requestedModelId: parsed.body.modelId || undefined, snapshot, billing });
  if (purpose.text && (requestedTextModelId || snapshot.config.bindings[purpose.text])) bundle.text = await executor.resolve({ binding: purpose.text, requestedModelId: requestedTextModelId, snapshot, billing });
  if (purpose.vision && snapshot.config.bindings[purpose.vision]) bundle.vision = await executor.resolve({ binding: purpose.vision, snapshot, billing });
  if (purpose.primary === "vision" && !bundle.vision || purpose.primary === "text" && !bundle.text || purpose.primary === "video" && !bundle.video) throw new ModelConfigError("MODEL_UNAVAILABLE", "当前用途没有可用模型绑定，请联系管理员配置", 503);
  if (new URL(request.url).pathname === "/api/agent" && parsed.references > 0) {
    if (!bundle.vision) throw new ModelConfigError("MODEL_INCOMPATIBLE", "Agent 视觉用途尚未配置，请联系管理员", 400);
    bundle.primary = "vision"; bundle.text = bundle.vision;
  }
  return executor.runBundle(bundle, billing, run);
}
