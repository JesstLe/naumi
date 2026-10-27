import { z } from "zod";

// These identifiers also appear in an ordinary ordered-input nodeId. Keep the
// complete live and frozen identities within the existing 160-character wire.
export const characterIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/);
export const characterAppearanceIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/);
const artworkId = z.string().min(1).max(160);
export const characterAppearanceSchema = z.strictObject({
  id: characterAppearanceIdSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().max(4000),
  referenceArtworkIds: z.array(artworkId).max(128).refine(ids => new Set(ids).size === ids.length, "参考图片重复"),
});
export const characterProjectSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(8000),
  defaultAppearanceId: characterAppearanceIdSchema,
  appearances: z.array(characterAppearanceSchema).min(1).max(128),
}).superRefine((project, context) => {
  const ids = project.appearances.map(appearance => appearance.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["appearances"], message: "外观身份重复" });
  if (!ids.includes(project.defaultAppearanceId)) context.addIssue({ code: "custom", path: ["defaultAppearanceId"], message: "默认外观不存在" });
});
export type CharacterProject = z.infer<typeof characterProjectSchema>;
export type CharacterAppearance = CharacterProject["appearances"][number];

export function newCharacterProject(name = "角色"): CharacterProject {
  return { version: 1, name, description: "", defaultAppearanceId: "base", appearances: [{ id: "base", name: "默认", description: "", referenceArtworkIds: [] }] };
}
export function characterInputIdentity(id: string, appearanceId: string) {
  return `character:${characterIdSchema.parse(id)}#${characterAppearanceIdSchema.parse(appearanceId)}`;
}
export function parseCharacterInputIdentity(nodeId: string): { id: string; appearanceId: string } | null {
  if (!nodeId.startsWith("character:")) return null;
  const separator = nodeId.lastIndexOf("#");
  const id = characterIdSchema.safeParse(nodeId.slice(10, separator));
  const appearanceId = characterAppearanceIdSchema.safeParse(nodeId.slice(separator + 1));
  if (separator < 10 || !id.success || !appearanceId.success) return null;
  return { id: id.data, appearanceId: appearanceId.data };
}
export function characterReferenceText(project: CharacterProject, appearanceId: string) {
  const appearance = project.appearances.find(item => item.id === appearanceId);
  if (!appearance) throw new Error("角色外观不存在");
  return [project.name, project.description.trim(), `${appearance.name}${appearance.description.trim() ? `：${appearance.description.trim()}` : ""}`].filter(Boolean).join("\n");
}
export function frozenCharacterInputIdentity(id: string, appearanceId: string, revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("角色版本无效");
  return `inline:${characterInputIdentity(id, appearanceId)}@${revision}`;
}
