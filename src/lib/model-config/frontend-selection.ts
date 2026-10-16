import type { ModelSnapshot, Modality } from "./types";
import { compactImageModelOptions } from "../image-model-routing";
export type FrontendModelSelection = { id: string; label: string };

/** Resolve display copy from the accepted immutable config, never a client-provided name. */
export function frontendModelSelection(snapshot: ModelSnapshot, modality: Modality, id: string): FrontendModelSelection | undefined {
  const models = snapshot.config.publicModels.filter(model => model.enabled && model.visible && model.modality === modality);
  const selected = models.find(model => model.id === id);
  if (!selected) return undefined;
  if (modality !== "image") return { id, label: selected.label };
  const options = compactImageModelOptions(models.map(model => ({ ...model, provider: "managed" })), [id]);
  const display = options.find(model => model.id === id);
  return { id, label: display?.label || selected.label };
}
