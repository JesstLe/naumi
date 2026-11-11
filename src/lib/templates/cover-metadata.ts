import "server-only";
import { getMediaAssets } from "@/lib/media-assets-reader";
import { storageKeyFromManagedUrl } from "@/lib/object-storage/runtime";
import type { TemplateCover } from "./cover-layout";
import { bundledTemplateCover } from "./cover-repairs";

/** Batch read existing media metadata; no remote fetch, backfill or template write. */
export async function withTemplateCovers<T extends { image: string }>(rows: T[]): Promise<Array<T & { cover?: TemplateCover }>> {
  const keys = rows.map(row => storageKeyFromManagedUrl(row.image));
  const assets = await getMediaAssets(keys.filter((key): key is string => !!key));
  return rows.map((row, index) => {
    const bundled = bundledTemplateCover(row.image);
    if (bundled) return { ...row, cover: bundled };
    const asset = keys[index] ? assets.get(keys[index]!) : undefined;
    return asset?.width && asset.height
      ? { ...row, cover: { source: row.image, width: asset.width, height: asset.height } }
      : row;
  });
}
