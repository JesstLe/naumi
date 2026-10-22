type Background = "transparent" | "opaque";
type Signal = { background: Background; cutout?: boolean };

const negation = /(?:不要|别|无需|不需要|禁止|不能|避免|不想要|并非|不是|\b(?:don't|do not|must not|never|without|no need to|not))\s*(?:再|再去|进行|使用|添加|生成|输出|绘制|保留|任何|a |an |the )?\s*$/i;
const removal = /抠图|(?:移除|去掉|去除|删除|清除|消除)[^，,。.;；!！?？\n]{0,10}?(?:背景|白底|底色)|\b(?:remove|erase|delete)\s+(?:(?:the|this|original|solid|white|black|image|existing)\s+){0,4}background\b/gi;
const backgroundToken = /(?:背景|底色)(?:设置为|设为|保持为|改成|换成|变成|变为|为|是|要|保持|：|:|\s)*(?:不透明|非透明|透明|纯?白色?|纯?黑色?|纯色)|(?:不透明|非透明|透明|纯?白色?|纯?黑色?|纯色)(?:的)?(?:背景|底(?:图|色)?)|透明\s*(?:PNG|WebP)|无背景|没有背景|(?:保留|保持)(?:原有|原图|现有)?背景(?![为是要：:\s]*(?:不透明|非透明|透明))|\bno background\b|\b(?:transparent|opaque|white|black|solid(?:[ -]colou?red)?)\s+(?:background|png)\b|\bbackground\s+(?:(?:is|must be|should be|stays|remains)\s+)?(?:transparent|opaque|white|black)\b|\b(?:keep|preserve)\s+(?:(?:the|original|existing)\s+)?background\b(?!\s+(?:transparent|opaque))/gi;

/** Only classify background-directed language. Object/material opacity is not an output-background setting. */
function signals(clause: string): Signal[] {
  const result: Signal[] = [];
  const negated = (index: number) => negation.test(clause.slice(0, index));
  const remainder = clause.replace(removal, (match: string, index: number) => {
    result.push(negated(index) ? { background: "opaque" } : { background: "transparent", cutout: true });
    // Do not interpret the white background being removed as a second output requirement.
    return " ".repeat(match.length);
  });
  for (const match of remainder.matchAll(backgroundToken)) {
    const token = match[0], before = remainder.slice(0, match.index), after = remainder.slice(match.index + token.length);
    // A source description such as "白底图中的产品" is not a request to keep that background.
    if (/^(?:图)?(?:中|里|上|内|中的|里的)/.test(after) || /(?:原图|参考图|输入图)(?:是|为|的)?$/.test(before)) continue;
    if (/^\s*(?:改成|改为|换成|换为|变成|变为|替换为|to\s)/i.test(after)) continue;
    const opaque = /不透明|非透明|白|黑|纯色|\b(?:opaque|white|black|solid)\b/i.test(token) || /^(?:保留|保持|keep|preserve)/i.test(token);
    if (negation.test(before)) {
      if (!opaque) result.push({ background: "opaque" });
      else if (/不透明|非透明|opaque/i.test(token)) result.push({ background: "transparent" });
      // "不要白底" excludes white; it does not demand an opaque or transparent output by itself.
    } else result.push({ background: opaque ? "opaque" : "transparent" });
  }
  // Retain concise commands, but never match "主体不透明" or "opaque bottle".
  const bare = clause.match(/^(?:请|要求|输出|保持|要)?\s*(不要|别|无需|不需要|禁止)?\s*(不透明|非透明|透明)$/);
  if (bare) result.push({ background: (bare[2] === "透明") !== !!bare[1] ? "transparent" : "opaque" });
  return result;
}

export function resolveBackgroundInstructions(clauses: string[]) {
  const found = clauses.flatMap(signals);
  return { backgrounds: new Set(found.map(signal => signal.background)), cutout: found.some(signal => signal.cutout) };
}
