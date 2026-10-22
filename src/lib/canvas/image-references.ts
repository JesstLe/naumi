import { referenceRoleSchema, type ReferenceRole, type CanvasReferenceManifest } from "../imagegen/reference-labels";

export type ImageReferenceBinding = { key: string; number: number; role: ReferenceRole };
export type ImageReferenceCandidate = { key: string; title: string; url: string; sourceNodeId?: string; file?: File };
export type CanvasImageReference = ImageReferenceCandidate & ImageReferenceBinding;

/** A previous task's numbered references do not identify this node's inputs. */
export function inheritableImagePrompt(prompt: string | null | undefined): string {
  return /【图\d+】/.test(prompt || "") ? "" : prompt?.trim() || "";
}

export function readImageReferenceBindings(value: unknown): ImageReferenceBinding[] {
  if (!Array.isArray(value)) return [];
  const keys = new Set<string>(), numbers = new Set<number>();
  return value.flatMap(row => {
    if (!row || typeof row.key !== "string" || row.key.length > 200 || !Number.isInteger(row.number) || row.number < 1 || row.number > 99999 || !referenceRoleSchema.safeParse(row.role).success || keys.has(row.key) || numbers.has(row.number)) return [];
    keys.add(row.key); numbers.add(row.number);
    return [{ key: row.key, number: row.number, role: row.role }];
  });
}

/** Keep removed slots as tombstones: a prompt's 图2 must never become another image. */
export function resolveCanvasImageReferences(candidates: ImageReferenceCandidate[], saved: ImageReferenceBinding[] = []) {
  const bindings = saved.map(binding => ({ ...binding }));
  let next = Math.max(0, ...bindings.map(binding => binding.number)) + 1;
  for (const candidate of candidates) if (!bindings.some(binding => binding.key === candidate.key)) {
    bindings.push({ key: candidate.key, number: next++, role: bindings.length ? "reference" : "edit-target" });
  }
  const references = candidates.map(candidate => ({ ...candidate, ...bindings.find(binding => binding.key === candidate.key)! }))
    .sort((a, b) => Number(b.role === "edit-target") - Number(a.role === "edit-target") || a.number - b.number);
  return { bindings, references };
}

export function changeImageReferenceRole(bindings: ImageReferenceBinding[], key: string, role: ReferenceRole): ImageReferenceBinding[] {
  return bindings.map(binding => binding.key === key ? { ...binding, role } : role === "edit-target" && binding.role === "edit-target" ? { ...binding, role: "reference" } : binding);
}

export function imageReferenceManifest(references: CanvasImageReference[]): CanvasReferenceManifest {
  return references.map(({ number, role, title, sourceNodeId }) => ({ number, role, title: title.slice(0, 100), ...(sourceNodeId ? { sourceNodeId } : {}) }));
}

export function insertImageReference(prompt: string, number: number, start: number, end = start) {
  const before = prompt.slice(0, start), mention = before.match(/@[^\s@【】]*$/);
  const from = mention ? start - mention[0].length : start;
  const token = `【图${number}】`;
  return { prompt: prompt.slice(0, from) + token + prompt.slice(end), caret: from + token.length };
}
