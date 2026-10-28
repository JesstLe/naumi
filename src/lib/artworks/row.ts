import type {ArtworkRecord} from "./types";

export type ArtworkRow = Pick<ArtworkRecord,"id"|"title"|"category"|"prompt"|"status"|"gradient"|"style"|"ratio"|"resolution"|"origin"|"marked"> & {
  image_url: string;
  canvas_image_revision?: number;
  canvas_image_version?: (Partial<Pick<ArtworkRecord,"image"|"prompt"|"style"|"ratio"|"resolution"|"width"|"height">>&{id:string})|null;
  source_url?: string | null;
  batch_id?: string | null;
  parent_id?: string | null;
  parent_ids?: unknown;
  template_id?: string | null;
  canvas_x?: number | null;
  canvas_y?: number | null;
  image_width?: number | null;
  image_height?: number | null;
  processing_kind?: ArtworkRecord["processingKind"];
  postprocess_status?: ArtworkRecord["postprocessStatus"];
  canvas_width?: number | null;
  canvas_height?: number | null;
  group_id?: string | null;
  canvas_group_id?: string | null;
  video_url?: string | null;
  creation_provenance?: ArtworkRecord["creationProvenance"];
  created_at: string | Date;
};

/** One lossless row projection for active, selected and trashed artworks. */
export function rowToArtwork(r: ArtworkRow): ArtworkRecord {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    prompt: r.canvas_image_version?.prompt ?? r.prompt,
    status: r.status,
    image: r.canvas_image_version?.image ?? r.image_url,
    canvasImageRevision: Number(r.canvas_image_revision || 0),
    canvasImageVersionId: r.canvas_image_version?.id || "initial",
    gradient: r.gradient,
    style: r.canvas_image_version?.style ?? r.style ?? null,
    ratio: r.canvas_image_version?.ratio ?? r.ratio ?? null,
    resolution: r.canvas_image_version?.resolution ?? r.resolution ?? null,
    source: r.source_url ?? null,
    batchId: r.batch_id ?? null,
    parentId: r.parent_id ?? null,
    parentIds: Array.isArray(r.parent_ids) ? (r.parent_ids as string[]) : [],
    templateId: r.template_id ?? null,
    canvasX: r.canvas_x ?? null,
    canvasY: r.canvas_y ?? null,
    width: r.canvas_image_version?.width ?? r.image_width ?? null,
    height: r.canvas_image_version?.height ?? r.image_height ?? null,
    processingKind: r.processing_kind ?? null,
    postprocessStatus: r.postprocess_status ?? null,
    canvasWidth: r.canvas_width ?? null,
    canvasHeight: r.canvas_height ?? null,
    groupId: r.group_id ?? null,
    canvasGroupId: r.canvas_group_id ?? null,
    origin: r.origin ?? null,
    creationProvenance: r.creation_provenance ?? null,
    marked: !!r.marked,
    videoUrl: r.video_url ?? null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

