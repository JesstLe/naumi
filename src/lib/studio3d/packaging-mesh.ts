import * as THREE from "three";
import type { StudioProject } from "./project";
import { cartonNet, wrapBand, type PanelId } from "./packaging";

/** Contain, never crop or stretch artwork. All decoding and canvas work stays local. */
export async function artworkTexture(data: string, aspect: number) {
  const source = await new THREE.TextureLoader().loadAsync(data);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(2048 * Math.min(1, aspect)));
    canvas.height = Math.max(1, Math.round(2048 / Math.max(1, aspect)));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("贴图处理失败");
    ctx.fillStyle = "#faf8f2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const image = source.image as HTMLImageElement;
    const scale = Math.min(
      canvas.width / image.width,
      canvas.height / image.height,
    );
    ctx.drawImage(
      image,
      (canvas.width - image.width * scale) / 2,
      (canvas.height - image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  } finally {
    source.dispose();
  }
}

export async function buildCarton(p: StudioProject) {
  if (!p.packaging) throw Error("缺少刀模参数");
  const net = cartonNet(p.width, p.height, p.depth),
    unit = 1 / 50;
  const texture = p.packaging.artwork
    ? await artworkTexture(p.packaging.artwork, net.width / net.height)
    : null;
  const material = new THREE.MeshStandardMaterial({
    color: texture ? "#ffffff" : p.color,
    map: texture,
    roughness: p.roughness,
    side: THREE.FrontSide,
  });
  const inside = new THREE.MeshStandardMaterial({
    color: "#f2eee3",
    roughness: 0.85,
    side: THREE.BackSide,
  });
  const group = new THREE.Group();
  group.name = "标准插口盒 · 折叠结构";
  const angle = ((Math.PI / 2) * p.packaging.fold) / 100;
  // Every panel lives in the original flat atlas. Nested hinge transforms preserve adjacency.
  const front = new THREE.Group();
  front.position.set(
    (-p.width * unit) / 2,
    p.height * unit,
    (p.depth * unit) / 2,
  );
  group.add(front);
  const surface = (id: PanelId, parent: THREE.Group, x: number, y: number) => {
    const panel = net.panels.find((v) => v.id === id)!;
    const geo = new THREE.PlaneGeometry(
      panel.width * unit,
      panel.height * unit,
    );
    const uv = geo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        (panel.x + uv.getX(i) * panel.width) / net.width,
        1 - (panel.y + (1 - uv.getY(i)) * panel.height) / net.height,
      );
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = panel.name;
    mesh.userData.panelId = id;
    mesh.position.set(
      x + (panel.width * unit) / 2,
      y - (panel.height * unit) / 2,
      0,
    );
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    const inner = new THREE.Mesh(geo, inside);
    inner.name = `${panel.name}内侧`;
    inner.position.z = -0.0005;
    mesh.add(inner);
  };
  const hinge = (
    parent: THREE.Group,
    x: number,
    y: number,
    axis: "x" | "y",
    rotation: number,
  ) => {
    const node = new THREE.Group();
    node.position.set(x, y, 0);
    node.rotation[axis] = rotation;
    parent.add(node);
    return node;
  };
  const w = p.width * unit,
    h = p.height * unit,
    d = p.depth * unit;
  surface("front", front, 0, 0);
  const right = hinge(front, w, 0, "y", angle);
  surface("right", right, 0, 0);
  const back = hinge(right, d, 0, "y", angle);
  surface("back", back, 0, 0);
  const left = hinge(front, 0, 0, "y", -angle);
  surface("left", left, -d, 0);
  const glue = hinge(back, w, 0, "y", angle);
  surface("glue", glue, 0, 0);
  // A small inward offset at closure keeps the glue flap separate from the left wall.
  glue.position.x -= (0.004 * p.packaging.fold) / 100;
  const top = hinge(front, 0, 0, "x", -angle);
  surface("top", top, 0, d);
  const bottom = hinge(front, 0, -h, "x", angle);
  surface("bottom", bottom, 0, 0);
  const topTuck = hinge(top, 0, d, "x", -angle);
  surface("top-tuck", topTuck, 0, net.tuck * unit);
  const bottomTuck = hinge(bottom, 0, -d, "x", angle);
  surface("bottom-tuck", bottomTuck, 0, 0);
  topTuck.position.y -= (0.004 * p.packaging.fold) / 100;
  bottomTuck.position.y += (0.004 * p.packaging.fold) / 100;
  for (const [side, node, x] of [
    ["left", left, -d],
    ["right", right, 0],
  ] as const) {
    const upper = hinge(node, x, 0, "x", -angle);
    surface(`${side}-top`, upper, 0, net.dust * unit);
    const lower = hinge(node, x, -h, "x", angle);
    surface(`${side}-bottom`, lower, 0, 0);
    upper.position.y -= (0.006 * p.packaging.fold) / 100;
    lower.position.y += (0.006 * p.packaging.fold) / 100;
  }
  group.updateMatrixWorld(true);
  // Keep the unfolding model above the photography floor.
  const bounds = new THREE.Box3().setFromObject(group);
  group.position.y -= bounds.min.y;
  return group;
}

export function wrapGeometry(p: StudioProject) {
  const band = wrapBand(p),
    rows = 48,
    segments = 128;
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const profile = p.photo?.profile;
  const maxR = profile ? Math.max(...profile.map((q) => q.radius)) : 1;
  const radiusAt = (y: number) => {
    if (!profile) return p.width / 100;
    let i = 1;
    while (i < profile.length - 1 && profile[i].y < y) i++;
    const a = profile[i - 1],
      b = profile[i],
      t = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
    return (((a.radius + (b.radius - a.radius) * t) / maxR) * p.width) / 100;
  };
  for (let row = 0; row <= rows; row++) {
    const v = row / rows,
      y = band.bottom + (band.top - band.bottom) * v,
      r = radiusAt(y) + 0.003;
    for (let col = 0; col <= segments; col++) {
      const u = col / segments,
        theta =
          -Math.PI +
          2 * Math.PI * u +
          THREE.MathUtils.degToRad(p.wrap?.rotation || 0);
      positions.push(
        r * Math.sin(theta),
        (y * p.height) / 50,
        r * Math.cos(theta),
      );
      uv.push(u, v);
      if (row < rows && col < segments) {
        const a = row * (segments + 1) + col,
          b = a + segments + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export async function buildWrap(p: StudioProject) {
  if (!p.label || !p.wrap) throw Error("缺少环绕标签");
  const band = wrapBand(p),
    texture = await artworkTexture(p.label, band.circumference / band.height);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.7,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(wrapGeometry(p), material);
  mesh.name = "360° 环绕标签";
  mesh.receiveShadow = true;
  return mesh;
}
