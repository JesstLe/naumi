/** Read only existing input references. Never infer inputs from mutable canvas edges. */
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export type ArtworkInput = { url: string; artworkId?: never } | { artworkId: string; url?: never };
const editOperations = new Set(["replicate", "retouch", "recolor", "cutout", "upscale", "inpaint", "style", "garment", "garment3d", "avatar", "dewrinkle", "dewatermark", "tryon", "packaging3d", "canvas-text-edit", "canvas-expand", "canvas-annotate"]);
export function artworkInputs(row: RecordValue): { inputs: ArtworkInput[]; mode: string; status: string } {
  const params = object(row.input_params), request = object(row.input_request);
  const operation = String(object(row.creation_provenance).operation || row.job_kind || row.canvas_task_kind || "");
  if (["upload", "import", "template", "copy"].includes(operation) || row.source_url === "upload")
    return { inputs: [], mode: operation === "upload" ? "上传图片" : "作品记录", status: "不适用" };
  // These buffers were persisted before the supplier call: exact submitted image bytes.
  const persisted = Array.isArray(params.images) ? params.images : Array.isArray(row.input_images) ? row.input_images : null;
  if (persisted) {
    const inputs: ArtworkInput[] = persisted.map(item => object(object(item).buf).$imageJobBuffer)
      .map(url => typeof url === "string" && url ? { url } : null).filter((x): x is { url: string } => x !== null);
    if (persisted.length) return { inputs, mode: "图生图", status: inputs.length === persisted.length ? "已关联" : "部分原图缺失" };
    return { inputs: [], mode: "文生图", status: "无原图" };
  }
  const refs = array(request.inputs).filter(item => object(item).role !== "mask");
  const inputs: ArtworkInput[] = refs.map(item => object(item).artworkId)
    .filter((id): id is string => typeof id === "string" && !!id).map(artworkId => ({ artworkId }));
  if (inputs.length) return { inputs, mode: "图生图", status: "已关联" };
  if (typeof row.input_source_id === "string" && row.input_source_id)
    return { inputs: [{ artworkId: row.input_source_id }], mode: "图生图", status: "已关联" };
  if (Array.isArray(request.inputs) && request.mode === "generate") return { inputs: [], mode: "文生图", status: "无原图" };
  return { inputs: [], mode: editOperations.has(operation) ? "图生图" : "类型待核验", status: "原图未留存" };
}

/** Same aliases in BI list and media lookup; raw payload fields never leave the server. */
export const ARTWORK_INPUT_COLUMNS = `jsonb_build_object('images',j.payload->'p'->'images') AS input_params,
  COALESCE(j.payload->'p'->'imagegen'->'request', j.payload->'plan'->'request') AS input_request,
  j.payload->'images' AS input_images,c.source_artwork_id AS input_source_id`;
export const ARTWORK_INPUT_JOINS = `LEFT JOIN app_image_jobs j ON j.email=a.email AND j.id=CASE
  WHEN a.creation_provenance->>'operation' IN ('generate','suite','aplus') THEN a.creation_provenance->>'ref'
  WHEN a.batch_id LIKE 'b-job-%' THEN substring(a.batch_id from 3) ELSE a.batch_id END
  LEFT JOIN LATERAL (SELECT id,kind,source_artwork_id FROM app_canvas_image_tasks
    WHERE email=a.email AND result_artwork_id=a.id ORDER BY created_at,id LIMIT 1) c ON true`;

export function artworkInputPresentation(raw: RecordValue) {
  const { inputs, mode, status } = artworkInputs(raw);
  return { input_count: inputs.length, generation_mode: mode, input_status: status };
}
