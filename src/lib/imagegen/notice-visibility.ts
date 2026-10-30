/** User-facing image notices only. The original plan, stored diagnostics and
 * legacy error classification remain untouched. Hide the approved A/B copy,
 * never arbitrary errors or the retained C/D/E/F notices. */
const informationalImageNotice = new RegExp(
  String.raw`(^|[；;\r\n])[ \t]*(?:` + [
    String.raw`图片已生成，实际尺寸 \d+×\d+，比例与所选 [\d:]+ 有差异；已保留完整画面`,
    String.raw`图片已生成，实际尺寸待读取；已保留原图`,
    String.raw`本次按最接近(?:参考图|所选)画幅的 [\d:]+ 生成`,
    String.raw`本次自适应跟随参考画幅，结果保留完整画面`,
    String.raw`本次由(?:1K|2K|4K)自动调整为(?:1K|2K|4K)，按实际档位生成，积分按所选档位报价保持不变。`,
    String.raw`模型编辑后按蒙版合成，未选区保留原图；原生成版本也会保留。`,
    String.raw`所选模型先生成，再通过后台指定的抠图模型生成透明图；两步积分已合计，原图保留。`,
    String.raw`已识别：透明背景 · (?:生成|编辑|抠图)(?: → (?:生成|编辑|抠图))* · \d+(?:\.\d+)? 积分`,
  ].join("|") + String.raw`)[ \t]*(?=$|[；;\r\n])`,
  "g",
);

/** Old recovery snapshots may join several notices into one string. Remove
 * only a full A/B sentence at a notice boundary, including its internal `；`,
 * so a neighbouring transparency/partial-delivery/billing notice survives. */
export function userVisibleImageWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) return [];
  const visible: string[] = [];
  for (const value of warnings) {
    if (typeof value !== "string" || !value.trim()) continue;
    const filtered = value.replace(informationalImageNotice, "");
    const text = filtered === value ? value : filtered
      .replace(/^[\s；;]+|[\s；;]+$/g, "");
    if (text.trim()) visible.push(text);
  }
  return visible;
}
