'use client';
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, useCallback, type ImgHTMLAttributes } from 'react';
import { type BrowserImageReadOptions, acquireCanvasImageByteSlot, acquireBrowserImage, imageCacheAccount, imageCacheSource, publicCachedImage } from '@/lib/browser-image-cache';

type ImageLease = Awaited<ReturnType<typeof acquireBrowserImage>>;
type Display = ImageLease & { identity: string; source: string; owner: string; revision: number };
type Props = ImgHTMLAttributes<HTMLImageElement> & {
  onCacheSettled?: () => void;
  networkQueue?: BrowserImageReadOptions['networkQueue'];
  /** Same underlying asset across quality variants, never across different images. */
  imageIdentity?: string;
};

async function decodeImage(url: string, crossOrigin: Props['crossOrigin'], signal: AbortSignal) {
  const image = new Image();
  if (crossOrigin) image.crossOrigin = crossOrigin;
  const cancel = () => { image.src = ''; };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    image.src = url;
    await image.decode();
    if (!image.naturalWidth) throw new Error('Image decode failed');
  } finally { signal.removeEventListener('abort', cancel); }
}

/** Keep an authorized, decoded frame until its replacement is ready. Byte
 * caching alone does not prevent a blank frame when React changes img.src. */
export const CachedImage = forwardRef<HTMLImageElement, Props>(function CachedImage(
  { src, loading, onError, onCacheSettled, networkQueue, imageIdentity, ...props }, forwarded,
) {
  const ref = useRef<HTMLImageElement | null>(null);
  const held = useRef<Display | null>(null), retired = useRef<ImageLease[]>([]);
  const [visible, setVisible] = useState(loading !== 'lazy');
  const [revision, setRevision] = useState(0);
  const [resolved, setResolved] = useState<Display | null>(null), [denied, setDenied] = useState('');
  const callbacks = useRef({ onCacheSettled }); callbacks.current = { onCacheSettled };
  const managed = typeof src === 'string' ? imageCacheSource(src) : null;
  const controlled = !!managed || networkQueue === 'canvas';
  const identity = imageIdentity ?? (typeof src === 'string' ? src : '');
  const owner = managed ? (publicCachedImage(src as string) ? 'public' : imageCacheAccount()) : 'native';
  const attach = useCallback((node: HTMLImageElement | null) => {
    ref.current = node;
    if (typeof forwarded === 'function') forwarded(node); else if (forwarded) forwarded.current = node;
  }, [forwarded]);
  const releaseDisplay = useCallback(() => {
    held.current?.release(); held.current = null;
    for (const lease of retired.current.splice(0)) lease.release();
  }, []);
  useEffect(() => {
    if (loading !== 'lazy') { setVisible(true); return; }
    if (!ref.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '180px' });
    observer.observe(ref.current); return () => observer.disconnect();
  }, [loading]);
  useEffect(() => {
    const reset = () => {
      // Revoke pixels synchronously, including a hidden project cover.
      if (controlled) ref.current?.removeAttribute('src');
      releaseDisplay(); setResolved(null); setDenied(''); setRevision(n => n + 1);
    };
    const invalidate = (event: Event) => {
      const source = (event as CustomEvent<{ source: string }>).detail?.source;
      if (source === managed || source === held.current?.source) reset();
    };
    window.addEventListener('naumi:image-cache-session', reset);
    window.addEventListener('naumi:image-cache-invalidated', invalidate);
    return () => {
      window.removeEventListener('naumi:image-cache-session', reset);
      window.removeEventListener('naumi:image-cache-invalidated', invalidate);
    };
  }, [controlled, managed, releaseDisplay]);
  useLayoutEffect(() => {
    // React has committed the new src; only now release the previous Blob URL.
    for (const lease of retired.current.splice(0)) lease.release();
  }, [resolved]);
  useEffect(() => releaseDisplay, [releaseDisplay]);
  useEffect(() => {
    setDenied('');
    if (held.current && (held.current.identity !== identity || held.current.owner !== owner || held.current.revision !== revision || !src)) {
      releaseDisplay(); setResolved(null);
    }
    if (!controlled || !src || typeof src !== 'string' || !visible || !owner) return;
    const controller = new AbortController();
    let candidate: ImageLease | undefined;
    void (async () => {
      candidate = managed ? await acquireBrowserImage(src, controller.signal, { networkQueue }) :
        { url: src, release: await acquireCanvasImageByteSlot(controller.signal) };
      if (controller.signal.aborted) { candidate.release(); return; }
      await decodeImage(candidate.url, props.crossOrigin, controller.signal);
      candidate.networkComplete?.();
      if (!managed) candidate.release(); // native byte slot is done after decode
      if (controller.signal.aborted) { candidate.release(); return; }
      const next = { ...candidate, identity, source: managed || src, owner, revision };
      candidate = undefined; // display now owns this lease, not the request effect
      if (held.current) retired.current.push(held.current);
      held.current = next; setResolved(next);
    })().catch(() => {
      candidate?.release(); candidate = undefined;
      if (!controller.signal.aborted) { releaseDisplay(); setResolved(null); setDenied(src); }
    }).finally(() => { if (!controller.signal.aborted) callbacks.current.onCacheSettled?.(); });
    return () => { controller.abort(); candidate?.release(); };
  }, [src, managed, controlled, identity, owner, visible, revision, networkQueue, props.crossOrigin, releaseDisplay]);
  const frame = src && resolved?.identity === identity && resolved.owner === owner && resolved.revision === revision ? resolved : null;
  return <img {...props} ref={attach} loading={loading}
    src={controlled ? (denied === src ? 'data:image/png;base64,invalid' : frame?.url) : src}
    data-browser-image-denied={denied === src ? 'true' : undefined}
    data-browser-image-cache={managed ? (frame?.url.startsWith('blob:') ? 'local' : 'pending') : 'native'}
    onLoad={props.onLoad}
    onError={event => {
      onError?.(event);
      if (denied === src) event.currentTarget.removeAttribute('src');
    }} />;
});
