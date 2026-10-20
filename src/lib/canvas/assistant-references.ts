/** Explicit attachments take precedence over inherited ancestors; keep the anchor first. */
export const MAX_ASSISTANT_IMAGES = 5;
export function assistantReferences<T extends { id: string }>(
  inherited: T[], attached: T[], excluded: string[] = [],
): T[] {
  const hidden = new Set(excluded), seen = new Set<string>();
  return [...inherited.slice(0, 1), ...attached, ...inherited.slice(1)]
    .filter(image => !hidden.has(image.id) && !seen.has(image.id) && !!seen.add(image.id))
    .slice(0, MAX_ASSISTANT_IMAGES);
}

export function assistantAttachmentCapacity(referenceIds: string[]) {
  return Math.max(0, MAX_ASSISTANT_IMAGES - new Set(referenceIds).size);
}
