/** Isolated prior-receipt fixture; the real poster is supplied by path, never committed. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { readPsd, initializeCanvas } from "ag-psd";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1");
  const dbUrl = new URL(process.env.DATABASE_URL!);
  assert.equal(dbUrl.hostname, "127.0.0.1");
  assert.match(dbUrl.pathname, /fixture$/);
  const folder = path.resolve("output/psd-document-e2e");
  await mkdir(folder, { recursive: true });
  const email = "psd-editor@fixture.test",
    rootId = "poster-" + randomUUID(),
    base = await readFile(process.argv[2]);
  Object.assign(process.env, {
    MEDIA_DIR: path.join(folder, "media"),
    MEDIA_PRIVATE: "1",
    STORAGE_DRIVER: "local",
    NAUMI_MULTI_USER: "1",
    NAUMI_CANVAS_LAYERED_PSD_PILOT_EMAIL: email,
    NAUMI_RELEASE_RUNTIME: "0",
    NEXT_TELEMETRY_DISABLED: "1",
    NAUMI_VIDEO_WORKER: "0",
    NAUMI_ROUTER_MANAGEMENT_URL: "",
    NAUMI_ROUTER_MANAGEMENT_TOKEN: "",
    SETTINGS_SECRET: randomUUID(),
    VIDEO_WORKER_SECRET: randomUUID(),
  });
  const f = await createModelFixture();
  process.env.PGOPTIONS = "-c search_path=" + f.schemaName;
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS = f.origin;
  const db = await import("../src/lib/db");
  try {
    const cred = await f.credentials.importPlain({ providerId: "apib", plain: "fixture-only", actor: "fixture" });
    f.config.providers.push({
      ...f.config.providers[0],
      id: "apib",
      baseUrl: "https://api.apib.ai/v1",
      protocol: "apimart-images",
      credentialRef: cred.id,
    });
    f.config.upstreamModels.push({
      ...f.config.upstreamModels[0],
      id: "apib:seedream-5-0-pro",
      providerId: "apib",
      model: "seedream-5-0-pro",
    });
    await f.repo.current();
    await db.ensureSchema();
    await db.getOrCreateUser(email);
    await (await import("../src/lib/admin-auth")).setAdminPassword(randomUUID());
    initializeCanvas(
      () => {
        throw Error("pixels only");
      },
      (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
    );
    const original = readPsd(base, { useImageData: true, skipThumbnail: true });
    assert.equal(original.children?.length, 11);
    const composite = await sharp(Buffer.from(original.imageData!.data), {
      raw: { width: original.width, height: original.height, channels: 4 },
    })
      .png()
      .toBuffer();
    const { uploadImage } = await import("../src/lib/media-upload");
    const image = await uploadImage(composite, "image/png", rootId + ".png", undefined, email);
    await db.addArtworks(email, [
      {
        id: rootId,
        title: "测试海报",
        image,
        width: original.width,
        height: original.height,
        source: "canvas-add",
        origin: "canvas",
        category: "main",
        status: "completed",
        gradient: "",
        prompt: "",
      },
    ]);
    const service = await import("../src/lib/canvas/layered-psd-service");
    const { pilotOperationId: operationId, billing } = await service.layerPrice(email);
    assert.ok(operationId);
    const { withFrozenCreation } = await import("../src/lib/saas/creation-scope");
    const project = "tree:" + rootId;
    const byPath = new Map<string, Buffer>();
    const urls: string[] = [],
      sizes: string[] = [],
      layers: object[] = [];
    for (const [index, layer] of original.children!.entries()) {
      const pix = layer.imageData!,
        file = "/layer-" + index + ".png";
      byPath.set(
        file,
        await sharp(Buffer.from(pix.data), { raw: { width: pix.width, height: pix.height, channels: 4 } })
          .png()
          .toBuffer(),
      );
      urls.push("https://media.fixture" + file);
      sizes.push(pix.width + "x" + pix.height);
      layers.push({
        name: layer.name,
        z_index: index,
        bounding_box: { absolute: [layer.left, layer.top, layer.right, layer.bottom] },
      });
    }
    let submissions = 0;
    const transport: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.origin === "https://media.fixture")
        return new Response(new Uint8Array(byPath.get(url.pathname)!), {
          headers: { "content-type": "image/png" },
        });
      assert.equal(url.origin, "https://api.apib.ai");
      if (url.pathname === "/v1/uploads/images") return Response.json({ url: "https://media.fixture/poster.png" });
      if (url.pathname === "/v1/images/generations") {
        submissions++;
        return Response.json({ data: [{ task_id: "editor-fixture" }] });
      }
      assert.equal(url.pathname, "/v1/tasks/editor-fixture");
      return Response.json({
        data: {
          id: "editor-fixture",
          status: "completed",
          cost: 0,
          result: { images: [{ url: urls, sizes, layers, layer_decomposition: true }] },
        },
      });
    };
    const result = await withFrozenCreation(
      { actorEmail: email, scopeKind: "personal", tenantId: null, parentContext: project },
      () =>
        service.runLayerDecomposition(
          email,
          { operationId, artworkId: rootId, sourceImage: image, version: billing.version, credits: 0 },
          transport,
        ),
    );
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(submissions, 1);
    // Exercise the recovered-receipt format which predates the explicit sourceId.
    await db
      .getPool()
      .query("UPDATE app_billing_operations SET result_response=result_response-'sourceId' WHERE id=$1", [
        "tool-" + operationId,
      ]);
    const native = await import("../src/lib/native-auth");
    const port = Number(process.env.PSD_E2E_PORT || 14869),
      origin = "http://127.0.0.1:" + port;
    const env = {
      ...process.env,
      NODE_OPTIONS: "",
      PSD_E2E_ORIGIN: origin,
      PSD_E2E_NODE: "psd-" + operationId,
      PSD_E2E_PROJECT: project,
      PSD_E2E_COOKIE: native.signUserSession(email, Date.now()),
      PSD_E2E_OWNER: email,
    };
    const child = spawn(process.execPath, [path.resolve("scripts/verify-canvas-psd-document-browser.cjs")], {
      env,
      stdio: "inherit",
    });
    const code = await new Promise((resolve) => child.once("exit", resolve));
    assert.equal(code, 0);
    const rows = await db
      .getPool()
      .query("SELECT node_id,revision,edits,base_key FROM app_canvas_psd_documents WHERE email=$1", [email]);
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].revision, 1);
    const artwork = (await db.listArtworksByIds(email, [rows.rows[0].node_id]))[0];
    assert.equal(artwork.parentId, rootId);
    assert.equal(artwork.source, "canvas-layered-psd");
    const { readManagedObject } = await import("../src/lib/object-storage/managed-read");
    await writeFile(path.join(folder, "node-preview.png"), (await readManagedObject(artwork.image)).bytes);
    console.log("PSD_EDITOR_PG_PASS realLayers=11 sourceSha=" + createHash("sha256").update(base).digest("hex"));
  } finally {
    await db.getPool().end();
    await f.cleanup();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
