const CANVAS_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const CANVAS_IMAGE_FILE_PATTERN = /\.(?:jpe?g|png|webp)$/i;

/**
 * Browser file objects pasted from Explorer/Finder do not always expose a MIME
 * type. Keep this check aligned with the canvas upload API instead of rejecting
 * those valid files before the existing import validation can run.
 */
export function isCanvasImageFile(
  file: Pick<File, "name" | "type">
): boolean {
  const mime = file.type.trim().toLowerCase().split(";", 1)[0];
  return CANVAS_IMAGE_MIME_TYPES.has(mime) ||
    (!mime && CANVAS_IMAGE_FILE_PATTERN.test(file.name));
}

/**
 * Collect one or many native image files from a paste event. Chromium exposes
 * copied files through both `items` and `files`; prefer `items` when it yielded
 * files so the same native file is not imported twice.
 */
export function clipboardImageFiles(
  data: Pick<DataTransfer, "items" | "files">
): File[] {
  const fromItems = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
    .filter(isCanvasImageFile);

  if (fromItems.length) return fromItems;
  return Array.from(data.files ?? []).filter(isCanvasImageFile);
}
