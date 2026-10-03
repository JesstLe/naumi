import { IMAGE_QUALITY_IDS, type ImageQualityId } from "@/lib/image-quality";

// Requests use the rendered preference while the saved value is being restored.
let current: ImageQualityId = "medium";
export function currentImageQuality() { return current; }
export function updateCurrentImageQuality(value: string) {
  current = IMAGE_QUALITY_IDS.includes(value as ImageQualityId) ? value as ImageQualityId : "medium";
}
