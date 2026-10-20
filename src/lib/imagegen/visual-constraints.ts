/** User-driven exclusions only: do not turn every image into a marketing poster.
 * These are instructions, not a claim that a supplier result has passed QA. */
export function imagegenVisualConstraints(prompt: string): string[] {
  const instruction = prompt.replace(/```[\s\S]*?```|`[^`]*`|“[^”]*”|「[^」]*」|"[^"\n]*"/g, " ");
  const person = /模特|人物|人像|母女|全身|\b(?:model|portrait|person|people)\b/i.test(instruction);
  const preserveText = /不要.{0,3}(?:去掉|移除|删除|去除).{0,5}(?:文案|文字|标题)|(?:保留|添加|加上).{0,5}(?:文案|文字|标题)|\b(?:keep|preserve|add)\s+(?:the\s+)?(?:text|copy|title)\b/i.test(instruction);
  const noText = !preserveText && (/(?:不要|不加|无需|去掉|去除|移除|无|不含|禁止|不需要).{0,8}(?:文案|文字|字样|标题|水印)|(?:只要|仅要|仅保留|只保留|只生成|仅生成).{0,8}(?:模特|人物|人像|产品|主体)(?:[，。；！!\s]|$)|\b(?:no|without|remove)\s+(?:all\s+)?(?:text|copy|typography|watermarks?)\b/i.test(instruction)
    || person && /生成|拍摄|创作|\b(?:create|generate|photograph)\b/i.test(instruction) && !/海报|广告|文字|文案|标题|字样|\b(?:poster|text|advertisement)\b/i.test(instruction));
  const constraints: string[] = [];
  if (noText) constraints.push("本次用户要求纯主体/无文字：不要继承参考图中的标题、广告文案、水印或页脚，不添加新的文字；此要求优先于通用的文字保留规则。");
  if (person) constraints.push("人物保持自然的身体比例与解剖结构，不为适配画幅挤压或拉长身体、脸部及四肢；调整镜头距离与构图，而不是缩放变形主体。");
  if (!/留白|空白|文案区|边框|相框|页脚|底条|white\s*space|negative\s*space|letterbox|padding|\b(?:frame|border|margin)\b/i.test(instruction)) constraints.push("以请求画幅作为完整成图边界，不附加独立空白底条、页脚或装裱边；不要通过拉伸或裁掉主体适配画幅。");
  return constraints;
}
