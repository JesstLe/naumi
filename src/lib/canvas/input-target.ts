/** Persistent controls own their keyboard events; only modal layers block the canvas. */
export const CANVAS_MODAL_SELECTOR='.fixed.inset-0, [data-canvas-hotkeys-blocked="true"][aria-modal="true"]';

export function isEditableClipboardTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(
    element.closest(
      'input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
    )
  );
}
