/** Match the original edge-hover stacking-plane guard without a graph-wide
 * relational :has(:hover) selector. Transition synchronously before paint,
 * never read geometry or subscribe the controlled graph to cursor movement. */
export function bindCanvasHoverPlane(root: HTMLElement) {
  let disposed = false;
  const update = (target: EventTarget | null) => {
    if (disposed) return;
    const element = target as Element | null;
    const edge = typeof element?.closest === 'function' ? element.closest('.react-flow__edge') : null;
    // Preserve the original descendant :has semantics, including a nested
    // React Flow. Only an edge outside this root must be ignored.
    const hovered = !!edge && root.contains(edge);
    if (hovered) {
      if (root.dataset.canvasEdgeHover !== 'true') root.dataset.canvasEdgeHover = 'true';
    } else if (root.dataset.canvasEdgeHover !== undefined) {
      delete root.dataset.canvasEdgeHover;
    }
  };
  const enter = (event: MouseEvent) => update(event.target);
  const leave = (event: MouseEvent) => update(event.relatedTarget);
  // Capture observes the original SVG interaction paths even when a child
  // handler stops bubbling. Moves within an edge write no root attribute.
  root.addEventListener('mouseover', enter, true);
  root.addEventListener('mouseout', leave, true);
  // A scene/guard can mount under a stationary cursor. This is a one-time
  // bounded check, not a live stylesheet dependency or a layout measurement.
  const refresh = () => {
    if (!disposed) update(root.querySelector('.react-flow__edge:hover'));
  };
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      root.removeEventListener('mouseover', enter, true);
      root.removeEventListener('mouseout', leave, true);
      delete root.dataset.canvasEdgeHover;
    },
  };
}
