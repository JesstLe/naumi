import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { initializeCanvas, readPsd, writePsdBuffer } from "ag-psd";
import { getPool } from "@/platform/db/pool";
import { withTransaction } from "@/platform/db/transaction";
import { databaseSchemaReadiness } from "@/platform/db/schema-readiness";
import { addArtworksTx } from "@/lib/artworks/writer";
import { fingerprint, stableJson } from "@/lib/billing/fingerprint";
import { BillingError } from "@/lib/billing/types";
import { registerPrivateMediaTx } from "@/lib/media-assets/writer";
import { readManagedObject } from "@/lib/object-storage/managed-read";
import { writeStoredObject, storageDriver } from "@/lib/object-storage/runtime";
import { layeredPsdReceipt, MAX_PSD_BYTES, ownedCanvasSource } from "./layered-psd-service";
import { composePsd, initialPsdEdits, InvalidLayerEdit, type PsdEdits } from "./psd-document";
import { ensureCanvasImageVersions, updateLayeredCanvasPreviewTx } from "./image-version-store";

const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const missing = () => new BillingError("INVALID_RESULT", "分层文档不存在或无权访问", 404);
async function schema() {
  const state = databaseSchemaReadiness(getPool(), "canvas-psd-documents");
  if (!state.pending)
    state.pending = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS app_canvas_psd_documents(
    node_id text PRIMARY KEY REFERENCES app_artworks(id) ON DELETE CASCADE, email text NOT NULL, project text NOT NULL,
    base_key text NOT NULL, revision integer NOT NULL DEFAULT 0, edits jsonb NOT NULL)`,
      )
      .then(() => {})
      .catch((e) => {
        state.pending = undefined;
        throw e;
      });
  await state.pending;
}
async function decode(key: string) {
  const file = await readManagedObject("/media/" + key, MAX_PSD_BYTES, AbortSignal.timeout(30000));
  initializeCanvas(
    () => {
      throw Error("Expected raster image data");
    },
    (width, height) =>
      ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb" }) as ImageData,
  );
  return readPsd(file.bytes, { useImageData: true, skipCompositeImageData: true, skipThumbnail: true });
}
function encodePng(doc: ReturnType<typeof composePsd>) {
  const image = doc.imageData!;
  return sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: doc.width, height: doc.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
async function thumbnail(node: string, doc: ReturnType<typeof composePsd>) {
  const bytes = await encodePng(doc);
  const sha256 = digest(bytes),
    key = `layered-psd/previews/${node}/${sha256}.png`;
  const file = await writeStoredObject(bytes, "image/png", key);
  return {
    key,
    sha256,
    bytes: bytes.length,
    contentType: "image/png",
    driver: storageDriver,
    remoteReady: file.remoteReady,
  };
}
export async function verifiedPsdSource(email: string, operationId: string, sourceId: string) {
  const receipt = await layeredPsdReceipt(email, operationId);
  if (receipt?.state !== "ready") throw missing();
  const { source, project } = await ownedCanvasSource(email, sourceId);
  const id = "tool-" + operationId;
  const b = (
    await getPool().query(
      "SELECT quote,request_fingerprint,result_response FROM app_billing_operations WHERE id=$1 AND email=$2",
      [id, email],
    )
  ).rows[0];
  // Older recovered receipts can lack sourceId. Verify the frozen input fingerprint.
  const hash = digest(JSON.stringify(["/api/canvas/layered-psd", source.id, source.image, project]));
  if (
    !b ||
    (b.result_response?.sourceId
      ? b.result_response.sourceId !== sourceId
      : fingerprint({ email, quote: b.quote, ledgerId: "led-" + id, fingerprint: hash }) !== b.request_fingerprint)
  )
    throw missing();
  return { receipt, source, project };
}
export async function attachPsdDocument(email: string, operationId: string, sourceId: string) {
  const { receipt, source, project } = await verifiedPsdSource(email, operationId, sourceId);
  const node = "psd-" + operationId;
  await schema();
  const existing = await getPool().query(
    "SELECT a.deleted_at FROM app_canvas_psd_documents d JOIN app_artworks a ON a.id=d.node_id WHERE node_id=$1 AND d.email=$2 AND project=$3",
    [node, email, project],
  );
  if (existing.rowCount) {
    if (existing.rows[0].deleted_at) throw missing();
    return node;
  }
  const base = await decode(receipt.fileKey),
    edits = initialPsdEdits(base);
  const thumb = await thumbnail(node, composePsd(base, edits));
  await withTransaction(getPool(), async (tx) => {
    const parent = await tx.query(
      "SELECT 1 FROM app_artworks WHERE id=$1 AND email=$2 AND deleted_at IS NULL FOR SHARE",
      [sourceId, email],
    );
    if (!parent.rowCount) throw missing();
    await registerPrivateMediaTx(tx, { ...thumb, owner: email });
    await addArtworksTx(
      tx,
      email,
      [
        {
          id: node,
          parentId: sourceId,
          title: source.title + " · 分层",
          category: "main",
          source: "canvas-layered-psd",
          origin: "canvas",
          status: "completed",
          prompt: "",
          gradient: "",
          image: "/media/" + thumb.key,
          width: base.width,
          height: base.height,
          ratio: source.ratio,
          groupId: source.groupId,
          batchId: source.batchId,
        },
      ],
      undefined,
      "preserve",
    );
    await tx.query(
      "INSERT INTO app_canvas_psd_documents(node_id,email,project,base_key,edits) VALUES($1,$2,$3,$4,$5) ON CONFLICT(node_id) DO NOTHING",
      [node, email, project, receipt.fileKey, JSON.stringify(edits)],
    );
  });
  return node;
}
export async function getPsdDocument(email: string, node: string) {
  const { source, project } = await ownedCanvasSource(email, node);
  if (source.source !== "canvas-layered-psd") throw missing();
  await schema();
  const row = (
    await getPool().query(
      `SELECT d.revision,d.edits,d.base_key,a.image_url FROM app_canvas_psd_documents d
    JOIN app_artworks a ON a.id=d.node_id AND a.email=d.email AND a.deleted_at IS NULL
    WHERE d.node_id=$1 AND d.email=$2 AND d.project=$3`,
      [node, email, project],
    )
  ).rows[0];
  if (!row) throw missing();
  return {
    revision: Number(row.revision),
    edits: row.edits as PsdEdits,
    baseKey: String(row.base_key),
    image: String(row.image_url),
  };
}
export async function savePsdDocument(email: string, node: string, revision: number, edits: PsdEdits) {
  const old = await getPsdDocument(email, node);
  if (stableJson(edits) === stableJson(old.edits)) return { revision: old.revision, image: old.image };
  const conflict = () => new BillingError("OPERATION_CONFLICT", "图层已在其他窗口更新，请重新打开后编辑", 409);
  if (revision !== old.revision) throw conflict();
  await ensureCanvasImageVersions();
  const doc = composePsd(await decode(old.baseKey), edits),
    thumb = await thumbnail(node, doc);
  return withTransaction(getPool(), async (tx) => {
    const a = await tx.query(
      "SELECT canvas_image_version FROM app_artworks WHERE id=$1 AND email=$2 AND deleted_at IS NULL FOR UPDATE",
      [node, email],
    );
    if (!a.rowCount) throw missing();
    if (a.rows[0].canvas_image_version?.id && a.rows[0].canvas_image_version.id !== "initial")
      throw new BillingError("OPERATION_CONFLICT", "请切回分层节点的初始图片版本后保存", 409);
    const settings = await tx.query(
      "SELECT settings FROM app_canvas_node_settings WHERE email=$1 AND node_id=$2",
      [email, node],
    );
    if (settings.rows[0]?.settings?.locked) throw new BillingError("OPERATION_CONFLICT", "请先解锁分层节点", 409);
    const updated = await tx.query(
      "UPDATE app_canvas_psd_documents SET edits=$1,revision=revision+1 WHERE node_id=$2 AND email=$3 AND revision=$4 RETURNING revision",
      [JSON.stringify(edits), node, email, revision],
    );
    if (!updated.rowCount) {
      const latest = (
        await tx.query("SELECT edits,revision FROM app_canvas_psd_documents WHERE node_id=$1 AND email=$2", [
          node,
          email,
        ])
      ).rows[0];
      if (latest && stableJson(latest.edits) === stableJson(edits))
        return { revision: Number(latest.revision), image: "/media/" + thumb.key };
      throw conflict();
    }
    await registerPrivateMediaTx(tx, { ...thumb, owner: email });
    const image = "/media/" + thumb.key;
    await updateLayeredCanvasPreviewTx(tx, email, node, image);
    return { revision: Number(updated.rows[0].revision), image };
  });
}
export async function exportPsdDocument(
  email: string,
  node: string,
  revision: number,
  layer?: { index: number; format: "png" | "psd" },
) {
  const doc = await getPsdDocument(email, node);
  if (revision !== doc.revision)
    throw new BillingError("OPERATION_CONFLICT", "文档版本已更新，请重新打开后导出", 409);
  const base = await decode(doc.baseKey);
  if (!layer) return writePsdBuffer(composePsd(base, doc.edits));
  const edit = doc.edits.find((item) => item.index === layer.index);
  const source = base.children?.[layer.index];
  if (!edit || !source?.imageData) throw new InvalidLayerEdit("找不到选中的图层");
  // Export the whole layer in its own coordinates, including any pixels outside the poster.
  const { width, height } = source.imageData;
  const solo = composePsd({ width, height, children: [source] }, [
    { ...edit, index: 0, x: 0, y: 0, visible: true },
  ]);
  return layer.format === "png" ? encodePng(solo) : writePsdBuffer(solo, { noBackground: true });
}
