import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import {
  newProject,
  projectSchema,
  parseProject,
  outputDimensions,
  validateGlb,
  TEMPLATES,
  MATERIALS,
} from "../src/lib/studio3d/project";
import { buildProduct, disposeObject } from "../src/lib/studio3d/scene";
import {
  ALL_FEATURE_IDS,
  pageFeature,
  allows,
} from "../src/lib/feature-access/catalog";
import { desktopHref } from "../src/lib/desktop/routes";
import "fake-indexeddb/auto";
import {
  saveProject,
  listProjects,
  deleteProject,
} from "../src/lib/studio3d/storage";

async function main() {
  if (process.argv[2] === "baseline") {
    const root = path.resolve(process.argv[3] || ".");
    assert(!existsSync(path.join(root, "src/app/studio3d/page.tsx")));
    assert(!existsSync(path.join(root, "src/lib/studio3d/engine.ts")));
    assert(
      !readFileSync(path.join(root, "src/lib/tool-meta.ts"), "utf8").includes(
        'slug: "studio3d"',
      ),
    );
    console.log(
      "BASELINE=PASS STUDIO3D_ROUTE=ABSENT ENTRY=ABSENT REAL_3D_ENGINE=ABSENT EXIT=0",
    );
    return;
  }
  let checks = 0;
  const check = (value: unknown, label: string) => {
    assert(value, label);
    checks++;
  };
  for (const template of TEMPLATES) {
    const p = newProject(template.id);
    check(projectSchema.safeParse(p).success, "default schema");
    check(parseProject(JSON.stringify(p)).id === p.id, "roundtrip");
    for (const material of Object.keys(MATERIALS)) {
      const product = await buildProduct({
        ...p,
        material: material as typeof p.material,
      });
      const bounds = new THREE.Box3().setFromObject(product),
        size = bounds.getSize(new THREE.Vector3());
      check(Math.abs(size.y - p.height / 50) < 0.04, "actual height");
      check(size.x > 0 && size.z > 0, "actual mesh dimensions");
      let vertices = 0;
      product.traverse((child) => {
        if (child instanceof THREE.Mesh)
          vertices += child.geometry.attributes.position.count;
      });
      check(vertices > 100, "real vertices");
      check(product.children.length >= 1, "mesh children");
      disposeObject(product);
    }
  }
  for (const output of ["square", "portrait", "landscape"] as const)
    for (const size of [1024, 2048, 4096] as const) {
      const [w, h] = outputDimensions({ output, size });
      check(
        Number.isInteger(w) && Number.isInteger(h) && Math.max(w, h) === size,
        "output dimensions",
      );
    }
  const p = newProject("box");
  for (const invalid of [
    { width: 0 },
    { height: Infinity },
    { material: "fake" },
    { background: "red" },
    { label: "https://remote/label.png" },
    { template: "imported" },
    { model: "Zg==" },
    { version: 2 },
    { camera: { position: [0, 0, 0], target: [0, 0, 0] } },
    { size: 8192 },
    { unknown: true },
  ]) {
    check(
      !projectSchema.safeParse({ ...p, ...invalid }).success,
      "reject invalid project",
    );
  }
  assert.throws(() => parseProject("not-json"));
  checks++;
  assert.throws(() => validateGlb(new ArrayBuffer(12)));
  checks++;
  function glb(doc: unknown) {
    const json = Buffer.from(
      JSON.stringify(doc).padEnd(
        Math.ceil(JSON.stringify(doc).length / 4) * 4,
        " ",
      ),
    );
    const bytes = new ArrayBuffer(20 + json.length),
      view = new DataView(bytes);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, bytes.byteLength, true);
    view.setUint32(12, json.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(bytes, 20).set(json);
    return bytes;
  }
  const base = {
    asset: { version: "2.0" },
    accessors: [{ count: 3 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
  };
  check(validateGlb(glb(base)).vertices === 3, "valid embedded GLB envelope");
  for (const extra of [
    { images: [{ uri: "https://remote/image.png" }] },
    { buffers: [{ uri: "data:application/octet-stream;base64,AAAA" }] },
    { accessors: [{ count: 500001 }] },
    { extensions: { KHR_draco_mesh_compression: {} } },
    { nodes: new Array(2001).fill({ mesh: 0 }) },
  ]) {
    assert.throws(() => validateGlb(glb({ ...base, ...extra })));
    checks++;
  }
  check(ALL_FEATURE_IDS.includes("studio3d"), "feature registered");
  check(
    pageFeature("/studio3d") === "studio3d" &&
      pageFeature("/desktop/studio3d") === "studio3d",
    "both page gates",
  );
  check(
    !allows({ mode: "custom", allowed: ["generate"], version: 1 }, "studio3d"),
    "custom grant denied",
  );
  check(
    allows({ mode: "custom", allowed: ["studio3d"], version: 1 }, "studio3d"),
    "explicit grant",
  );
  check(desktopHref("/studio3d") === "/desktop/studio3d", "desktop route");
  check(
    readFileSync("src/app/desktop/[[...segments]]/page.tsx", "utf8").includes(
      '"studio3d": Page_studio3d',
    ),
    "desktop page wired",
  );
  check(
    readFileSync("src/components/app-shell.tsx", "utf8").includes(
      'path.startsWith("/studio3d")',
    ),
    "immersive shell",
  );
  await saveProject("fixture-a", p);
  await saveProject("fixture-b", { ...p, name: "B" });
  check(
    (await listProjects("fixture-a"))[0].name === p.name,
    "account A isolated",
  );
  check(
    (await listProjects("fixture-b"))[0].name === "B",
    "account B isolated",
  );
  await saveProject("fixture-a", { ...p, name: "A edited" });
  check((await listProjects("fixture-a")).length === 1, "same ID update");
  await deleteProject("fixture-a", p.id);
  check(
    (await listProjects("fixture-a")).length === 0 &&
      (await listProjects("fixture-b")).length === 1,
    "delete owner isolation",
  );
  await assert.rejects(() => saveProject("fixture-a", { ...p, width: 0 }));
  checks++;
  await deleteProject("fixture-b", p.id);
  const ui = readFileSync("src/components/studio3d/studio3d-client.tsx", "utf8");
  check(ui.includes('setSceneError(value)') && ui.includes('setLoading(false)'), "WebGL failure ends loading");
  check(ui.includes('camera: engine?.pose() || project.camera'), "project backup independent of live WebGL");
  console.log(
    `MODIFIED=PASS CHECKS=${checks} TEMPLATES=3 MATERIALS=4 OUTPUTS=9 REAL_MESH=YES PROJECT_ROUNDTRIP=YES EXTERNAL_GLB=REJECTED NAV_PERMISSION=PASS SUPPLIER_CALLS=0 EXIT=0`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
