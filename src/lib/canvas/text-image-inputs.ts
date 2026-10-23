export type TextImageMode = "general" | "pure" | "replicate";

export type TextImageSource = {
  id: string;
  projectKey: string;
  title?: string;
  content: string;
  prompt?: string;
  sourceIds?: readonly string[];
  productIds?: readonly string[];
  status?: string;
};

export type TextImageRequest = {
  anchorTextId: string;
  textNodeIds: string[];
  imageIds: string[];
  prompt: string;
};

export type TextImageInputErrorCode =
  | "EMPTY_TEXT"
  | "TEXT_BUSY"
  | "MISSING_PRODUCT"
  | "MISSING_REFERENCE"
  | "TOO_MANY_IMAGES"
  | "PROMPT_TOO_LONG";

/** Keep UI messages separate from the stable, typed input failure code. */
export class TextImageInputError extends Error {
  readonly code: TextImageInputErrorCode;

  constructor(code: TextImageInputErrorCode, message: string) {
    super(message);
    this.name = "TextImageInputError";
    this.code = code;
  }
}

const MAX_PROMPT_LENGTH = 6_000;

// Keep the legacy product modes byte-for-byte compatible with canvas-client.
const REPLICATE_GUARD =
  "\n产品必须完全取自第一张参考图（产品白底图），包装、品牌、文字保持不变；其余参考图仅作构图与风格参考，严禁照搬其中的竞品标识、品牌名与文案。";

function stripMentionLines(content: string): string {
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim().startsWith("@")) i++;
  return lines.slice(i).join("\n").trim();
}

function textBody(node: TextImageSource, drafts?: Readonly<Record<string, string>>): string {
  // A completed output is authoritative; drafts describe input, not output.
  return node.content.trim() || drafts?.[node.id]?.trim() || node.prompt?.trim() || "";
}

function legacyTextBody(node: TextImageSource, drafts?: Readonly<Record<string, string>>): string {
  // Strip each raw candidate before checking fallback: pre-trimming changes
  // the old rule when a blank first line precedes an @ line.
  return stripMentionLines(node.content)
    || stripMentionLines(drafts?.[node.id] ?? "")
    || stripMentionLines(node.prompt ?? "");
}

function assertTextReady(node: TextImageSource): void {
  if (node.status === "generating") {
    throw new TextImageInputError("TEXT_BUSY", "文字节点仍在生成，请完成后再生成图片");
  }
}

/**
 * imageIds is the caller's current-project, usable-image allowlist; nodes is
 * the text-node collection. Known foreign texts and unresolved text-* links
 * are ignored; other unavailable source images fail when references are on.
 * Explicit texts stay first, in selection order; upstream texts follow in
 * stable breadth-first order. Each request deduplicates IDs, never text bodies.
 * This helper only plans requests and does not mutate any caller-owned data.
 */
