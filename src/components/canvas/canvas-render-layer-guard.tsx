'use client';
import { useLayoutEffect, useRef } from 'react';
import { canCompositeCanvasLayers, type BackgroundPaint, type PaintBox } from '@/lib/canvas/render-layer-order';

/** Read geometry only when scene geometry/content changes, never for viewport
 * transforms. The native z-order is restored before painting any uncertain or
 * overlapping background/edge scene. No node is reparented or duplicated. */
export function CanvasRenderLayerGuard() {
  const anchor = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = anchor.current?.closest<HTMLElement>('.react-flow');
    if (!root) return;
    let disposed = false, queued = false;
    const box = (element: Element, pad = 0): PaintBox => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left - pad, top: rect.top - pad, right: rect.right + pad, bottom: rect.bottom + pad };
    };
    const inspect = () => {
      queued = false;
      if (disposed) return;
      const zoom = Number(root.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
      let allowed = Number.isFinite(zoom) && zoom > 0;
      const background: BackgroundPaint[] = [];
      for (const node of root.querySelectorAll<HTMLElement>('.react-flow__node')) {
        if (!(Number(node.style.zIndex) < 0)) continue;
        const group = node.querySelector('[data-testid="workflow-group"]');
        if (group) background.push({ box: box(group), borderOnly: true, title: group.querySelector('button') ? box(group.querySelector('button')!, 4 * zoom) : undefined });
        else {
          const decoration = node.querySelector('[data-testid="workflow-decoration"]');
          if (decoration) {
            const image = decoration.querySelector('img');
            background.push({ box: box(image || decoration, 2 * zoom) });
            const missing = decoration.querySelector('button');
            if (missing) background.push({ box: box(missing, 2 * zoom) });
          } else {
            background.push({ box: box(node, 3 * zoom) });
            // Titles/ports can paint outside a negative custom-order node box.
            for (const child of node.querySelectorAll('.art-title,.art-port')) background.push({ box: box(child, 3 * zoom) });
          }
        }
      }
      const edges: PaintBox[] = [];
      for (const edge of root.querySelectorAll<SVGElement>('.react-flow__edge')) {
        // Nonzero edge z-index is meaningful across the native nodes container.
        if (Number(edge.ownerSVGElement?.style.zIndex || 0) !== 0) allowed = false;
        const path = edge.querySelector('.cw-base');
        if (!path) { allowed = false; continue; }
        edges.push(box(path, (path.classList.contains('cw-on') ? 64 : 3) * zoom));
      }
      allowed &&= canCompositeCanvasLayers(background, edges, 2 * zoom);
      const state = allowed ? 'composite' : 'original';
      if (root.dataset.canvasLayerOrder !== state) root.dataset.canvasLayerOrder = state;
    };
    inspect();
    const observer = new MutationObserver(records => {
      const spatial = records.some(record => {
        if (record.type === 'childList') return true;
        const target = record.target as Element;
        // Panning/zooming writes only this parent transform. Reading it here
        // would recreate the per-frame layout work this module removes.
        return !target.matches('.react-flow__viewport,.react-flow') &&
          !!target.closest('.react-flow__node,.react-flow__edge');
      });
      if (spatial && !queued) { queued = true; queueMicrotask(inspect); }
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'd', 'class'] });
    return () => { disposed = true; observer.disconnect(); delete root.dataset.canvasLayerOrder; };
  }, []);
  return <span ref={anchor} hidden aria-hidden="true" />;
}
