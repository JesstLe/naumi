import * as THREE from "three";
import type { DirectorEntity } from "./project";

const radians = THREE.MathUtils.degToRad;
function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, y = 0) {
  const object = new THREE.Mesh(geometry, material); object.position.y = y; object.castShadow = true; object.receiveShadow = true; return object;
}
/** Articulated previsualization mannequin; joints retain stable names across pose edits. */
export function buildDirectorEntity(entity: DirectorEntity): THREE.Group {
  const root = new THREE.Group(); root.userData.directorId = entity.id;
  const material = new THREE.MeshStandardMaterial({ color: entity.color, roughness: 0.72 });
  if (entity.kind !== "character") {
    const geometry = entity.kind === "box" ? new THREE.BoxGeometry(1, 1, 1) : entity.kind === "sphere" ? new THREE.SphereGeometry(0.5, 24, 16) : new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    root.add(mesh(geometry, material)); return root;
  }
  const skin = new THREE.MeshStandardMaterial({ color: "#e0bea4", roughness: 0.8 }), dark = new THREE.MeshStandardMaterial({ color: "#465162", roughness: 0.8 });
  const hips = new THREE.Group(); hips.name = "hips"; hips.position.y = 0.92; root.add(hips);
  hips.add(mesh(new THREE.CapsuleGeometry(0.2, 0.28, 6, 16), material, 0.28));
  const head = new THREE.Group(); head.name = "head"; head.position.y = 0.7; hips.add(head); head.add(mesh(new THREE.SphereGeometry(0.145, 20, 16), skin));
  for (const x of [-0.052, 0.052]) { const eye = mesh(new THREE.SphereGeometry(0.014, 8, 6), dark); eye.position.set(x, 0.02, 0.132); head.add(eye); }
  for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? -1 : 1;
    const arm = new THREE.Group(); arm.name = side + "Arm"; arm.position.set(sign * 0.27, 0.49, 0); hips.add(arm);
    arm.add(mesh(new THREE.CapsuleGeometry(0.067, 0.22, 5, 12), material, -0.15));
    const elbow = new THREE.Group(); elbow.name = side + "Elbow"; elbow.position.y = -0.31; arm.add(elbow); elbow.add(mesh(new THREE.CapsuleGeometry(0.053, 0.22, 5, 12), skin, -0.15));
    const leg = new THREE.Group(); leg.name = side + "Leg"; leg.position.set(sign * 0.12, -0.05, 0); hips.add(leg); leg.add(mesh(new THREE.CapsuleGeometry(0.085, 0.27, 5, 12), dark, -0.2));
    const knee = new THREE.Group(); knee.name = side + "Knee"; knee.position.y = -0.4; leg.add(knee); knee.add(mesh(new THREE.CapsuleGeometry(0.065, 0.28, 5, 12), dark, -0.2));
    const foot = mesh(new THREE.BoxGeometry(0.14, 0.09, 0.25), dark); foot.position.set(0, -0.41, 0.055); knee.add(foot);
  }
  return root;
}
export function applyDirectorEntity(object: THREE.Object3D, entity: DirectorEntity) {
  object.position.fromArray(entity.position); object.rotation.set(...entity.rotation.map(radians) as [number, number, number]); object.scale.fromArray(entity.scale);
  if (entity.kind === "character") {
    for (const [joint, degrees] of Object.entries(entity.pose)) {
      const part = object.getObjectByName(joint); if (!part) continue;
      if (joint === "head") part.rotation.y = radians(degrees); else part.rotation.x = radians(degrees);
    }
  }
}
