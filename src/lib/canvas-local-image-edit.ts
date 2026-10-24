import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { z } from "zod";
import {getPool} from "@/platform/db/pool";
import {listArtworksByIds} from "@/lib/artworks/repository";
import { uploadImage } from "@/lib/storage";
import { readCanvasOutput } from "@/lib/canvas-image-input";
import { IMAGEGEN_OUTPUT_MAX_BYTES } from "./imagegen/image-limits";
import { ensureCanvasSettingsSchema } from "@/lib/canvas-node-settings-store";
import { cropSchema, pixelCrop, type CanvasCrop } from "@/lib/canvas/node-settings";
import { adaptiveCanvasImageSize } from "@/lib/mock-data";
import {imagegenOutputSchema,imagegenChromaSchema} from "./imagegen/schema";
import {processImagegenPixels} from "./imagegen/postprocess";

export const localEditSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("crop"), id: z.string().min(1).max(200), operationId: z.string().uuid(), crop: cropSchema }).strict(),
  z.object({ mode: z.literal("replace"), id: z.string().min(1).max(200), operationId: z.string().uuid() }).strict(),
  z.object({mode:z.literal("process"),id:z.string().min(1).max(200),operationId:z.uuid(),output:imagegenOutputSchema,chroma:imagegenChromaSchema.optional()}).strict(),
]);
export async function editCanvasPixels(bytes: Buffer, crop?: CanvasCrop, generatedOutput = false) {
  if (!bytes.length || bytes.length > (generatedOutput ? IMAGEGEN_OUTPUT_MAX_BYTES : 12 * 1024 * 1024)) throw new Error("图片超出当前处理大小限制");
  const decoder = sharp(bytes, { limitInputPixels: 40_000_000 });
  const meta = await decoder.metadata();
  if (!["png", "jpeg", "webp"].includes(meta.format || "") || (meta.pages || 1) > 1) throw new Error("请选择静态PNG、JPEG或WebP图片");
  const normalized = await decoder.rotate().png().toBuffer({ resolveWithObject: true });
  const output = crop
    ? await sharp(normalized.data).extract(pixelCrop(crop, normalized.info.width, normalized.info.height)).png().toBuffer({ resolveWithObject: true })
    : normalized;
  return { bytes: output.data, width: output.info.width, height: output.info.height };
}

/** Local pixel edit creates an immutable, linked version. No model or credit calls. */
export async function saveCanvasLocalEdit(email: string, value: z.infer<typeof localEditSchema>, requestUrl: string, replacement?: Buffer, provenance?: {entry:"agent"|"canvas"|"workbench";generatedOutput?:boolean}) {
  const input = localEditSchema.parse(value);
  const entry=provenance?.entry||"canvas",canvasEntry=entry==="canvas";
  await ensureCanvasSettingsSchema();
  const source = (await listArtworksByIds(email, [input.id]))[0];
  if (!source || source.videoUrl || !source.image) throw new Error("图片不存在或无权编辑");
  if (input.mode === "replace" && !replacement) throw new Error("请选择替换图片");
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).update(input.mode === "replace" ? replacement! : source.image).digest("hex");
  const prior = await getPool().query("SELECT fingerprint,artwork_id FROM app_canvas_local_edits WHERE email=$1 AND operation_id=$2", [email,input.operationId]);
  if (prior.rows[0]) {
    if (prior.rows[0].fingerprint !== fingerprint) throw new Error("操作编号已使用");
    return { id: prior.rows[0].artwork_id as string };
  }
  const bytes = input.mode === "replace" ? replacement! : (await readCanvasOutput(source.image,requestUrl,email)).buffer;
  const generatedOutput = input.mode !== "replace" || provenance?.generatedOutput === true;
  const edited = input.mode==="process"?await processImagegenPixels(bytes,input):await editCanvasPixels(bytes,input.mode === "crop" ? input.crop : undefined,generatedOutput);
  if (edited.bytes.length > IMAGEGEN_OUTPUT_MAX_BYTES) throw new Error("编辑结果超出64MiB处理限制");
  const id = `art-local-${input.operationId}`;
  const mime="mime" in edited&&typeof edited.mime==="string"?edited.mime:"image/png",extension=mime==="image/jpeg"?"jpg":mime==="image/webp"?"webp":"png";
  const transparentPixels="transparentPixels" in edited&&typeof edited.transparentPixels==="number"?edited.transparentPixels:undefined;
  const totalPixels="totalPixels" in edited&&typeof edited.totalPixels==="number"?edited.totalPixels:undefined;
  const image = await uploadImage(edited.bytes,mime,`canvas-local-edits/${id}-${fingerprint.slice(0,16)}.${extension}`,undefined,email);
  const size = adaptiveCanvasImageSize(edited.width,edited.height);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[email]);
    const existing = await client.query("SELECT fingerprint,artwork_id FROM app_canvas_local_edits WHERE email=$1 AND operation_id=$2",[email,input.operationId]);
    if (existing.rows[0]) {
      if (existing.rows[0].fingerprint !== fingerprint) throw new Error("操作编号已使用");
      await client.query("COMMIT"); return { id: existing.rows[0].artwork_id as string };
    }
    const origin = await client.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE",[email,source.id]);
    if (!origin.rows.length) throw new Error("原节点已删除，请刷新画布");
    const row=origin.rows[0];
    const title=`${source.title} · ${input.mode === "crop" ? "裁剪" : input.mode==="process"?"图像处理":"替换"}`.slice(0,80);
    await client.query(`INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,parent_id,parent_ids,group_id,
      source_url,origin,image_width,image_height,canvas_width,canvas_height,canvas_x,canvas_y,creation_provenance)
      VALUES($1,$2,$3,$4,$5,'completed',$6,$7,$8,'[]'::jsonb,$9,$17,$18,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
      [id,email,title,source.category,source.prompt,image,source.gradient,source.id,canvasEntry?row.group_id || source.id:id,edited.width,edited.height,
        size.width,size.height,canvasEntry?(source.canvasX || 0)+40:null,canvasEntry?(source.canvasY || 0)+(source.canvasHeight || size.height)+48:null,
        JSON.stringify({version:1,operation:`${canvasEntry?"canvas":"imagegen"}-${input.mode}`,entry,ref:input.operationId,sourceArtworkId:source.id,evidence:"server-route",...(input.mode==="process"?{output:input.output,mime,transparentPixels,totalPixels}:{})}),canvasEntry?"canvas-local-edit":"imagegen-postprocess",entry]);
    await client.query("INSERT INTO app_canvas_local_edits(email,operation_id,fingerprint,artwork_id) VALUES($1,$2,$3,$4)",[email,input.operationId,fingerprint,id]);
    await client.query("COMMIT");
    return { id, image, width: edited.width, height: edited.height,mime,transparentPixels,totalPixels };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
