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
    let geometry = new WeakMap<Element, { box: PaintBox; version: number }>();
    const versions = new WeakMap<Element, number>();
    let zoom = 1, x = 0, y = 0, left = 0, top = 0;
    const box = (element: Element, pad = 0): PaintBox => {
      const scope = element.closest('.react-flow__node,.react-flow__edge') || element;
      const version = versions.get(scope) || 0;
      let measured = geometry.get(element);
      if (!measured || measured.version !== version) {
        const rect = element.getBoundingClientRect();
        measured = { version, box: { left: (rect.left - left - x) / zoom, top: (rect.top - top - y) / zoom,
          right: (rect.right - left - x) / zoom, bottom: (rect.bottom - top - y) / zoom } };
        geometry.set(element, measured);
      }
      return { left: measured.box.left - pad, top: measured.box.top - pad, right: measured.box.right + pad, bottom: measured.box.bottom + pad };
    };
    const inspect = () => {
      queued = false;
      if (disposed) return;
      const transform = root.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform;
      zoom = Number(transform?.match(/scale\(([^)]+)\)/)?.[1]);
      const translation = transform?.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
      x = Number(translation?.[1]); y = Number(translation?.[2]);
      const origin = root.getBoundingClientRect(); left = origin.left; top = origin.top;
      let allowed = Number.isFinite(zoom) && zoom > 0 && Number.isFinite(x) && Number.isFinite(y);
      const background: BackgroundPaint[] = [];
      for (const node of root.querySelectorAll<HTMLElement>('.react-flow__node')) {
        if (!(Number(node.style.zIndex) < 0)) continue;
        const group = node.querySelector('[data-testid="workflow-group"]');
        if (group) background.push({ box: box(group), borderOnly: true, title: group.querySelector('button') ? box(group.querySelector('button')!, 4) : undefined });
        else {
          const decoration = node.querySelector('[data-testid="workflow-decoration"]');
          if (decoration) {
            const image = decoration.querySelector('img');
            background.push({ box: box(image || decoration, 2) });
            const missing = decoration.querySelector('button');
            if (missing) background.push({ box: box(missing, 2) });
          } else {
            // Arbitrary user layer order may include ports/rings/shadows beyond
            // the fixed frame. Keep the native cross-container plane outright.
            allowed = false;
            background.push({ box: box(node, 3) });
            // Titles/ports can paint outside a negative custom-order node box.
            for (const child of node.querySelectorAll('.art-title,.art-port')) background.push({ box: box(child, 3) });
          }
        }
      }
      const edges: PaintBox[] = [];
      for (const edge of root.querySelectorAll<SVGElement>('.react-flow__edge')) {
        // Nonzero edge z-index is meaningful across the native nodes container.
        if (Number(edge.ownerSVGElement?.style.zIndex || 0) !== 0) allowed = false;
        const path = edge.querySelector('.cw-base');
        if (!path) { allowed = false; continue; }
        edges.push(box(path, path.classList.contains('cw-on') ? 64 : 3));
      }
      allowed &&= canCompositeCanvasLayers(background, edges, 2);
      const state = allowed ? 'composite' : 'original';
      if (root.dataset.canvasLayerOrder !== state) root.dataset.canvasLayerOrder = state;
    };
    inspect();
    const observer = new MutationObserver(records => {
      let spatial = false;
      for (const record of records) {
        const target = record.target as Element;
        // Panning/zooming writes only this parent transform. Reading it here
        // would recreate the per-frame layout work this module removes.
        if (record.type === 'childList') spatial = true;
        if (target.matches('.react-flow__viewport,.react-flow')) continue;
        const scope = target.closest('.react-flow__node,.react-flow__edge');
        if (scope) { versions.set(scope, (versions.get(scope) || 0) + 1); spatial = true; }
      }
      if (spatial && !queued) { queued = true; queueMicrotask(inspect); }
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'd', 'class'] });
    const resize = new ResizeObserver(() => { geometry = new WeakMap(); if (!queued) { queued = true; queueMicrotask(inspect); } });
    resize.observe(root);
    return () => { disposed = true; observer.disconnect(); resize.disconnect(); delete root.dataset.canvasLayerOrder; };
  }, []);
  return <span ref={anchor} hidden aria-hidden="true" />;
}
