import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { base64ToBinary, validateGlb, type StudioProject } from "./project";

export function disposeObject(object: THREE.Object3D) {
  const materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material)
      ? child.material
      : [child.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
function bodyMaterial(p: StudioProject) {
  return new THREE.MeshPhysicalMaterial({
    color: p.color,
    roughness: p.roughness,
    metalness: p.material === "metal" ? 1 : 0,
    transmission: p.material === "glass" ? 0.92 : 0,
    thickness: 0.12,
    ior: 1.48,
    clearcoat: p.material === "glossy" ? 1 : 0,
    clearcoatRoughness: 0.12,
  });
}
function mesh(
  group: THREE.Group,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  y: number,
) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.y = y;
  object.castShadow = object.receiveShadow = true;
  group.add(object);
  return object;
}
export async function buildProduct(p: StudioProject): Promise<THREE.Group> {
  const product = new THREE.Group();
  product.name = p.name;
  try {
    if (p.template === "imported") {
      const bytes = base64ToBinary(p.model!);
      validateGlb(bytes);
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        if (!url.startsWith("blob:")) throw Error("模型包含外部资源");
        return url;
      });
      const gltf = await new GLTFLoader(manager).parseAsync(bytes, "");
      const object = gltf.scene;
      object.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(object),
        size = bounds.getSize(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(max) || max < 0.000001) {
        disposeObject(object);
        throw Error("模型尺寸无效");
      }
      const center = bounds.getCenter(new THREE.Vector3()),
        scale = 2.7 / max;
      object.scale.multiplyScalar(scale);
      object.position.sub(center.multiplyScalar(scale));
      object.position.y += (size.y * scale) / 2;
      object.traverse((child) => {
        if (child instanceof THREE.Mesh)
          child.castShadow = child.receiveShadow = true;
      });
      product.add(object);
    } else {
      const w = p.width / 50,
        h = p.height / 50,
        d = p.depth / 50,
        r = w / 2;
      const body = bodyMaterial(p),
        cap = new THREE.MeshStandardMaterial({
          color: p.capColor,
          roughness: 0.27,
          metalness: 0.45,
        });
      if (p.template === "bottle") {
        const shape = [
          [0, 0],
          [r * 0.85, 0],
          [r * 0.97, 0.025 * h],
          [r, 0.06 * h],
          [r, 0.59 * h],
          [r * 0.94, 0.65 * h],
          [r * 0.65, 0.71 * h],
          [r * 0.43, 0.74 * h],
          [r * 0.43, 0.8 * h],
          [0, 0.8 * h],
        ];
        mesh(
          product,
          "瓶身",
          new THREE.LatheGeometry(
            shape.map(([x, y]) => new THREE.Vector2(x, y)),
            96,
          ),
          body,
          0,
        );
        mesh(
          product,
          "瓶盖",
          new THREE.CylinderGeometry(r * 0.53, r * 0.53, h * 0.12, 64),
          cap,
          h * 0.8,
        );
        const collar = new THREE.MeshStandardMaterial({
          color: "#bc9c62",
          metalness: 0.9,
          roughness: 0.24,
        });
        mesh(
          product,
          "金属环",
          new THREE.CylinderGeometry(r * 0.54, r * 0.54, h * 0.025, 64),
          collar,
          h * 0.735,
        );
        const bulb = new THREE.MeshStandardMaterial({
          color: p.capColor,
          roughness: 0.65,
        });
        mesh(
          product,
          "滴管",
          new THREE.CylinderGeometry(r * 0.27, r * 0.29, h * 0.095, 48),
          bulb,
          h * 0.91,
        );
        const top = mesh(
          product,
          "滴管顶",
          new THREE.SphereGeometry(r * 0.27, 32, 24),
          bulb,
          h * 0.954,
        );
        top.scale.y = Math.min(1, (h * 0.046) / (r * 0.27));
      } else if (p.template === "jar") {
        const shape = [
          [0, 0],
          [r * 0.88, 0],
          [r * 0.98, h * 0.07],
          [r, h * 0.12],
          [r, h * 0.74],
          [r * 0.96, h * 0.8],
          [0, h * 0.8],
        ];
        mesh(
          product,
          "罐身",
          new THREE.LatheGeometry(
            shape.map(([x, y]) => new THREE.Vector2(x, y)),
            96,
          ),
          body,
          0,
        );
        mesh(
          product,
          "罐盖",
          new THREE.CylinderGeometry(r * 1.015, r * 1.015, h * 0.2, 96),
          cap,
          h * 0.9,
        );
      } else {
        cap.dispose();
        mesh(
          product,
          "包装盒",
          new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.025),
          body,
          h / 2,
        );
      }
      if (p.label) {
        const texture = await new THREE.TextureLoader().loadAsync(p.label);
        texture.colorSpace = THREE.SRGBColorSpace;
        const aspect = texture.image.width / texture.image.height;
        const labelHeight =
          h * (p.template === "jar" ? 0.5 : 0.36) * p.labelScale;
        const material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.8,
          envMapIntensity: 0.4,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        if (p.template === "box") {
          const width = Math.min(w * 0.96, labelHeight * aspect);
          const label = mesh(
            product,
            "标签",
            new THREE.PlaneGeometry(width, width / aspect),
            material,
            h * p.labelY,
          );
          label.position.z = d / 2 + 0.002;
        } else {
          const arc = Math.min(Math.PI * 1.6, (labelHeight * aspect) / r);
          const actualHeight = Math.min(labelHeight, (r * arc) / aspect);
          // Keep labels on the straight body, never floating over the shoulder or lid.
          const bottom = h * (p.template === "jar" ? 0.12 : 0.06),
            top = h * (p.template === "jar" ? 0.74 : 0.59);
          const center = THREE.MathUtils.clamp(
            h * p.labelY,
            bottom + actualHeight / 2,
            top - actualHeight / 2,
          );
          const label = mesh(
            product,
            "标签",
            new THREE.CylinderGeometry(
              r + 0.003,
              r + 0.003,
              actualHeight,
              96,
              1,
              true,
              -arc / 2,
              arc,
            ),
            material,
            center,
          );
          label.castShadow = false;
        }
      }
    }
    product.rotation.y = THREE.MathUtils.degToRad(p.rotation);
    product.updateMatrixWorld(true);
    return product;
  } catch (error) {
    disposeObject(product);
    throw error;
  }
}
