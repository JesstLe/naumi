'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { CachedImage } from '@/components/cached-image';
import { cdnThumb } from '@/lib/cdn';

/** Retain visited covers and scroll position during canvas/project navigation.
 * The caller keys this surface by account/workspace; never keep another scope. */
export function ProjectBrowserSurface({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(visible);
  useEffect(() => { if (visible) setVisited(true); }, [visible]);
  if (!visible && !visited) return null;
  return <div hidden={!visible} data-testid="canvas-project-browser"
    className="h-full overflow-y-auto bg-[#f6f7f9] px-4 py-6 text-[#20242c] sm:px-8 sm:py-8">{children}</div>;
}

export function ProjectCover({ source, title }: { source: string; title: string }) {
  return <CachedImage src={cdnThumb(source, 512)} alt={title} loading="lazy" decoding="async"
    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" />;
}
