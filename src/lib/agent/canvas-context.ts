export type CanvasAgentContext = {
  /** Optional reference; empty for text-only conversations. */
  anchorId: string;
  imageUrls: string[];
  imageModelId?: string;
  ratio: string;
  resolution: string;
  quality: string;
};

export const CANVAS_IMAGE_TOOLS = new Set(["generate_image", "recolor_product", "retouch_product", "replicate_hot"]);
