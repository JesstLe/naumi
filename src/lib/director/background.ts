/** Center-cover a regular 2D plate without changing its projection into a sphere. */
export function directorBackgroundCrop(imageAspect: number, frameAspect: number) {
  if (!Number.isFinite(imageAspect) || imageAspect <= 0 || !Number.isFinite(frameAspect) || frameAspect <= 0) return {repeat: [1, 1] as [number, number], offset: [0, 0] as [number, number]};
  const repeat: [number, number] = imageAspect > frameAspect ? [frameAspect / imageAspect, 1] : [1, imageAspect / frameAspect];
  return {repeat, offset: [(1 - repeat[0]) / 2, (1 - repeat[1]) / 2] as [number, number]};
}
