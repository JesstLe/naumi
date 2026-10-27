import { CANVAS_IMAGE_TOOLS, type CanvasAgentContext } from "./canvas-context";

/** Explicit public fields only. Never serialize raw tool args, URLs or credentials. */
export type PublicToolDetails = {
  parameters: { name: string; value: string }[];
  targetId?: string;
  inputCount?: number;
};

export function publicToolDetails(tool: string, input: unknown, canvas?: CanvasAgentContext): PublicToolDetails {
  const args = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const parameters: PublicToolDetails["parameters"] = [];
  const add = (name: string, value: unknown, valid: (value: string) => boolean) => {
    if ((typeof value === "string" || typeof value === "number") && valid(String(value))) parameters.push({ name, value: String(value) });
  };
  add("color", args.color, value => /^#[\da-f]{6}$/i.test(value));
  for (const name of ["strength", "count", "width", "height", "duration", "fps"]) {
    add(name, args[name], value => /^\d{1,5}(?:\.\d{1,2})?$/.test(value) && Number(value) <= 16384);
  }
  const imageCanvas = canvas && CANVAS_IMAGE_TOOLS.has(tool);
  const canvasEdit = imageCanvas && ["recolor_product", "retouch_product", "replicate_hot"].includes(tool);
  add("ratio", canvasEdit ? canvas.ratio : args.ratio ?? (imageCanvas ? canvas.ratio : undefined), value => /^\d{1,3}:\d{1,3}$/.test(value));
  add("resolution", canvasEdit ? canvas.resolution : args.resolution ?? (imageCanvas ? canvas.resolution : undefined), value => /^(?:1K|2K|4K|720p|1080p|2160p)$/.test(value));
  add("quality", canvasEdit ? canvas.quality : args.quality ?? (imageCanvas ? canvas.quality : undefined), value => /^(?:low|medium|high|xhigh|max)$/.test(value));
  add("output_format", args.output_format, value => /^(?:png|jpeg|webp|mp4|webm)$/.test(value));
  add("background", args.background, value => /^(?:transparent|opaque)$/.test(value));
  add("model", args.model, value => /^[\w.:-]{1,100}$/.test(value));
  add("degree", args.degree, value => /^(?:high|style)$/.test(value));
  if(Array.isArray(args.input_roles))add("input_roles",args.input_roles.join(","),value=>/^(?:edit-target|reference|insert|style)(?:,(?:edit-target|reference|insert|style))*$/.test(value));
  // These Canvas edits always use the server-resolved reference set, not the model's URL argument.
  const canvasRefs = canvasEdit && canvas.imageUrls.length > 0;
  const refs = canvasRefs ? canvas.imageUrls : Array.isArray(args.image_urls) ? args.image_urls.filter(x => typeof x === "string") : tool === "generate_image" && imageCanvas ? canvas.imageUrls : typeof args.image_url === "string" ? [args.image_url] : [args.product_image_url,args.reference_image_url].filter(x=>typeof x==='string');
  const targetId = canvas?.anchorId && refs.includes(canvas.imageUrls[0]) ? canvas.anchorId : undefined;
  return { parameters, ...(targetId ? { targetId } : {}), ...(refs.length ? { inputCount: Math.min(refs.length, 32) } : {}) };
}

/** Defensive parsing also supports old history with no presentation metadata. */
export function readPublicToolDetails(input: unknown): PublicToolDetails | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const data = input as Record<string, unknown>;
  const entries = Array.isArray(data.parameters) ? data.parameters.slice(0, 16).flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const pair = value as Record<string, unknown>;
    return typeof pair.name === "string" && typeof pair.value === "string" ? [[pair.name, pair.value]] : [];
  }) : [];
  const details = publicToolDetails("", Object.fromEntries(entries));
  if (typeof data.targetId === "string" && /^[\w:.-]{1,160}$/.test(data.targetId)) details.targetId = data.targetId;
  if (typeof data.inputCount === "number" && Number.isInteger(data.inputCount) && data.inputCount > 0 && data.inputCount <= 32) details.inputCount = data.inputCount;
  return details;
}
