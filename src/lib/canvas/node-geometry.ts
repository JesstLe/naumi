import type {Node} from "@xyflow/react";
import type {Artwork} from "../mock-data";
import {adaptiveCanvasImageSize} from "./image-size";
import {imageAspectDisplaySize} from "./input-references";
import {CANVAS_TEXT_DEFAULT_WIDTH as TEXT_NODE_DEFAULT_W,CANVAS_TEXT_DEFAULT_HEIGHT as TEXT_NODE_DEFAULT_H} from "./text-document-model";
export const NODE_W=320,NODE_H=236,NODE_LABEL_H=36,PORT_Y=136;
export const IMAGE_NODE_MIN_W=120,IMAGE_NODE_MIN_H=108,IMAGE_NODE_MAX_W=2400,IMAGE_NODE_MAX_H=2400;
export const TEXT_NODE_MIN_W=220,TEXT_NODE_MIN_H=140,TEXT_NODE_MAX_W=1200,TEXT_NODE_MAX_H=1200;
export function estimateTextNodeHeight(node: {
  width: number;
  content: string;
  prompt: string;
  sourceIds?: string[];
}): number {
  const width = node.width || TEXT_NODE_DEFAULT_W;
  const charsPerLine = Math.max(8, Math.floor((width - 24) / 11));
  const text = `${node.content || ""}\n${node.prompt || ""}`.trim();
  const lines = text
    ? text
        .split("\n")
        .reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / charsPerLine)), 0)
    : 2;
  const refsRows = node.sourceIds?.length ? 1 : 0;
  const h = 32 + 20 + refsRows * 26 + lines * 20 + 14;
  return Math.round(
    Math.min(TEXT_NODE_MAX_H, Math.max(TEXT_NODE_DEFAULT_H, h))
  );
}
export function artworkImageSize(art: Pick<Artwork, "width" | "height">) {
  const withCanvas = art as Pick<
    Artwork,
    "width" | "height" | "canvasWidth" | "canvasHeight"
  >;
  if (
    withCanvas.canvasWidth &&
    withCanvas.canvasWidth > 0 &&
    withCanvas.canvasHeight &&
    withCanvas.canvasHeight > 0
  ) {
    return imageAspectDisplaySize(Math.round(withCanvas.canvasWidth), Math.round(withCanvas.canvasHeight), art.width, art.height);
  }
  return adaptiveCanvasImageSize(art.width, art.height);
}

export function artworkNodeSize(art: Pick<Artwork, "width" | "height">) {
  const image = artworkImageSize(art);
  return { width: image.width, height: image.height + NODE_LABEL_H, imageHeight: image.height };
}

export function flowNodeSize(node: Node | undefined) {
  if (!node) return { width: NODE_W, height: NODE_H };
  const data = node.data as { width?: number; height?: number; nodeKind?: string } | undefined;
  const width = data?.width && data.width > 0 ? data.width : node.measured?.width || NODE_W;
  if (data?.nodeKind === "text") {
    const height = node.measured?.height || data.height || TEXT_NODE_DEFAULT_H;
    return { width, height };
  }
  const imageHeight = data?.height && data.height > 0 ? data.height : Math.max(110, (node.measured?.height || NODE_H) - NODE_LABEL_H);
  return { width, height: imageHeight + NODE_LABEL_H };
}
