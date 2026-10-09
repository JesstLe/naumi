/** Keep portalled menus inside the viewport, including short and narrow windows. */
export function qualityMenuPosition(rect: { left: number; top: number; bottom: number; width: number }, viewportWidth: number, viewportHeight: number, count: number) {
  const margin = 8, gap = 6;
  const width = Math.min(Math.max(rect.width, 208), Math.max(0, viewportWidth - margin * 2));
  const below = Math.max(0, viewportHeight - rect.bottom - gap - margin);
  const above = Math.max(0, rect.top - gap - margin);
  const estimate = Math.min(count * 36 + 8, 320);
  const down = below >= estimate || below >= above;
  const maxHeight = Math.min(estimate, down ? below : above);
  return {
    left: Math.max(margin, Math.min(rect.left, viewportWidth - width - margin)),
    top: Math.max(margin, Math.min(down ? rect.bottom + gap : rect.top - gap - maxHeight, viewportHeight - maxHeight - margin)),
    width,
    maxHeight,
  };
}

export function nextQualityOption(options: readonly { disabled?: boolean }[], current: number, direction: 1 | -1) {
  for (let step = 1; step <= options.length; step++) {
    const index = ((current + direction * step) % options.length + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}
