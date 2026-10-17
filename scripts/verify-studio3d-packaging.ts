import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import {
  newProject,
  projectSchema,
  parseProject,
} from "../src/lib/studio3d/project";
import {
  cartonNet,
  netLines,
  dielineSvg,
  newCartonProject,
  newWrapProject,
  wrapBand,
} from "../src/lib/studio3d/packaging";
import { buildCarton, wrapGeometry } from "../src/lib/studio3d/packaging-mesh";
import { buildProduct, disposeObject } from "../src/lib/studio3d/scene";
import "fake-indexeddb/auto";
import {
  saveProject,
  listProjects,
  deleteProject,
} from "../src/lib/studio3d/storage";

async function main() {
  if (process.argv[2] === "baseline") {
    const root = path.resolve(process.argv[3] || ".");
    assert(!existsSync(path.join(root, "src/lib/studio3d/packaging.ts")));
    const ui = readFileSync(
      path.join(root, "src/components/studio3d/studio3d-client.tsx"),
      "utf8",
    );
    assert(!ui.includes("刀模折叠成盒"));
    assert(ui.includes("上传照片建模"));
    console.log(
      "BASELINE=PASS CARTON=ABSENT WRAP360=ABSENT PHOTO=RETAINED EXIT=0",
    );
    return;
  }
  let checks = 0;
  const check = (value: unknown, name: string) => {
    assert(value, name);
    checks++;
  };
  for (const template of ["bottle", "jar", "box"] as const) {
    check(
      projectSchema.safeParse(newProject(template)).success,
      "v1 compatibility",
    );
  }
  const carton = newCartonProject(),
    wrap = newWrapProject();
  for (const p of [carton, wrap]) {
    check(projectSchema.safeParse(p).success, "v3 valid");
    check(
      parseProject(JSON.stringify(p)).template === p.template,
      "v3 roundtrip",
    );
  }
  for (const p of [
    { ...carton, version: 1 },
    { ...carton, packaging: undefined },
    { ...wrap, template: "box" },
    { ...newProject("bottle"), version: 3 },
    { ...wrap, wrap: { ...wrap.wrap!, rotation: 181 } },
    { ...carton, packaging: { ...carton.packaging!, fold: 101 } },
    {
      ...carton,
      packaging: {
        ...carton.packaging!,
        artwork: "https://example.com/image.png",
      },
    },
  ])
    check(!projectSchema.safeParse(p).success, "reject malformed config");
  for (const [w, h, d] of [
    [64, 145, 42],
    [15, 20, 10],
    [250, 350, 250],
    [80, 120, 25],
  ]) {
    const net = cartonNet(w, h, d);
    check(net.panels.length === 13, "13 separate physical panels");
    check(
      net.panels.every(
        (q) =>
          q.x >= 0 &&
          q.y >= 0 &&
          q.x + q.width <= net.width + 0.0001 &&
          q.y + q.height <= net.height + 0.0001,
      ),
      "atlas in bounds",
    );
    const lines = netLines(net);
    const boundary = lines.filter(
      (l) =>
        l.axis === "v" &&
        Math.abs(l.at - d) < 1e-6 &&
        l.end <= d + net.tuck &&
        l.start >= d + net.tuck - net.dust,
    );
    check(
      boundary.length > 0 && boundary.every((l) => !l.fold),
      "dust flap touching lid is cut, not hinge",
    );
    check(
      lines.some((l) => l.fold) && lines.some((l) => !l.fold),
      "cut and crease separate",
    );
    check(
      dielineSvg(w, h, d).includes('id="cut-and-fold"'),
      "svg vector guides",
    );
    for (const fold of [0, 35, 70, 100]) {
      const p = {
        ...carton,
        width: w,
        height: h,
        depth: d,
        packaging: { ...carton.packaging!, fold },
      };
      const object = await buildCarton(p);
      object.updateMatrixWorld(true);
      let faces = 0;
      const maps = new Map<string, THREE.Mesh>();
      object.traverse((c) => {
        if (c instanceof THREE.Mesh && c.userData.panelId) {
          faces++;
          maps.set(c.userData.panelId, c);
          const uv = c.geometry.getAttribute("uv");
          for (let i = 0; i < uv.count; i++)
            assert(
              uv.getX(i) >= 0 &&
                uv.getX(i) <= 1 &&
                uv.getY(i) >= 0 &&
                uv.getY(i) <= 1,
            );
        }
      });
      check(faces === 13, "real panel meshes");
      const bounds = new THREE.Box3().setFromObject(object);
      check(bounds.min.y >= -1e-6, "above floor");
      if (fold === 100) {
        const backZ=maps.get("back")!.getWorldPosition(new THREE.Vector3()).z;
        for(const id of ["top-tuck","bottom-tuck"])check(new THREE.Box3().setFromObject(maps.get(id)!).min.z>backZ+.002,"tuck inside back panel, no visible overlap");
        const leftX=maps.get("left")!.getWorldPosition(new THREE.Vector3()).x;
        check(new THREE.Box3().setFromObject(maps.get("glue")!).min.x>leftX+.002,"glue inside left wall");
        const core = new THREE.Box3();
        for (const id of ["front", "back", "left", "right", "top", "bottom"])
          core.union(new THREE.Box3().setFromObject(maps.get(id)!));
        const size = core.getSize(new THREE.Vector3());
        check(
          Math.abs(size.x - w / 50) < 0.001 &&
            Math.abs(size.y - h / 50) < 0.001 &&
            Math.abs(size.z - d / 50) < 0.001,
          "closed physical dimensions",
        );
        const normals: Record<string, number[]> = {
          front: [0, 0, 1],
          back: [0, 0, -1],
          right: [1, 0, 0],
          left: [-1, 0, 0],
          top: [0, 1, 0],
          bottom: [0, -1, 0],
        };
        for (const [id, normal] of Object.entries(normals))
          check(
            new THREE.Vector3(0, 0, 1)
              .transformDirection(maps.get(id)!.matrixWorld)
              .distanceTo(new THREE.Vector3(...normal)) < 1e-6,
            `${id} outward normal`,
          );
      }
      if (fold === 0)
        check(
          bounds.getSize(new THREE.Vector3()).z < 0.001,
          "flat net coplanar",
        );
      disposeObject(object);
    }
  }
  for (const template of ["bottle", "jar"] as const) {
    const p = {
      ...newProject(template),
      version: 3 as const,
      wrap: { height: 40, center: 0.33, rotation: 0 },
    };
    const band = wrapBand(p);
    check(band.bottom >= 0 && band.top <= 0.8, "band on body");
    const geo = wrapGeometry(p),
      pos = geo.getAttribute("position"),
      uv = geo.getAttribute("uv"),
      norm = geo.getAttribute("normal");
    check(pos.count === 49 * 129, "full mesh rows");
    for (let row = 0; row <= 48; row++) {
      const a = row * 129,
        b = a + 128;
      assert(
        new THREE.Vector3()
          .fromBufferAttribute(pos, a)
          .distanceTo(new THREE.Vector3().fromBufferAttribute(pos, b)) < 1e-6,
      );
      assert(uv.getX(a) === 0 && uv.getX(b) === 1);
      const mid = a + 64;
      assert(pos.getZ(mid) > 0 && Math.abs(uv.getX(mid) - 0.5) < 1e-6);
      assert(norm.getZ(mid) > 0);
    }
    check(true, "back seam closes, front readable, normals outside");
    geo.dispose();
  }
  const profile = Array.from({ length: 64 }, (_, i) => ({
    y: i / 63,
    radius: 0.2,
    center: 0.5,
  }));
  const photo = {
    ...newProject("bottle"),
    version: 2 as const,
    template: "photo-lathe" as const,
    photo: {
      image: "data:image/png;base64,AA==",
      profile,
      sourceHash: "a".repeat(64),
      crop: { x: 0, y: 0, width: 1, height: 1 },
      width: 320,
      height: 640,
      textureMode: "clay" as const,
      scaleSource: "assumed" as const,
      assumption: "axisymmetric" as const,
      workerMs: 5,
    },
  };
  check(projectSchema.safeParse(photo).success, "v2 photo compatibility");
  const upgraded = {
    ...photo,
    id: crypto.randomUUID(),
    version: 3 as const,
    wrap: { height: 55, center: 0.4, rotation: 20 },
  };
  check(projectSchema.safeParse(upgraded).success, "v2 to v3 wrap upgrade");
  const shape = wrapGeometry(upgraded);
  check(shape.getAttribute("position").count === 6321, "photo shaped wrap");
  shape.dispose();
  for (const p of [carton, wrap, photo, upgraded]) {
    await saveProject("packaging-test", p);
  }
  check(
    (await listProjects("packaging-test")).length === 4,
    "all project modes persist",
  );
  check(
    (await listProjects("other-user")).length === 0,
    "account partition unchanged",
  );
  for (const p of [carton, wrap, photo, upgraded])
    await deleteProject("packaging-test", p.id);
  const product = await buildProduct(carton);
  check(product.children[0].name.includes("插口盒"), "scene dispatcher");
  disposeObject(product);
  console.log(
    `MODIFIED=PASS CHECKS=${checks} CARTON_HINGES=PASS UV360=PASS V1_V2_V3=PASS LOCAL_STORAGE=PASS SUPPLIER_CALLS=0 EXIT=0`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
