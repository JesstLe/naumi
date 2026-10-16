/** Stable managed images and resource-scoped team previews, not signed links. */
export function managedImageSource(raw: string, origin: string): string | null {
  try {
    let url = new URL(raw, origin);
    if(url.origin===origin && /^\/api\/(team|enterprise)\/media$/.test(url.pathname)){
      const group=url.pathname.includes('/enterprise/')?'enterpriseId':'teamId';
      const id=url.searchParams.get('id'),email=url.searchParams.get('email'),owner=url.searchParams.get(group);
      if(!id||id.length>200||!email||email.length>254||!owner||!/^[0-9a-f-]{36}$/i.test(owner))return null;
      return url.pathname+'?'+new URLSearchParams({[group]:owner,email:email.toLowerCase(),id,...(group==='enterpriseId'&&url.searchParams.get('full')==='1'?{full:'1'}:{})});
    }
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
export function publicImageSource(source:string){
  try{return /^\/media\/(brand|library|templates|template-cache)\//.test(decodeURIComponent(source.split('?')[0]));}catch{return false;}
}
