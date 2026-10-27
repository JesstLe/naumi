import * as THREE from "three";

/** Dispose owned geometry/material/texture resources once when a scene object is replaced. */
export function disposeObject(object: THREE.Object3D) {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}
