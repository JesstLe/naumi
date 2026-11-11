/** Dimensions belong to the delivered source, never just a mutable template id. */
export type TemplateCover = { source: string; width: number; height: number };
type CoverInput = { image: string; cover?: TemplateCover };

export function templateCoverDimensions({ image, cover }: CoverInput): readonly [number, number] {
  if (cover?.source === image && Number.isSafeInteger(cover.width) && cover.width > 0
    && Number.isSafeInteger(cover.height) && cover.height > 0) return [cover.width, cover.height];
  // Keep a stable slot even for external/unknown media. Loading the image must
  // not change the card height or the masonry column assignment.
  return [4, 5];
}
