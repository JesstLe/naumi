import { z } from "zod";

const id = z.string().trim().min(1).max(160).refine(value => !/[\r\n]/.test(value));
const image = z.object({ modelId: id.optional(), ratio: z.string().regex(/^(auto|\d{1,4}:\d{1,4})$/).optional(), resolution: z.enum(["1K", "2K", "4K", "5K"]).optional(), quality: z.enum(["low", "medium", "high", "xhigh", "max", "auto"]).optional() }).strict();
const video = z.object({ modelId: id.optional(), providerId: id.optional(), aspectRatio: z.string().regex(/^\d{1,4}:\d{1,4}$/).optional(), resolution: z.string().regex(/^[\w-]{1,30}$/).optional(), durationSeconds: z.number().int().min(1).max(3600).optional() }).strict();
export const creationSettingsSchema = z.object({ image: image.optional(), video: video.optional() }).strict();
export type CreationSettings = z.infer<typeof creationSettingsSchema>;

/** Clone and freeze at admission; never retain the composer draft by reference. */
export function freezeCreationSettings(value: unknown): CreationSettings {
  const settings = creationSettingsSchema.parse(value ?? {});
  for(const group of [settings.image,settings.video])if(group)for(const key of Object.keys(group))if(group[key as keyof typeof group]===undefined)delete (group as Record<string,unknown>)[key];
  if (settings.image) Object.freeze(settings.image);
  if (settings.video) Object.freeze(settings.video);
  return Object.freeze(settings);
}

export const CREATION_IMAGE_TOOLS = new Set(["generate_image", "retouch_product", "recolor_product", "replicate_hot", "generate_suite", "generate_aplus", "generate_packaging_3d", "generate_variations", "fuse_images", "inpaint_image", "transfer_style", "remove_watermark", "try_on_clothing", "extract_garment", "generate_garment_3d", "dewrinkle_clothing", "extract_print"]);
const videoConfigTools = new Set(["generate_video", "extend_video", "edit_video", "create_video_node", "set_video_config", "plan_video_shot", "plan_video_storyboard"]);
const imagePaths = new Set(["/api/generate-image", "/api/retouch", "/api/recolor", "/api/replicate", "/api/suite", "/api/aplus", "/api/packaging3d", "/api/inpaint", "/api/style", "/api/dewatermark", "/api/tryon", "/api/garment", "/api/garment3d", "/api/dewrinkle", "/api/extract"]);

/** The same policy is applied before quoting and before execution. Unspecified
 * fields remain the tool's decision; explicitly selected fields always win. */
export function creationToolArguments(name: string, args: Record<string, unknown>, settings?: CreationSettings): Record<string, unknown> {
  if (CREATION_IMAGE_TOOLS.has(name) && settings?.image) {
    const { modelId, ...parameters } = settings.image;
    return { ...args, ...parameters, ...(modelId ? { model: modelId } : {}) };
  }
  if (videoConfigTools.has(name) && settings?.video) {
    const config = args.config && typeof args.config === "object" ? args.config as Record<string, unknown> : {};
    return { ...args, config: { ...config, ...settings.video }, ...(Array.isArray(args.shots) ? { shots: args.shots.map(shot => ({ ...shot, ...(shot.config ? { config: { ...shot.config, ...settings.video } } : {}), ...(settings.video?.durationSeconds ? { durationSeconds: settings.video.durationSeconds } : {}) })) } : {}) };
  }
  return args;
}

export function assertVideoCreationSettings(config: Record<string, unknown>, settings?: CreationSettings) {
  for (const [field, value] of Object.entries(settings?.video || {})) {
    if (value !== undefined && config[field] !== value) throw new Error("当前视频节点与本轮创作设置不同，请读取节点并保存本轮模型和参数后再生成");
  }
}

/** Legacy image adapters use forms. Never inject image settings into reference
 * inspection, independent processors, or a previously frozen A+ continuation. */
export function creationImageForm(path: string, body: BodyInit | null | undefined, settings?: CreationSettings) {
  if (!settings?.image || !imagePaths.has(path) || !(body instanceof FormData) || path === "/api/aplus" && body.get("jobId")) return undefined;
  const form = new FormData(); body.forEach((value, key) => form.append(key, value));
  const { modelId, ...parameters } = settings.image;
  for (const [key, value] of Object.entries(parameters)) if (value !== undefined) form.set(key, value);
  if (modelId) form.set("model", modelId);
  return { body: form, headers: { ...(modelId ? { "x-naumi-feature-model": modelId } : {}), ...(settings.image.quality ? { "x-naumi-image-quality": settings.image.quality } : {}) } };
}

export function creationSettingsPrompt(settings?: CreationSettings) {
  if (!settings || !Object.keys(settings).length) return "";
  return `\n本轮用户在创作设置中选择了以下参数，系统已冻结；图片/视频执行使用这些设置，右侧对话模型仅负责理解与编排。未填写的参数从真实目录选择，不猜模型ID，不修改已接受任务。不匹配已保存的视频节点时先读取并保存对应参数。\n${JSON.stringify(settings)}`;
}
