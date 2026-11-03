import { z } from "zod";
import { referenceRoleSchema } from "../imagegen/reference-labels";

const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
const projectIdentity = z.string().regex(/^(?:tree|batch):[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
const bindingKey = z.string().regex(/^node:[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
const unique = (values: readonly unknown[]) => new Set(values).size === values.length;
export const imagePromptDocumentSchema = z.strictObject({
  version: z.literal(1),
  prompt: z.string().max(50000),
  bindings: z.array(z.strictObject({ key: bindingKey, number: z.number().int().min(1).max(99999), role: referenceRoleSchema })).max(1000),
  activeKeys: z.array(bindingKey).max(16),
  additionalKeys: z.array(bindingKey).max(16).default([]),
  hiddenReferenceIds: z.array(identity).max(1000),
}).superRefine((doc, ctx) => {
  if (!unique(doc.bindings.map(b => b.key)) || !unique(doc.bindings.map(b => b.number))) ctx.addIssue({ code: "custom", message: "引用身份或编号重复", path: ["bindings"] });
  for (const field of ["activeKeys", "additionalKeys", "hiddenReferenceIds"] as const)
    if (!unique(doc[field])) ctx.addIssue({ code: "custom", message: "引用身份重复", path: [field] });
  const keys = new Set(doc.bindings.map(b => b.key)), active = new Set(doc.activeKeys);
  if (doc.activeKeys.some(k => !keys.has(k))) ctx.addIssue({ code: "custom", message: "引用缺少身份绑定", path: ["activeKeys"] });
  if (doc.additionalKeys.some(k => !active.has(k))) ctx.addIssue({ code: "custom", message: "额外素材须属于启用引用", path: ["additionalKeys"] });
  if (doc.activeKeys.some(k => doc.hiddenReferenceIds.includes(k.slice(5)))) ctx.addIssue({ code: "custom", message: "隐藏引用仍在启用列表中", path: ["activeKeys"] });
});
export type ImagePromptDocument = z.infer<typeof imagePromptDocumentSchema>;
export type ImagePromptState = { document: ImagePromptDocument | null; revision: number };
export const imagePromptReadSchema = z.strictObject({ projectKey: projectIdentity, nodeId: identity });
export const imagePromptWriteSchema = imagePromptReadSchema.extend({ expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), operationId: z.uuid(), document: imagePromptDocumentSchema });
export type ImagePromptWrite = z.infer<typeof imagePromptWriteSchema>;

/** Copies graph identity, never title/position. Unknown external sources stay explicitly inactive. */
export function remapImagePromptDocument(document: ImagePromptDocument, idMap: ReadonlyMap<string, string> | Record<string, string>, options: { preserveExternal?: boolean; detached?: boolean } = {}): ImagePromptDocument {
  const get = (id: string) => idMap instanceof Map ? idMap.get(id) : (idMap as Record<string, string>)[id];
  const mapped = (key: string) => { const id = get(key.slice(5)); return id ? `node:${id}` : key; };
  const bindings = document.bindings.map(b => ({ ...b, key: mapped(b.key) }));
  const activeKeys = document.activeKeys.filter(k => get(k.slice(5)) || options.preserveExternal).map(mapped);
  const active = new Set(activeKeys);
  const additionalKeys = (options.detached ? activeKeys : document.additionalKeys.map(mapped).filter(k => active.has(k)));
  return imagePromptDocumentSchema.parse({ ...document, bindings, activeKeys, additionalKeys,
    hiddenReferenceIds: document.hiddenReferenceIds.map(id => get(id) || id) });
}
