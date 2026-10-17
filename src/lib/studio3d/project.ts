import { z } from "zod";

export const TEMPLATES = [
  {
    id: "bottle",
    name: "精华滴管瓶",
    description: "瓶身 · 瓶盖 · 滴管",
    width: 44,
    height: 128,
    depth: 44,
    color: "#708576",
  },
  {
    id: "jar",
    name: "护肤膏霜罐",
    description: "罐身 · 旋盖",
    width: 76,
    height: 58,
    depth: 76,
    color: "#dfd6c5",
  },
  {
    id: "box",
    name: "产品包装盒",
    description: "盒体 · 正面贴图",
    width: 64,
    height: 145,
    depth: 42,
    color: "#e7ddd0",
  },
] as const;
export const MATERIALS = {
  matte: "哑光",
  glossy: "亮面",
  glass: "玻璃",
  metal: "金属",
} as const;
export const LIGHTS = {
  soft: "柔光棚拍",
  bright: "白底电商",
  dramatic: "侧光质感",
} as const;
export const VIEWS = {
  hero: "45°",
  front: "正面",
  side: "侧面",
  back: "背面",
  top: "俯视",
} as const;
export const MAX_MODEL_BYTES = 20 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 38 * 1024 * 1024;
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const imageData = z
  .string()
  .max(6 * 1024 * 1024)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
const vector = z.tuple([
  z.number().finite().min(-1000).max(1000),
  z.number().finite().min(-1000).max(1000),
  z.number().finite().min(-1000).max(1000),
]);
export const projectSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    updatedAt: z.string().datetime(),
    template: z.enum(["bottle", "jar", "box", "imported", "photo-lathe"]),
    photo: z
      .object({
        image: imageData,
        profile: z
          .array(
            z
              .object({
                y: z.number().min(0).max(1),
                radius: z.number().min(0.005).max(0.5),
                center: z.number().min(0.15).max(0.85),
              })
              .strict(),
          )
          .min(32)
          .max(256),
        sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
        crop: z
          .object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            width: z.number().positive().max(1),
            height: z.number().positive().max(1),
          })
          .strict(),
        width: z.number().int().min(32).max(640),
        height: z.number().int().min(64).max(1280),
        textureMode: z.enum(["photo", "clay"]),
        scaleSource: z.enum(["assumed", "user"]),
        assumption: z.literal("axisymmetric"),
        workerMs: z.number().finite().nonnegative().max(15000),
      })
      .strict()
      .optional(),
    width: z.number().min(15).max(250),
    height: z.number().min(20).max(350),
    depth: z.number().min(10).max(250),
    material: z.enum(["matte", "glossy", "glass", "metal"]),
    color,
    capColor: color,
    roughness: z.number().min(0.02).max(1),
    rotation: z.number().min(-180).max(180),
    label: imageData.nullable(),
    labelScale: z.number().min(0.2).max(1),
    labelY: z.number().min(0.2).max(0.65),
    model: z
      .string()
      .max(28 * 1024 * 1024)
      .regex(/^[A-Za-z0-9+/=]+$/)
      .nullable(),
    modelName: z.string().max(120),
    light: z.enum(["soft", "bright", "dramatic"]),
    exposure: z.number().min(0.3).max(2),
    background: color,
    view: z.enum(["hero", "front", "side", "back", "top"]),
    camera: z.object({ position: vector, target: vector }).nullable(),
    output: z.enum(["square", "portrait", "landscape"]),
    size: z.union([z.literal(1024), z.literal(2048), z.literal(4096)]),
    transparent: z.boolean(),
    cover: imageData.nullable(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      (p.template === "photo-lathe") !== !!p.photo ||
      (p.version === 2) !== !!p.photo
    )
      ctx.addIssue({ code: "custom", message: "照片工程版本或轮廓不匹配" });
    if (p.photo) {
      const { profile, crop } = p.photo;
      if (
        profile[0].y !== 0 ||
        profile.at(-1)!.y !== 1 ||
        profile.some((q, i) => i > 0 && q.y <= profile[i - 1].y) ||
        crop.x + crop.width > 1.001 ||
        crop.y + crop.height > 1.001
      )
        ctx.addIssue({ code: "custom", message: "照片轮廓或选区无效" });
    }
    if ((p.template === "imported") !== !!p.model)
      ctx.addIssue({ code: "custom", message: "模型与工程类型不匹配" });
    if (
      p.camera &&
      Math.hypot(...p.camera.position.map((v, i) => v - p.camera!.target[i])) <
        0.1
    )
      ctx.addIssue({ code: "custom", message: "相机位置无效" });
  });
