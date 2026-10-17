/** Deterministic, bounded image-space silhouette tracing. Runs in a browser Worker.
 * This is an axisymmetric approximation from a user-selected upright product, not AI segmentation. */
export type Crop = { x: number; y: number; width: number; height: number };
export type ProfilePoint = { y: number; radius: number; center: number };
export type Outline = {
  profile: ProfilePoint[];
  silhouette: { left: number; right: number }[];
  contrast: number;
  widthHeight: number;
  backColor: string;
};
const median = (values: number[]) =>
  values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
export function traceOutline(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Outline {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 32 ||
    height < 64 ||
    width > 1024 ||
    height > 1536 ||
    rgba.length !== width * height * 4
  )
    throw Error("请框选清晰完整的直立瓶罐，选区至少 32 × 64 像素");
  if (height / width < 1.15 || height / width > 9)
    throw Error("本次试验支持直立细长瓶型，请缩小选区，只保留完整瓶子");
  const rows = Math.min(192, height),
    step = height / rows,
    half = Math.floor(width / 2),
    mid = width / 2;
  const pixel = (x: number, y: number, c: number) =>
    rgba[
      (Math.min(height - 1, Math.max(0, y)) * width +
        Math.min(width - 1, Math.max(0, x))) *
        4 +
        c
    ];
  const energy = (x: number, y: number) => {
    let total = 0;
    for (let dy = -3; dy <= 3; dy += 3) {
      for (let channel = 0; channel < 3; channel++)
        total += Math.abs(
          pixel(x + 3, y + dy, channel) - pixel(x - 3, y + dy, channel),
        );
      total += Math.abs(pixel(x + 3, y + dy, 3) - pixel(x - 3, y + dy, 3));
    }
    return total / (3 * 4 * 255);
  };
  const trace = (side: -1 | 1) => {
    const n = Math.floor(width * 0.36) - 3,
      previous = new Float32Array(n),
      next = new Float32Array(n),
      parents = new Int16Array(rows * n);
    const xAt = (i: number) => (side === -1 ? i + 2 : width - 3 - i);
    for (let row = 0; row < rows; row++) {
      const y = Math.min(height - 1, Math.round((row + 0.5) * step));
      for (let i = 0; i < n; i++) {
        const x = xAt(i),
          distance = Math.abs(x - mid) / half;
        // Prefer the outer boundary over label text, but allow narrower bottle necks.
        const score = Math.sqrt(energy(x, y)) + 0.28 * distance;
        let best = -Infinity,
          parent = i;
        for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) {
          const candidate = previous[j] - 0.022 * Math.abs(j - i);
          if (candidate > best) {
            best = candidate;
            parent = j;
          }
        }
        next[i] = score + (row ? best : 0);
        parents[row * n + i] = parent;
      }
      previous.set(next);
    }
    let index = 0;
    for (let i = 1; i < n; i++) if (previous[i] > previous[index]) index = i;
    const result = new Array<number>(rows);
    for (let row = rows - 1; row >= 0; row--) {
      result[row] = xAt(index);
      index = parents[row * n + index];
    }
    return result.map((_, i) =>
      median(result.slice(Math.max(0, i - 2), Math.min(rows, i + 3))),
    );
  };
  const left = trace(-1),
    right = trace(1);
  const widths = left.map((l, i) => right[i] - l),
    typical = median(
      widths.slice(Math.floor(rows * 0.25), Math.floor(rows * 0.8)),
    );
  let contrast = 0;
  for (let i = 0; i < rows; i++) {
    const y = Math.round((i + 0.5) * step);
    contrast += energy(left[i], y) + energy(right[i], y);
  }
  contrast /= rows * 2;
  if (typical < width * 0.3 || contrast < 0.012)
    throw Error("轮廓对比不足，请缩小选区或换用背景更干净的产品图");
  const profile: ProfilePoint[] = left
    .map((l, i) => ({
      y: 1 - i / (rows - 1),
      radius: (right[i] - l) / (2 * width),
      center: (l + right[i]) / (2 * width),
    }))
    .reverse();
  const color = [0, 1, 2].map((c) =>
    median(
      Array.from({ length: 24 }, (_, i) =>
        pixel(Math.round(mid), Math.round(height * (0.25 + i * 0.025)), c),
      ),
    ),
  );
  return {
    profile,
    silhouette: left.map((l, i) => ({
      left: l / width,
      right: right[i] / width,
    })),
    contrast,
    widthHeight: Math.max(...widths) / height,
    backColor:
      "#" +
      color.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""),
  };
}
