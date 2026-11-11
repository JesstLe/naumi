/** Image creation only; text/video and commerce keep their existing contracts. */
export function imageBillingFeature(feature: string | undefined): boolean {
  return !!feature && (feature.startsWith("image.") || ["canvas.image", "canvas.expand", "canvas.text-edit", "canvas.annotate", "tool.cutout", "tool.upscale", "tool.printfile", "tool.garment", "tool.avatar", "tool.dewrinkle", "tool.dewatermark", "tool.style", "tool.tryon", "tool.retouch", "tool.recolor", "tool.replicate", "tool.inpaint", "tool.extract", "tool.garment3d", "tool.packaging3d"].includes(feature));
}
