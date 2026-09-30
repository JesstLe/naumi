export type OcrBox = { x: number; y: number; width: number; height: number };
export type OcrSegment = { text: string; confidence: number; box: OcrBox };

type PaddleEnvelope = Record<string, unknown>;

function finite(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function xyxyBox(value: unknown): OcrBox | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const [x1, y1, x2, y2] = value.map(finite);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function boxFromUnknown(value: unknown, xyxy = false): OcrBox | null {
  if (xyxy) return xyxyBox(value);
  if (Array.isArray(value) && value.length >= 4 && value.every((item) => !Array.isArray(item))) {
    const [x, y, width, height] = value.map(finite);
    return { x, y, width, height };
  }
  if (Array.isArray(value) && value.length >= 2 && value.every(Array.isArray)) {
    const points = value as unknown[][];
    const xs = points.map((point) => finite(point[0]));
    const ys = points.map((point) => finite(point[1]));
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }
  if (value && typeof value === "object") {
    const box = value as Record<string, unknown>;
    const x = finite(box.x ?? box.left ?? box.x1);
    const y = finite(box.y ?? box.top ?? box.y1);
    const width = finite(box.width ?? (finite(box.right ?? box.x2) - x));
    const height = finite(box.height ?? (finite(box.bottom ?? box.y2) - y));
    return { x, y, width, height };
  }
  return null;
}

function paddleRowsAt(value: PaddleEnvelope): unknown[] {
  const texts = value.rec_texts ?? value.texts;
  const boxes = value.rec_boxes ?? value.dt_boxes ?? value.rec_polys ?? value.boxes;
  if (!Array.isArray(texts) || !Array.isArray(boxes)) return [];
  const scores = value.rec_scores ?? value.scores;
  const boxesAreXyxy = value.rec_boxes === boxes;
  return texts.map((text, index) => ({
    text,
    confidence: Array.isArray(scores) ? scores[index] : 1,
    box: boxFromUnknown(boxes[index], boxesAreXyxy),
  }));
}

/**
 * PaddleOCR has shipped several HTTP response shapes. Walk the response tree
 * rather than binding the canvas API to one wrapper's `data[0]` convention.
 */
export function collectPaddleRows(body: unknown): unknown[] {
  const rows: unknown[] = [];
  const seen = new Set<unknown>();
  const walk = (value: unknown, depth: number) => {
    if (depth > 12 || value == null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const object = value as PaddleEnvelope;
    rows.push(...paddleRowsAt(object));
    const directText = object.text ?? object.transcription ?? object.label;
    const directBox = object.box ?? object.bbox ?? object.points ?? object.position ?? object.poly;
    if (typeof directText === "string" && directBox) rows.push(object);
    for (const child of Object.values(object)) walk(child, depth + 1);
  };
  walk(body, 0);
  return rows;
}

function overlapRatio(a: OcrBox, b: OcrBox): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  if (!intersection) return 0;
  return intersection / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}

function readingOrder(a: OcrSegment, b: OcrSegment): number {
  const aMiddle = a.box.y + a.box.height / 2;
  const bMiddle = b.box.y + b.box.height / 2;
  const sameLineTolerance = Math.max(5, Math.min(a.box.height, b.box.height) * 0.65);
  if (Math.abs(aMiddle - bMiddle) <= sameLineTolerance) return a.box.x - b.box.x;
  return aMiddle - bMiddle;
}

export function normalizeOcrSegments(
  input: unknown,
  imageWidth: number,
  imageHeight: number,
  options: { minConfidence?: number; maxSegments?: number } = {}
): OcrSegment[] {
  const minConfidence = Math.max(0, Math.min(1, options.minConfidence ?? 0.12));
  const maxSegments = Math.max(1, Math.min(500, options.maxSegments ?? 200));
  const rows = Array.isArray(input) ? input : collectPaddleRows(input);
  const normalized = rows.map((item): OcrSegment | null => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const text = String(row.text ?? row.transcription ?? row.label ?? "").replace(/\s+/g, " ").trim();
    const rawBox = boxFromUnknown(row.box ?? row.bbox ?? row.points ?? row.position ?? row.poly);
    const confidence = Math.max(0, Math.min(1, finite(row.confidence ?? row.score ?? 1)));
    if (!text || !rawBox || confidence < minConfidence || rawBox.width <= 0 || rawBox.height <= 0) return null;
    const x = Math.max(0, Math.min(imageWidth - 1, Math.round(rawBox.x)));
    const y = Math.max(0, Math.min(imageHeight - 1, Math.round(rawBox.y)));
    const width = Math.max(1, Math.min(imageWidth - x, Math.round(rawBox.width)));
    const height = Math.max(1, Math.min(imageHeight - y, Math.round(rawBox.height)));
    return { text: text.slice(0, 300), confidence, box: { x, y, width, height } };
  }).filter((segment): segment is OcrSegment => Boolean(segment));

  // Some wrappers expose the same OCR payload at result/data/json_res paths.
  // Keep the strongest copy of a geometrically identical line.
  const strongestFirst = normalized.sort((a, b) => b.confidence - a.confidence);
  const deduped: OcrSegment[] = [];
  for (const candidate of strongestFirst) {
    const duplicate = deduped.some((kept) =>
      kept.text === candidate.text && overlapRatio(kept.box, candidate.box) >= 0.72
    );
    if (!duplicate) deduped.push(candidate);
  }
  return deduped.sort(readingOrder).slice(0, maxSegments);
}

export function scaleOcrSegments(
  segments: OcrSegment[],
  source: { width: number; height: number },
  target: { width: number; height: number }
): OcrSegment[] {
  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;
  return segments.map((segment) => ({
    ...segment,
    box: {
      x: Math.max(0, Math.round(segment.box.x * scaleX)),
      y: Math.max(0, Math.round(segment.box.y * scaleY)),
      width: Math.max(1, Math.round(segment.box.width * scaleX)),
      height: Math.max(1, Math.round(segment.box.height * scaleY)),
    },
  }));
}
