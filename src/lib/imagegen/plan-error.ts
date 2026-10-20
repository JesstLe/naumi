/** Trusted local planning rejections, never an upstream response body. */
export class ImagegenPlanError extends Error {
  constructor(message: string, readonly code = "IMAGEGEN_INVALID_PARAMETERS", readonly status = 400) {
    super(message);
    this.name = "ImagegenPlanError";
  }
}
