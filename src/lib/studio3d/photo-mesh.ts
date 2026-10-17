import * as THREE from "three";
import type { StudioProject } from "./project";

/** Two real half-surfaces: observed front projection and explicitly unobserved neutral back. */
export async function buildPhotoMesh(p: StudioProject): Promise<THREE.Group> {
  if (!p.photo) throw Error("照片工程缺少轮廓");
  const { profile, image, textureMode } = p.photo,
    group = new THREE.Group();
  group.name = "轴对称近似模型";
  const maxR = Math.max(...profile.map((q) => q.radius)),
    h = p.height / 50,
    r = p.width / 100,
    segments = 96;
  let texture: THREE.Texture | undefined;
  if (textureMode === "photo") {
    texture = await new THREE.TextureLoader().loadAsync(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  }
  const front = texture
    ? new THREE.MeshBasicMaterial({
        map: texture,
        toneMapped: false,
        side: THREE.FrontSide,
      })
    : new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: p.roughness,
      });
  const back = new THREE.MeshStandardMaterial({
    color: textureMode === "photo" ? "#a6afa4" : p.color,
    roughness: p.roughness,
  });
  for (const [start, material, name] of [
    [-Math.PI / 2, front, "可见正面"],
    [Math.PI / 2, back, "背面待补充"],
  ] as const) {
    const positions: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    for (let row = 0; row < profile.length; row++) {
      const q = profile[row];
      for (let col = 0; col <= segments; col++) {
        const theta = start + (Math.PI * col) / segments;
        positions.push(
          (q.radius / maxR) * r * Math.sin(theta),
          q.y * h,
          (q.radius / maxR) * r * Math.cos(theta),
        );
        // Orthographic front projection, not a stretched wrap of the entire poster.
        uv.push(q.center + q.radius * Math.sin(theta), q.y);
        if (row < profile.length - 1 && col < segments) {
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
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = textureMode === "clay";
    group.add(mesh);
  }
  for (const q of [profile[0], profile.at(-1)!]) {
    const geometry = new THREE.CircleGeometry(
      (q.radius / maxR) * r,
      segments * 2,
    );
    geometry.rotateX(q.y === 0 ? Math.PI / 2 : -Math.PI / 2);
    const cap = new THREE.Mesh(geometry, back);
    cap.name = q.y === 0 ? "瓶底近似封口" : "顶部近似封口";
    cap.position.y = q.y * h;
    cap.castShadow = true;
    group.add(cap);
  }
  return group;
}
