/** Controlled textarea state contains the newest draft before blur. The
 * focus-time string, including an empty string, is the content undo baseline.
 * Preserve current non-content fields so unrelated reference/size edits survive. */
export function canvasTextEditPatch<T extends { content: string }>(current: T, draft: string, initialContent?: string) {
  const from = { ...current, content: initialContent ?? current.content };
  const to = { ...current, content: draft.slice(0, 12000) };
  return from.content === to.content ? null : { from, to };
}
