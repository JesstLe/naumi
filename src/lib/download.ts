// Triggers a real file download. Cross-origin (R2) URLs go through the
// same-origin /api/download proxy so the browser saves instead of navigating;
// data: URLs download directly. Credits are NOT touched — this only retrieves
// an already-generated, already-stored image.
//
// 文件名统一为 `<域名>_<年>_<月日>_<随机后缀>.png`(如 配置的签发站_2026_0707_a1b2c3.png)。
// 域名取当前站点 hostname —— 各实例(国内/海外/自托管)自动带自己的品牌域名,不写死。
// baseName 保留形参兼容各调用方,不再参与命名。
export function createImageDownloadName(now = new Date()): string {
  const y = now.getFullYear();
  const md =
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const combinations = 36 ** 6;
  const randomValue = typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
    ? crypto.getRandomValues(new Uint32Array(1))[0] % combinations
    : Math.floor(Math.random() * combinations);
  const rand = randomValue.toString(36).padStart(6, "0");
  const host = (
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "naumi"
  ).replace(/[^\w.\-]+/g, "_");
  return `${host}_${y}_${md}_${rand}.png`;
}

export function downloadImage(url: string, _baseName?: string) {
  const name = createImageDownloadName();
  const a = document.createElement("a");
  if (url.startsWith("data:")) {
    a.href = url;
  } else {
    a.href = `/api/download?u=${encodeURIComponent(
      url
    )}&n=${encodeURIComponent(name)}`;
  }
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
