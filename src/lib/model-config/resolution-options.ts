import { ModelConfigError, type ModelConfig, type PublicModel } from "./types";
import { imageModelDisplayId } from "../image-model-routing";

export const DISPLAY_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export function assertDisplayResolution(model: PublicModel | undefined, resolution: string) {
  if (model?.displayResolutions && !model.displayResolutions.includes(resolution as typeof DISPLAY_RESOLUTIONS[number]))
    throw new ModelConfigError("MODEL_PARAMETER_UNAVAILABLE", "该模型未开放此分辨率，请刷新参数列表", 409);
}
export function applyDisplayResolutions(source: ModelConfig, row: { id: string; modality: string }, values: string[] | null) {
  if (row.modality !== "image") throw new ModelConfigError("INVALID_REQUEST", "只有图片模型可以设置输出分辨率");
  if (values && (!values.length || new Set(values).size !== values.length || values.some(v => !(DISPLAY_RESOLUTIONS as readonly string[]).includes(v))))
    throw new ModelConfigError("INVALID_REQUEST", "请选择至少一个不重复的分辨率档位");
  const config = structuredClone(source);
  for (const model of config.publicModels.filter(m => m.modality === "image" && imageModelDisplayId(m.id) === row.id)) {
    const preset = config.defaultImagePreset;
    if (values && preset?.enabled && preset.aliases.some(a => a.id === model.id) && values.some(v => !preset.resolutions.includes(v as typeof DISPLAY_RESOLUTIONS[number])))
      throw new ModelConfigError("MODEL_PARAMETERS_ADAPTER", "此成本预设未开放该规格，请先在预设中配置对应能力与价格");
    if (values) model.displayResolutions = DISPLAY_RESOLUTIONS.filter(v => values.includes(v));
    else delete model.displayResolutions;
  }
  return config;
}
