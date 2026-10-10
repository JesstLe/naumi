/** Conservative SVG subset. No scripts, CSS sheets, entities or external resources reach the rasterizer. */
const tags = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "title", "desc", "filter", "feFlood", "feColorMatrix", "feOffset", "feGaussianBlur", "feComposite", "feBlend"]);
const attrs = new Set(["xmlns", "xmlns:xlink", "version", "width", "height", "viewBox", "preserveAspectRatio", "id", "d", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "points", "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity", "transform", "clip-path", "clip-rule", "mask", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod", "fx", "fy", "href", "xlink:href", "style", "filter", "filterUnits", "primitiveUnits", "color-interpolation-filters", "flood-color", "flood-opacity", "result", "in", "in2", "values", "dy", "dx", "stdDeviation", "operator", "mode", "type", "k1", "k2", "k3", "k4"]);
export function inertSvg(input: string): string {
  if (input.length > 512000 || /<!DOCTYPE|<!ENTITY|<!\[CDATA/i.test(input)) throw new Error("SVG 包含不受支持的内容");
  const svg = input.replace(/<\?xml[^>]*\?>/gi, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!/^<svg[\s>]/.test(svg) || !/<\/svg>\s*$/.test(svg)) throw new Error("SVG 格式无效");
  const stack: string[] = [];
  let cursor = 0;
  for (const match of svg.matchAll(/<([^<>]+)>/g)) {
    const outside = svg.slice(cursor, match.index);
    if (outside.trim() && !["title", "desc"].includes(stack[stack.length - 1])) throw new Error("SVG 包含不受支持的文本");
    cursor = match.index! + match[0].length;
    const tag = /^\s*(\/?)\s*([A-Za-z][\w:-]*)/.exec(match[1]);
    if (!tag || !tags.has(tag[2])) throw new Error("SVG 节点不受支持");
    if (tag[1]) { if (match[1].slice(tag[0].length).trim() || stack.pop() !== tag[2]) throw new Error("SVG 标签不匹配"); continue; }
    let rest = match[1].slice(tag[0].length).replace(/\/\s*$/, "");
    while (rest.trim()) {
      const attribute = /^\s+([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
      if (!attribute || !attrs.has(attribute[1])) throw new Error("SVG 属性不受支持");
      const value = attribute[2] ?? attribute[3];
      if (/&|[<>\\]|@import|expression|javascript:|data:/i.test(value)) throw new Error("SVG 属性包含不受支持的内容");
      if (/href$/.test(attribute[1]) && !/^#[\w-]+$/.test(value)) throw new Error("SVG 不支持外部引用");
      if (attribute[1] === "stdDeviation" && !/^\s*\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?)?\s*$/.test(value)) throw new Error("SVG 滤镜参数无效");
      if (attribute[1] === "stdDeviation" && value.trim().split(/\s+/).some(n => Number(n) > 100)) throw new Error("SVG 滤镜范围过大");
      if (/url\(/i.test(value) && !/^url\(#[\w-]+\)$/.test(value)) throw new Error("SVG 不支持外部资源");
      if (attribute[1] === "style" && value.split(";").filter(Boolean).some(v => !/^\s*(fill|stroke|opacity|stroke-width|fill-rule|fill-opacity|stroke-opacity|stroke-linecap|stroke-linejoin)\s*:\s*(?:#[\da-f]{3,8}|none|currentColor|[\d.]+|round|butt|square|miter|bevel|evenodd|nonzero)\s*$/i.test(v))) throw new Error("SVG 样式不受支持");
      rest = rest.slice(attribute[0].length);
    }
    if (!/\/\s*$/.test(match[1])) stack.push(tag[2]);
  }
  if (stack.length || svg.slice(cursor).trim()) throw new Error("SVG 内容不完整");
  return svg;
}
export function pathSvg(path: string, width: number, height: number, fill: string, stroke: string, strokeWidth: number) {
  if (!path || !/^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$/.test(path)) throw new Error("矢量路径不受支持");
  const color = (v: string) => /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(v) ? v : "#000000";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${path}" fill="${color(fill)}" stroke="${color(stroke)}" stroke-width="${strokeWidth}"/></svg>`;
}
