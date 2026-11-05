import { currentModelExecution } from "./model-config/context";
import { modelConfigurationEnabled } from "./model-config/availability";
import {publicModelCatalog} from "./model-config/public-catalog";
import {readPublishedModelSnapshot} from "./model-config/published";
import {getLegacyImageModelCatalog,getLegacyNewApiImageSettings} from "./image-model-legacy-catalog";
import type {ImageModelDescriptor} from "./image-model-catalog-types";
export type {ImageModelProvider,ImageModelDescriptor} from "./image-model-catalog-types";
export {isNewApiFlowImageModel,isOpenAIImagesEditModel,getLegacyNewApiImageSettings,getLegacyImageModelCatalog} from "./image-model-legacy-catalog";
import type { ModelSnapshot } from "./model-config/types";
import {
  getUserImageProvider,
  userImageModelId,
} from "@/lib/user-image-provider";
export function getNewApiImageSettings() {
  const scope = currentModelExecution("image");
  if (scope?.connection.protocol === "new-api-flow") return { baseUrl: scope.connection.baseUrl, apiKey: scope.connection.apiKey, configuredModels: [scope.connection.wireModel] };
  return getLegacyNewApiImageSettings();
}

export async function getImageModelCatalog(email?: string | null, supplied?: ModelSnapshot): Promise<ImageModelDescriptor[]> {
  const scope = currentModelExecution("image");
  if (!supplied && !scope && !await modelConfigurationEnabled()) return getLegacyImageModelCatalog(email);
  const snapshot = supplied || await readPublishedModelSnapshot(scope?.frozen.modelVersion);
  const managed: ImageModelDescriptor[] = publicModelCatalog(snapshot, "image", scope?.frozen.feature === "canvas.image" ? "canvas.image" : undefined).models.map(m => {
    const model = snapshot.config.publicModels.find(p => p.id === m.id)!;
    const upstream = model.target.type === "upstream" ? snapshot.config.upstreamModels.find(u => u.id === model.target.id) : undefined;
    const protocol = upstream ? snapshot.config.providers.find(p => p.id === upstream.providerId)?.protocol : undefined;
    // Public menu capability tightening must not re-admit an already-bound
    // legacy execution. Its immutable scope retains the original edit flag.
    return { ...m, ...(scope&&m.id===scope.frozen.publicModelId?{supportsEdit:scope.capabilities.edit}:{}), provider: !model.supplierRouting && protocol === "new-api-flow" ? "new-api-flow" : "openai-images" };
  });
  const custom = email ? await getUserImageProvider(email) : null;
  if (custom?.baseUrl && custom.apiKey) for (const id of custom.models) managed.unshift({ id: userImageModelId(id), label: `自定义 · ${id}`, supportsEdit: custom.protocol === "chat-completions" || id.startsWith("gpt-image"), provider: custom.protocol === "chat-completions" ? "user-chat-completions" : "user-openai-images" });
  return managed;
}

export async function getUserDefaultImageModel(email?: string | null) {
  if (!email) return null;
  const provider = await getUserImageProvider(email);
  if (
    !provider ||
    !provider.baseUrl ||
    !provider.apiKey ||
    !provider.defaultModel ||
    !provider.models.includes(provider.defaultModel)
  ) {
    return null;
  }
  return userImageModelId(provider.defaultModel);
}

export async function resolveImageModel(model: string, email?: string | null) {
  return (await getImageModelCatalog(email)).find((item) => item.id === model) || null;
}
