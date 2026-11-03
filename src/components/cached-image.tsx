'use client';
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, useCallback, type ImgHTMLAttributes } from 'react';
import { type BrowserImageReadOptions, acquireCanvasImageByteSlot, acquireBrowserImage, borrowActiveBrowserImage, imageCacheAccount, imageCacheSource, publicCachedImage } from '@/lib/browser-image-cache';
import { withBrowserReadDeadline } from '@/lib/browser-read-deadline';

type ImageLease = Awaited<ReturnType<typeof acquireBrowserImage>>;
type Display = ImageLease & { identity: string; source: string; owner: string; revision: number };
type Props = ImgHTMLAttributes<HTMLImageElement> & {
  onCacheSettled?: () => void;
  networkQueue?: BrowserImageReadOptions['networkQueue'];
  /** Same underlying asset across quality variants, never across different images. */
  imageIdentity?: string;
  /** Opt-in first-frame handoff from an already authorized, visible image. */
  reuseActivePreview?: boolean;
};

async function decodeImage(url: string, crossOrigin: Props['crossOrigin'], signal: AbortSignal) {
  const image = new Image();
  if (crossOrigin) image.crossOrigin = crossOrigin;
  const cancel = () => { image.src = ''; };
  await withBrowserReadDeadline(async decodeSignal => {
    decodeSignal.addEventListener('abort', cancel, { once: true });
    try {
      decodeSignal.throwIfAborted();
      image.src = url;
      await image.decode();
      decodeSignal.throwIfAborted();
      if (!image.naturalWidth) throw new Error('Image decode failed');
    } finally { decodeSignal.removeEventListener('abort', cancel); }
  }, { timeoutMs: 20000, signal });
}

/** Keep an authorized, decoded frame until its replacement is ready. Byte
 * caching alone does not prevent a blank frame when React changes img.src. */
export const CachedImage = forwardRef<HTMLImageElement, Props>(function CachedImage(
  { src, loading, onError, onCacheSettled, networkQueue, imageIdentity, reuseActivePreview, ...props }, forwarded,
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
  useLayoutEffect(() => {
    if (!reuseActivePreview || !managed || !visible || !owner || typeof src !== 'string') return;
    if (held.current?.identity === identity && held.current.owner === owner && held.current.revision === revision) return;
    releaseDisplay();
    const preview = borrowActiveBrowserImage(src);
    if (!preview) return;
    const next = { ...preview, identity, source: preview.source || managed, owner, revision };
    held.current = next; setResolved(next);
  }, [reuseActivePreview, src, managed, visible, identity, owner, revision, releaseDisplay]);
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
      try { await decodeImage(candidate.url, props.crossOrigin, controller.signal); }
      catch (error) {
        candidate.release(); candidate = undefined;
        if (!managed || controller.signal.aborted || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))) throw error;
        // One fresh, authorized read repairs a corrupt local entry. Do not
        // clear drafts/session data, reuse a denied frame, or retry in a loop.
        candidate = await acquireBrowserImage(src, controller.signal, { networkQueue, bypassCache: true });
        if (controller.signal.aborted) { candidate.release(); return; }
        await decodeImage(candidate.url, props.crossOrigin, controller.signal);
      }
      candidate.networkComplete?.();
      if (!managed) candidate.release(); // native byte slot is done after decode
      if (controller.signal.aborted) { candidate.release(); return; }
      candidate.markDecoded?.();
      const next = { ...candidate, identity, source: managed || src, owner, revision };
      candidate = undefined; // display now owns this lease, not the request effect
      if (held.current) retired.current.push(held.current);
      held.current = next; setResolved(next);
    })().catch(error => {
      candidate?.release(); candidate = undefined;
      if (!controller.signal.aborted) {
        // A timed-out upgrade is not evidence that a current, same-identity
        // authorized frame became invalid. Denials/account resets still clear it.
        const previous=held.current;
        const retain=error instanceof Error && error.name==='TimeoutError' && previous?.identity===identity && previous.owner===owner && previous.revision===revision;
        if (!retain) { releaseDisplay(); setResolved(null); setDenied(src); }
      }
    }).finally(() => { if (!controller.signal.aborted) callbacks.current.onCacheSettled?.(); });
    return () => { controller.abort(); candidate?.release(); };
  }, [src, managed, controlled, identity, owner, visible, revision, networkQueue, props.crossOrigin, releaseDisplay]);
  const frame = src && resolved?.identity === identity && resolved.owner === owner && resolved.revision === revision ? resolved : null;
  // Preview buttons already have an accessible name. A cold request must not
  // paint broken-image alt text while it authorizes; error callbacks still run.
  return <img {...props} ref={attach} loading={loading}
    style={reuseActivePreview && controlled && !frame ? { ...props.style, visibility: 'hidden' } : props.style}
    src={controlled ? (denied === src ? 'data:image/png;base64,invalid' : frame?.url) : src}
    data-browser-image-denied={denied === src ? 'true' : undefined}
    data-browser-image-cache={managed ? (frame?.url.startsWith('blob:') ? 'local' : 'pending') : 'native'}
    onLoad={props.onLoad}
    onError={event => {
      onError?.(event);
      if (denied === src) event.currentTarget.removeAttribute('src');
    }} />;
});
