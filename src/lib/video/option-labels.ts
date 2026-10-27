/** Only known wire meanings get product labels; unknown options remain editable in compatibility settings. */
const labels: Record<string, string> = {
  seed: "随机种子", cameraFixed: "固定机位", camera_fixed: "固定机位", returnLastFrame: "返回尾帧",
  draft: "草稿预览", cfgScale: "提示词遵循度", cfg_scale: "提示词遵循度",
  characterOrientation: "角色朝向", character_orientation: "角色朝向",
  keepOriginalSound: "保留原声", keep_original_sound: "保留原声", smartShots: "智能分镜",
  enhancePrompt: "模型提示词增强", voiceId: "音色", voice_id: "音色", audioSpeed: "语速", audio_speed: "语速", text: "朗读文本",
};
export function videoOptionLabel(key: string): string | undefined { return labels[key]; }
export function videoOptionValueLabel(key: string, value: unknown): string {
  if (["characterOrientation", "character_orientation"].includes(key)) {
    if (value === "image") return "跟随角色图片";
    if (value === "video") return "跟随运动视频";
  }
  return String(value);
}
