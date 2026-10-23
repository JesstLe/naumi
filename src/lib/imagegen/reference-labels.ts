import { z } from "zod";

export const referenceRoleSchema = z.enum(["edit-target", "reference", "insert", "style"]);
export type ReferenceRole = z.infer<typeof referenceRoleSchema>;
export const referenceLabelSchema = z.strictObject({
  number: z.number().int().min(1).max(99999),
  title: z.string().max(100),
  sourceNodeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/).optional(),
});
export const canvasReferenceManifestSchema = z.array(referenceLabelSchema.extend({ role: referenceRoleSchema })).max(16);
export type CanvasReferenceManifest = z.infer<typeof canvasReferenceManifestSchema>;
export const referenceRoleLabels: Record<ReferenceRole, { zh: string; en: string }> = {
  "edit-target": { zh: "要修改的原图", en: "Original to edit" },
  reference: { zh: "构图参考", en: "Composition" },
  insert: { zh: "主体参考", en: "Subject" },
  style: { zh: "风格参考", en: "Style" },
};

export function mentionedReferenceNumbers(prompt: string) {
  return [...new Set([...prompt.matchAll(/【图([1-9]\d{0,4})】/g)].map(match => Number(match[1])))];
}

export function referenceManifestError(prompt: string, refs: CanvasReferenceManifest): string | null {
  if (refs.length > 16) return "最多可引用16张图片，请移除多余图片后重试";
  const numbers = new Set(refs.map(ref => ref.number));
  if (numbers.size !== refs.length) return "参考图编号重复，请重新选择图片";
  const missing = mentionedReferenceNumbers(prompt).filter(number => !numbers.has(number));
  if (missing.length) return `图${missing.join("、图")}已移除或未载入，请重新连接图片或删除提示词中的对应引用`;
  const targets = refs.filter(ref => ref.role === "edit-target");
  if (targets.length > 1 || targets.length === 1 && refs[0].role !== "edit-target") return "要修改的原图只能选择一张，并放在输入首位";
  return null;
}

/** Labels are task-local identities; array order is the actual transport order.
 * Titles are quoted data, never treated as additional generation instructions. */
export function compileReferenceInstructions(prompt: string, refs: CanvasReferenceManifest) {
  const error = referenceManifestError(prompt, refs);
  if (error) throw new Error(error);
  const resolved = prompt.replace(/【图([1-9]\d{0,4})】/g, (_token, number: string) => {
    const index = refs.findIndex(ref => ref.number === Number(number));
    return `第${index + 1}张输入图（图${number}）`;
  });
  if (!refs.length) return resolved;
  const hasTarget = refs.some(ref => ref.role === "edit-target");
  const usage = hasTarget
    ? "以要修改的原图为基础；未明确要求的其他主体或文字，不自动替换进原图。"
    : "本次图片均为参考素材，按用户要求生成新图，不将任意参考图默认作为要保留的原图。";
  return `${resolved}\n\n输入图片对应关系（按实际发送顺序）：\n${refs.map((ref, index) =>
    `第${index + 1}张输入图 = 图${ref.number}；用途：${referenceRoleLabels[ref.role].zh}；来源名称：${JSON.stringify(ref.title)}`
  ).join("\n")}\n${usage}主体、风格和构图是各参考图的默认用途，用户明确指定某张图的使用方式时，以本次要求为准。`;
}
