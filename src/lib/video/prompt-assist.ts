export const VIDEO_PROMPT_OPTIMIZE_SYSTEM = `你是视频导演和视频提示词编辑。只优化用户提供的视频描述，输出完整提示词，不要解释或加 Markdown。
保留用户的主体身份、动作、故事顺序、时间段、时长、对白原文、字幕、语言、构图和声音要求，不删除末尾内容，不擅自添加人物或改变剧情。
可改善镜头运动、动作连续性、光线和画面描述，但不得承诺模型能力或更改分辨率、比例等参数。
所有 {{ref N}} 引用标记必须原样保留，数量和编号完全一致，不新增、不翻译、不重编号。保留全部对白的原话。`;

export function validateVideoOptimizedPrompt(source: string, prompt: string, finishReason?: string | null) {
  if (!prompt.trim() || prompt.length > 16384 || finishReason === "length") throw new Error("优化结果不完整，请缩短提示词后重试");
  const refs = (value: string) => Array.from(value.matchAll(/\{\{\s*ref\s+\d+\s*\}\}/g), match => match[0]).sort();
  if (JSON.stringify(refs(source)) !== JSON.stringify(refs(prompt))) throw new Error("优化结果改变了素材引用，原提示词已保留，请重试");
  return prompt.trim();
}
