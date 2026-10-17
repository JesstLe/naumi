import { newProject, type StudioProject } from "./project";

export type PanelId =
  | "front"
  | "right"
  | "back"
  | "left"
  | "glue"
  | "top"
  | "bottom"
  | "top-tuck"
  | "bottom-tuck"
  | "left-top"
  | "left-bottom"
  | "right-top"
  | "right-bottom";
export type NetPanel = {
  id: PanelId;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
/** Millimetres. One shared atlas for SVG, on-screen guide and all 3D UVs. */
export function cartonNet(width: number, height: number, depth: number) {
  if (![width, height, depth].every((v) => Number.isFinite(v) && v > 0))
    throw Error("盒型尺寸无效");
  const tuck = Math.min(18, height * 0.18, depth * 0.4),
    glue = Math.min(12, depth * 0.3),
    dust = Math.min(width * 0.42, depth * 0.65),
    y = depth + tuck;
  const panels: NetPanel[] = [
    { id: "front", name: "正面", x: depth, y, width, height },
    { id: "right", name: "右侧", x: depth + width, y, width: depth, height },
    { id: "back", name: "背面", x: depth * 2 + width, y, width, height },
    { id: "left", name: "左侧", x: 0, y, width: depth, height },
    {
      id: "glue",
      name: "粘口",
      x: depth * 2 + width * 2,
      y,
      width: glue,
      height,
    },
    { id: "top", name: "顶面", x: depth, y: tuck, width, height: depth },
    {
      id: "bottom",
      name: "底面",
      x: depth,
      y: y + height,
      width,
      height: depth,
    },
    { id: "top-tuck", name: "上插舌", x: depth, y: 0, width, height: tuck },
    {
      id: "bottom-tuck",
      name: "下插舌",
      x: depth,
      y: y + height + depth,
      width,
      height: tuck,
    },
    ...(["left", "right"] as const).flatMap((side) => [
      {
        id: `${side}-top` as PanelId,
        name: "防尘翼",
        x: side === "left" ? 0 : depth + width,
        y: y - dust,
        width: depth,
        height: dust,
      },
      {
        id: `${side}-bottom` as PanelId,
        name: "防尘翼",
        x: side === "left" ? 0 : depth + width,
        y: y + height,
        width: depth,
        height: dust,
      },
    ]),
  ];
  return {
    width: 2 * (width + depth) + glue,
    height: height + 2 * (depth + tuck),
    panels,
    tuck,
    glue,
    dust,
  };
}

/** Perimeter sections only are cuts; shared boundaries are score lines. */
export function netLines(net: ReturnType<typeof cartonNet>) {
  type Edge = {
    axis: "h" | "v";
    at: number;
    start: number;
    end: number;
    panel: PanelId;
  };
  const edges: Edge[] = net.panels.flatMap((p) => [
    { axis: "h", at: p.y, start: p.x, end: p.x + p.width, panel: p.id },
    {
      axis: "h",
      at: p.y + p.height,
      start: p.x,
      end: p.x + p.width,
      panel: p.id,
    },
    { axis: "v", at: p.x, start: p.y, end: p.y + p.height, panel: p.id },
    {
      axis: "v",
      at: p.x + p.width,
      start: p.y,
      end: p.y + p.height,
      panel: p.id,
    },
  ]);
  const hinges = new Set(
    [
      "front,right",
      "front,left",
      "right,back",
      "back,glue",
      "front,top",
      "front,bottom",
      "top,top-tuck",
      "bottom,bottom-tuck",
      "left,left-top",
      "left,left-bottom",
      "right,right-top",
      "right,right-bottom",
    ].map((v) => v.split(",").sort().join(",")),
  );
  const lines: (Edge & { fold: boolean })[] = [];
  const groups = new Map<string, Edge[]>();
  for (const e of edges) {
    const key = `${e.axis}:${e.at.toFixed(6)}`;
    groups.set(key, [...(groups.get(key) || []), e]);
  }
  for (const list of groups.values()) {
    const points = [...new Set(list.flatMap((e) => [e.start, e.end]))].sort(
      (a, b) => a - b,
    );
    for (let i = 1; i < points.length; i++) {
      const middle = (points[i - 1] + points[i]) / 2;
      const covering = list.filter((e) => middle > e.start && middle < e.end);
      if (covering.length)
        lines.push({
          axis: list[0].axis,
          at: list[0].at,
          panel: list[0].panel,
          start: points[i - 1],
          end: points[i],
          fold: hinges.has(
            covering
              .map((e) => e.panel)
              .sort()
              .join(","),
          ),
        });
    }
  }
  return lines;
}
export function dielineSvg(width: number, height: number, depth: number) {
  const net = cartonNet(width, height, depth);
  const lines = netLines(net)
    .map(
      (l) =>
        `<line x1="${l.axis === "h" ? l.start : l.at}" y1="${l.axis === "h" ? l.at : l.start}" x2="${l.axis === "h" ? l.end : l.at}" y2="${l.axis === "h" ? l.at : l.end}" stroke="${l.fold ? "#387cbb" : "#d05c5c"}"${l.fold ? ' stroke-dasharray="2 1"' : ""}/>`,
    )
    .join("");
  const labels = net.panels
    .map(
      (p) =>
        `<text x="${p.x + p.width / 2}" y="${p.y + p.height / 2}" text-anchor="middle" dominant-baseline="middle">${p.name}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${net.width}mm" height="${net.height}mm" viewBox="0 0 ${net.width} ${net.height}"><title>标准插口盒 · 结构预览模板（非生产刀模）</title><g id="cut-and-fold" fill="none" stroke-width="0.25">${lines}</g><g id="face-names" font-size="3" fill="#6d7770">${labels}</g></svg>`;
}
export function newCartonProject(): StudioProject {
  return {
    ...newProject("box"),
    version: 3,
    template: "carton",
    name: "标准插口盒",
    color: "#f6f3eb",
    packaging: { kind: "tuck-carton", fold: 100, artwork: null },
  };
}
export function newWrapProject(): StudioProject {
  return {
    ...newProject("bottle"),
    version: 3,
    name: "瓶罐环绕标签",
    wrap: { height: 40, center: 0.33, rotation: 0 },
  };
}
export function wrapBand(p: StudioProject) {
  const bottom = p.template === "jar" ? 0.12 : p.photo ? 0.03 : 0.06;
  const top = p.template === "jar" ? 0.74 : p.photo ? 0.92 : 0.59;
  const height = Math.min(p.wrap?.height || 40, (top - bottom) * p.height);
  const center = Math.max(
    bottom * p.height + height / 2,
    Math.min(top * p.height - height / 2, (p.wrap?.center || 0.33) * p.height),
  );
  return {
    height,
    center,
    bottom: (center - height / 2) / p.height,
    top: (center + height / 2) / p.height,
    circumference: Math.PI * p.width,
  };
}
