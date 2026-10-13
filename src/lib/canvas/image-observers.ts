/** One observer per canvas root and one size observer per document. Zoom does
 * not change an element's local dimensions, so neither is recreated on zoom. */
type Visibility = (visible: boolean) => void;
type Size = (width: number, height: number) => void;
const visibilityPools = new Map<Element | null, {
  observer: IntersectionObserver;
  listeners: Map<Element, Visibility>;
}>();
let sizes: { observer: ResizeObserver; listeners: Map<Element, Size> } | undefined;

export function observeCanvasImageVisibility(element: Element, callback: Visibility) {
  const root = element.closest('.react-flow');
  let pool = visibilityPools.get(root);
  if (!pool) {
    const listeners = new Map<Element, Visibility>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
    }, { root, rootMargin: '180px', threshold: 0 });
    pool = { observer, listeners }; visibilityPools.set(root, pool);
  }
  const current = pool;
  current.listeners.set(element, callback); current.observer.observe(element);
  return () => {
    if (current.listeners.get(element) !== callback) return;
    current.listeners.delete(element); current.observer.unobserve(element);
    if (!current.listeners.size) { current.observer.disconnect(); visibilityPools.delete(root); }
  };
}

export function observeCanvasImageSize(element: Element, callback: Size) {
  if (!sizes) {
    const listeners = new Map<Element, Size>();
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) listeners.get(entry.target)?.(entry.contentRect.width, entry.contentRect.height);
    });
    sizes = { observer, listeners };
  }
  const current = sizes;
  current.listeners.set(element, callback); current.observer.observe(element);
  return () => {
    if (current.listeners.get(element) !== callback) return;
    current.listeners.delete(element); current.observer.unobserve(element);
    if (!current.listeners.size) { current.observer.disconnect(); if (sizes === current) sizes = undefined; }
  };
}
