import type { Artwork } from "../mock-data";

/** Explicit incoming links are inputs; a hidden project parent is not. Never
 * walk the entire generation ancestry and silently resurrect old references. */
export function canvasGenerationReferences(selected: Artwork | null, members: Artwork[]): Artwork[] {
  if (!selected) return [];
  const byId = new Map(members.map(art => [art.id, art]));
  const incoming = [...new Set(selected.parentIds || [])].filter(id => id && id !== selected.id);
  if (incoming.length + 1 > 16) throw new Error("一次最多使用16张图片，请移除多余连线");
  const refs = incoming.map(id => byId.get(id));
  if (refs.some(ref => !ref || !ref.image || ref.videoUrl)) throw new Error("已连接的参考图片尚未载入，请先同步图片或移除无效连线");
  // Product inputs come first (edit target); the selected composition comes last
  // (reference). The planner therefore follows the reference frame on auto.
  return [...refs as Artwork[], selected];
}

export function explicitCanvasParent(art: Pick<Artwork, "parentId" | "parentIds" | "source">, id: string) {
  return !!art.parentIds?.includes(id) || art.source !== "canvas-add" && art.parentId === id;
}

export function missingCanvasArtworks(ids: readonly string[], artworks: readonly Pick<Artwork, "id" | "image">[]) {
  return [...new Set(ids)].filter(id => !artworks.some(art => art.id === id && !!art.image));
}

/** Only read already-committed IDs. Retry synchronization, never upload/generate.
 * A failed/empty GET must not be displayed as a successful canvas import. */
export async function synchronizeCanvasArtworks<T extends Pick<Artwork, "id" | "image">>(
  ids: string[], read: () => Promise<T[]>, isCurrent: () => boolean,
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 250)),
): Promise<T[]> {
  let error: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!isCurrent()) throw new Error("账号已切换；图片已保存，请返回原账号查看");
    try {
      const rows = await read();
      if (!isCurrent()) throw new Error("账号已切换；图片已保存，请返回原账号查看");
      if (!missingCanvasArtworks(ids, rows).length) return rows;
      error = new Error("图片已保存，画布尚未同步完成，请点击同步图片；无需重新上传");
    } catch (failure) { error = failure; }
    if (attempt < 2) await pause();
  }
  throw error instanceof Error ? error : new Error("图片已保存，画布同步暂未完成；无需重新上传");
}

/** Preserve both the real image aspect and the user's chosen display scale. */
export function imageAspectDisplaySize(width: number, height: number, sourceWidth?: number | null, sourceHeight?: number | null) {
  if (!(sourceWidth && sourceHeight && sourceWidth > 0 && sourceHeight > 0 && width > 0 && height > 0)) return { width, height };
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return { width: Math.max(1, Math.round(sourceWidth * scale)), height: Math.max(1, Math.round(sourceHeight * scale)) };
}