export type StudioProject = z.infer<typeof projectSchema>;
export function newProject(
  template: (typeof TEMPLATES)[number]["id"],
): StudioProject {
  const item = TEMPLATES.find((t) => t.id === template)!;
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: item.name,
    updatedAt: new Date().toISOString(),
    template,
    width: item.width,
    height: item.height,
    depth: item.depth,
    material: "matte",
    color: item.color,
    capColor: "#343d38",
    roughness: 0.45,
    rotation: 0,
    label: null,
    labelScale: 0.7,
    labelY: 0.42,
    model: null,
    modelName: "",
    light: "soft",
    exposure: 1,
    background: "#f0eeea",
    view: "hero",
    camera: null,
    output: "square",
    size: 2048,
    transparent: false,
    cover: null,
  };
}
export function outputDimensions(p: Pick<StudioProject, "size" | "output">) {
  return p.output === "portrait"
    ? [(p.size * 3) / 4, p.size]
    : p.output === "landscape"
      ? [p.size, (p.size * 3) / 4]
      : [p.size, p.size];
}
export function parseProject(text: string): StudioProject {
  if (new TextEncoder().encode(text).length > MAX_PROJECT_BYTES)
    throw Error("工程文件超过 38MB");
  return projectSchema.parse(JSON.parse(text));
}
export function binaryToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export function base64ToBinary(data: string) {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  return bytes.buffer;
}

/** Local GLB only: validate before GLTFLoader sees any resource URI. No remote textures/decoders. */
export function validateGlb(buffer: ArrayBuffer) {
  if (buffer.byteLength < 20 || buffer.byteLength > MAX_MODEL_BYTES)
    throw Error("请选择 20MB 以内的 GLB 模型");
  const data = new DataView(buffer);
  if (
    data.getUint32(0, true) !== 0x46546c67 ||
    data.getUint32(4, true) !== 2 ||
    data.getUint32(8, true) !== buffer.byteLength ||
    data.getUint32(16, true) !== 0x4e4f534a
  )
    throw Error("GLB 文件格式无效");
  const length = data.getUint32(12, true);
  if (length > buffer.byteLength - 20) throw Error("GLB 文件不完整");
  const doc = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, length)),
  );
  if (doc.asset?.version !== "2.0") throw Error("请选择 glTF 2.0 模型");
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "uri")
        throw Error("请将贴图和资源嵌入 GLB，不使用外部资源引用");
      if (
        key === "extensions" &&
        child &&
        typeof child === "object" &&
        Object.keys(child).some((k) => /draco|meshopt|basisu/i.test(k))
      )
        throw Error("请导出未压缩的 GLB 模型");
      walk(child);
    }
  };
  walk(doc);
  if (
    (doc.meshes?.length || 0) > 256 ||
    (doc.materials?.length || 0) > 256 ||
    (doc.images?.length || 0) > 32
  )
    throw Error("模型部件或贴图数量过多，请简化后导入");
  let vertices = 0;
  for (const mesh of doc.meshes || [])
    for (const primitive of mesh.primitives || [])
      vertices += doc.accessors?.[primitive.attributes?.POSITION]?.count || 0;
  if (!vertices || vertices > 500_000 || (doc.nodes?.length || 0) > 2000)
    throw Error("模型需包含网格，且顶点不超过 50 万、节点不超过 2000");
  for (const accessor of doc.accessors || [])
    if (
      !Number.isSafeInteger(accessor.count) ||
      accessor.count < 0 ||
      accessor.count > 2_000_000
    )
      throw Error("模型数据超出限制");
  return { vertices, nodes: doc.nodes?.length || 0 };
}

export async function normalizeLabel(file: File): Promise<string> {
  if (
    file.size > 12 * 1024 * 1024 ||
    !/^image\/(png|jpeg|webp)$/.test(file.type)
  )
    throw Error("请选择 12MB 以内的 PNG、JPG 或 WebP 贴图");
  const image = await createImageBitmap(file);
  try {
    if (
      !image.width ||
      !image.height ||
      image.width * image.height > 40_000_000
    )
      throw Error("贴图尺寸过大");
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/png");
    if (result.length > 6 * 1024 * 1024)
      throw Error("贴图数据过大，请降低图片尺寸");
    return result;
  } finally {
    image.close();
  }
}