export function buildTextImageRequests(input: {
  projectKey: string;
  nodes: readonly TextImageSource[];
  textNodeIds: readonly string[];
  imageIds: readonly string[];
  selectedImageIds?: readonly string[];
  mode: TextImageMode;
  combine?: boolean;
  useReferences?: boolean;
  drafts?: Readonly<Record<string, string>>;
  maxImages?: number;
}): TextImageRequest[] {
  const byId = new Map<string, TextImageSource>();
  const knownTextIds = new Set(input.nodes.map(node => node.id));
  for (const node of input.nodes) {
    if (node.projectKey === input.projectKey && !byId.has(node.id)) byId.set(node.id, node);
  }
  const targets: TextImageSource[] = [];
  const selectedTextIds = new Set<string>();
  for (const id of input.textNodeIds) {
    const node = byId.get(id);
    if (!node || selectedTextIds.has(id)) continue;
    selectedTextIds.add(id);
    targets.push(node);
  }
  if (!targets.length) return [];

  const availableImages = new Set(input.imageIds);
  const selectedImages = [...new Set(input.selectedImageIds ?? [])];
  const referencesEnabled = input.mode !== "general" || input.useReferences !== false;
  const configuredMax = input.maxImages ?? 16;
  const maxImages = Number.isFinite(configuredMax) ? Math.max(0, Math.floor(configuredMax)) : 16;

  function assertReference(id: string): void {
    if (!availableImages.has(id)) {
      throw new TextImageInputError("MISSING_REFERENCE", "已选择或绑定的参考图片已失效，请重新选择");
    }
  }

  // General text-only generation deliberately ignores stale image bindings
  // and selections; product modes always retain their required product image.
  if (referencesEnabled) for (const id of selectedImages) assertReference(id);
  for (const node of targets) assertTextReady(node);

  function request(anchorTextId: string, texts: TextImageSource[], images: string[], prompt: string): TextImageRequest {
    if (!prompt) throw new TextImageInputError("EMPTY_TEXT", "请先填写用于生成图片的文字");
    if (images.length > maxImages) {
      throw new TextImageInputError("TOO_MANY_IMAGES", `一次最多使用${maxImages}张参考图片，请移除多余图片`);
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new TextImageInputError("PROMPT_TOO_LONG", "用于生成图片的文字不能超过6000字");
    }
    return { anchorTextId, textNodeIds: texts.map(node => node.id), imageIds: images, prompt };
  }

  if (input.mode !== "general") {
    return targets.map(node => {
      const productId = node.productIds?.[0];
      if (!productId || !availableImages.has(productId)) {
        throw new TextImageInputError("MISSING_PRODUCT", "请先绑定有效的产品图片");
      }
      for (const id of node.productIds ?? []) assertReference(id);
      const body = legacyTextBody(node, input.drafts);
      if (!body) throw new TextImageInputError("EMPTY_TEXT", "请先填写用于生成图片的文字");
      // Legacy modes intentionally ignore combine/useReferences and do not
      // consume upstream texts, other products, or extra selected images.
      const images = [productId];
      if (input.mode === "replicate") {
        const seen = new Set(images);
        for (const id of node.sourceIds ?? []) {
          if (!availableImages.has(id) || seen.has(id)) continue;
          seen.add(id);
          images.push(id);
        }
      }
      return request(node.id, [node], images, input.mode === "replicate" ? body + REPLICATE_GUARD : body);
    });
  }

  function collectTexts(roots: TextImageSource[]): TextImageSource[] {
    const texts = [...roots];
    const seenTexts = new Set(roots.map(node => node.id));

    // A growing queue avoids recursion depth limits and preserves all selected
    // roots before upstream nodes, including when a selected root is a source.
    for (let index = 0; index < texts.length; index++) {
      const node = texts[index];
      assertTextReady(node);
      for (const id of node.sourceIds ?? []) {
        const upstream = byId.get(id);
        if (availableImages.has(id) || !upstream || seenTexts.has(id)) continue;
        seenTexts.add(id);
        texts.push(upstream);
      }
    }
    return texts;
  }

  // Resolve all selected/dependency busy states before validating any prompt,
  // so a separate empty root cannot hide an in-flight dependency in the batch.
  const allTexts = collectTexts(targets);

  function generalRequest(roots: TextImageSource[], texts: TextImageSource[]): TextImageRequest {
    const images: string[] = [];
    const seenImages = new Set<string>();
    function addImage(id: string): void {
      if (seenImages.has(id)) return;
      seenImages.add(id);
      images.push(id);
    }

    if (referencesEnabled) {
      for (const node of texts) {
        for (const id of node.sourceIds ?? []) {
          if (availableImages.has(id)) addImage(id);
          else if (!knownTextIds.has(id) && !id.startsWith("text-")) assertReference(id);
        }
        for (const id of node.productIds ?? []) {
          assertReference(id);
          addImage(id);
        }
      }
      for (const id of selectedImages) addImage(id);
    }
    const prompt = texts.map(node => textBody(node, input.drafts)).filter(Boolean).join("\n\n");
    return request(roots[0].id, texts, images, prompt);
  }

  return input.combine
    ? [generalRequest(targets, allTexts)]
    : targets.map(node => generalRequest([node], collectTexts([node])));
}
