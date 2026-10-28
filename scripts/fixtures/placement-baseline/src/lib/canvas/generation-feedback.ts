export function placeGenerationPreview(preferred: { x: number; y: number }, size: { width: number; height: number },
  occupied: Array<{ x: number; y: number; width: number; height: number }>) {
  const position = { ...preferred };
  const touches = (point: typeof preferred, rect: typeof occupied[number]) =>
    point.x < rect.x + rect.width + 32 && point.x + size.width + 32 > rect.x &&
    point.y < rect.y + rect.height + 48 && point.y + size.height + 48 > rect.y;
  if (!occupied.some(rect => touches(position, rect))) return position;
  // Try nearby free edges before the old downward sweep. A busy column must not
  // send a new placeholder to the distant bottom of the entire canvas.
  const candidates = occupied.flatMap(rect => [
    { x: preferred.x, y: rect.y + rect.height + 48 },
    { x: rect.x + rect.width + 32, y: preferred.y },
    { x: preferred.x, y: rect.y - size.height - 48 },
    { x: rect.x - size.width - 32, y: preferred.y },
  ]).sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y));
  for (const candidate of candidates) if (!occupied.some(rect => touches(candidate, rect))) return candidate;
  for (let i = 0; i <= occupied.length; i++) {
    const overlaps = occupied.filter(rect => position.x < rect.x + rect.width + 32 && position.x + size.width + 32 > rect.x
      && position.y < rect.y + rect.height + 48 && position.y + size.height + 48 > rect.y);
    if (!overlaps.length) return position;
    position.y = Math.max(...overlaps.map(rect => rect.y + rect.height + 48));
  }
  return position;
}
