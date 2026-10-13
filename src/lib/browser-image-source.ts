/** Only stable managed images, never arbitrary URLs, signed queries or video. */
export function managedImageSource(raw: string, origin: string): string | null {
  try {
    let url = new URL(raw, origin);
    if (url.origin === origin && url.pathname === '/_next/image') {
      const inner = new URL(url.searchParams.get('url') || '', origin);
      if (inner.origin !== origin || !inner.pathname.startsWith('/media/')) return null;
      const width = Number(url.searchParams.get('w'));
      inner.search = width > 0 ? `variant=${width <= 640 ? 'thumbnail' : 'preview'}` : '';
      url = inner;
    }
    if (url.origin !== origin || !/^\/media\/.+\.(png|jpe?g|webp|avif|gif)$/i.test(url.pathname)) return null;
    const parts = decodeURIComponent(url.pathname.slice(7)).split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || /[\\\u0000]/.test(part))) return null;
    const variant = url.searchParams.get('variant');
    return url.pathname + (variant === 'thumbnail' || variant === 'preview' ? '?variant=' + variant : '');
  } catch { return null; }
}
export type BrowserImageDescriptor = { account: string; source: string; version: string; fetchUrl: string; bytes: number; contentType: string };
