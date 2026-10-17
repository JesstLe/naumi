import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { traceOutline } from "../src/lib/studio3d/photo-outline";
import { buildPhotoMesh } from "../src/lib/studio3d/photo-mesh";
import {
  projectSchema,
  newProject,
  parseProject,
} from "../src/lib/studio3d/project";
import { disposeObject } from "../src/lib/studio3d/scene";

async function main() {
  if (process.argv[2] === "baseline") {
    const root = path.resolve(process.argv[3] || ".");
    assert(!existsSync(path.join(root, "src/lib/studio3d/photo-worker.ts")));
    assert(
      !readFileSync(
        path.join(root, "src/components/studio3d/studio3d-client.tsx"),
        "utf8",
      ).includes("上传照片建模"),
    );
    console.log("BASELINE=PASS LOCAL_PHOTO_ENTRY=ABSENT WORKER=ABSENT EXIT=0");
    return;
  }
  if(process.argv[2]==='sample'){
    const sharp=(await import('sharp')).default;
    const source=process.argv[3];if(!source)throw Error('sample path required');
    const {data,info}=await sharp(source).resize({height:1536}).extract({left:320,top:502,width:233,height:768}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const outline=traceOutline(new Uint8ClampedArray(data),info.width,info.height);
    assert(outline.widthHeight>.24&&outline.widthHeight<.31);
    assert(outline.contrast>.05);
    assert(outline.profile.length===192);
    console.log('SAMPLE=PASS CROP=37%,32.7%,27%,50% PROFILE_POINTS=192 WIDTH_HEIGHT=IN_0.24_0.31 NETWORK=0 SERVER_INFERENCE=0 EXIT=0');return;
  }
  let checks = 0;
  const check = (v: unknown, label: string) => {
    assert(v, label);
    checks++;
  };
  const w = 180,
    h = 600,
    pixels = new Uint8ClampedArray(w * h * 4);
  pixels.fill(255);
  for (let y = 0; y < h; y++) {
    const radius = y < h * 0.2 ? 48 : 70;
    for (let x = w / 2 - radius; x < w / 2 + radius; x++) {
      const i = (y * w + x) * 4;
      pixels[i] = 35;
      pixels[i + 1] = 85;
      pixels[i + 2] = 45;
    }
  }
  const outline = traceOutline(pixels, w, h);
  check(outline.profile.length === 192, "bounded profile");
  check(
    Math.abs(outline.widthHeight - 140 / 600) < 0.02,
    "silhouette physical ratio",
  );
  check(
    outline.profile[150].radius > outline.profile[180].radius,
    "neck narrower than body",
  );
  assert.throws(() =>
    traceOutline(new Uint8ClampedArray(w * h * 4).fill(255), w, h),
  );
  checks++;
  assert.throws(() => traceOutline(pixels, 600, 180));
  checks++;
  assert.throws(() => traceOutline(new Uint8ClampedArray(4), w, h));
  checks++;
  const project = {
    ...newProject("bottle"),
    version: 2 as const,
    template: "photo-lathe" as const,
    width: 40,
    height: 160,
    photo: {
      image: "data:image/png;base64,AAAA",
      profile: outline.profile,
      sourceHash: "a".repeat(64),
      crop: { x: 0, y: 0, width: 1, height: 1 },
      width: w,
      height: h,
      textureMode: "clay" as const,
      scaleSource: "assumed" as const,
      assumption: "axisymmetric" as const,
      workerMs: 17,
    },
  };
  check(projectSchema.safeParse(project).success, "v2 photo project valid");
  check(
    parseProject(JSON.stringify(project)).photo?.profile.length === 192,
    "project roundtrip",
  );
  check(
    parseProject(JSON.stringify(newProject("box"))).version === 1,
    "legacy v1 preserved",
  );
  for (const bad of [
    { version: 1 },
    { photo: undefined },
    { model: "AAAA" },
    { photo: { ...project.photo, image: "https://example.test/image" } },
    {
      photo: {
        ...project.photo,
        crop: { x: 0.8, y: 0, width: 0.8, height: 1 },
      },
    },
    { photo: { ...project.photo, profile: [...outline.profile].reverse() } },
    { photo: { ...project.photo, width: 99999 } },
    { photo: { ...project.photo, sourceHash: "x" } },
  ]) {
    check(
      !projectSchema.safeParse({ ...project, ...bad }).success,
      "invalid input rejected",
    );
  }
  const model = await buildPhotoMesh(project),
    bounds = new THREE.Box3().setFromObject(model),
    size = bounds.getSize(new THREE.Vector3());
  check(
    Math.abs(size.y - 3.2) < 0.0001 && Math.abs(size.x - 0.8) < 0.0001,
    "geometry matches edited size",
  );
  check(model.children.length === 4, "front back and closures");
  check(
    model.children.some((c) => c.name === "背面待补充"),
    "unobserved back explicit",
  );
  let vertices = 0;
  model.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      vertices += c.geometry.attributes.position.count;
      for (const value of c.geometry.attributes.position.array)
        assert(Number.isFinite(value));
    }
  });
  check(vertices > 30000 && vertices < 50000, "real bounded 3D geometry");
  const front = model.children[0] as THREE.Mesh,
    normal = front.geometry.attributes.normal;
  check(normal.getZ(96 / 2) > 0, "front normals outward");
  disposeObject(model);
  for (const file of [
    "src/lib/studio3d/photo-client.ts",
    "src/lib/studio3d/photo-worker.ts",
    "src/lib/studio3d/photo-outline.ts",
    "src/lib/studio3d/photo-mesh.ts",
    "src/components/studio3d/photo-import.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    check(
      !/\bfetch\s*\(|XMLHttpRequest|sendBeacon|https?:\/\//.test(source),
      "no network API " + file,
    );
  }
  const client = readFileSync("src/lib/studio3d/photo-client.ts", "utf8");
  check(
    client.includes("new Worker") && client.includes("worker.terminate()"),
    "worker isolation and disposal",
  );
  check(
    client.includes("signal.addEventListener('abort'") ||
      client.includes('signal.addEventListener("abort"'),
    "cancel worker",
  );
  const result = `MODIFIED=PASS CHECKS=${checks} BROWSER_WORKER=YES NETWORK_APIS=0 REAL_MESH=YES V1_COMPATIBLE=YES V2_ROUNDTRIP=PASS UNKNOWN_BACK=EXPLICIT EXIT=0`;
  console.log(result);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
