/** The retired segmentation labels are not image-model quality tiers.
 * Keep old tabs compatible without changing the raw request/fingerprint.
 */
export const CUTOUT_IMAGE_QUALITY = "medium";
export function cutoutImageQuality(value: string | null | undefined): string | undefined {
  return value && /^(fine|fast)$/i.test(value.trim()) ? CUTOUT_IMAGE_QUALITY : value ?? undefined;
}
