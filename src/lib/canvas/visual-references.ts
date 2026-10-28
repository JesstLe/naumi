import type {VideoInputChoice} from "../video/input-choice";
import {remapVideoPromptReferences} from "../video/prompt-references";
import {numberVideoInputs, type OrderedInput} from "../video/references";

export type VisualReferenceExpansion = {
  inputId: string;
  text: string;
  referenceLabel?: "角色参考" | "场景参考";
  frozenNodeId?: string;
  images: Array<{inputId: string; artworkId: string; value: string}>;
};

/** Shared expansion and numbering. Callers supply either public UI choices or
 * trusted server records; only the server supplies immutable revision identities. */
export function expandVisualReferences(inputs: readonly OrderedInput[], prompt: string, definitions: readonly VisualReferenceExpansion[]) {
  if (!definitions.length) return {inputs: [...inputs], prompt};
  const byInput = new Map(definitions.map(definition => [definition.inputId, definition]));
  const expanded = inputs.flatMap(input => {
    const definition = byInput.get(input.id);
    if (!definition) return [{...input}];
    return [{...input, value: definition.text}, ...definition.images.map(image => ({id: image.inputId, nodeId: image.artworkId, kind: "image" as const, role: "reference" as const, value: image.value}))];
  });
  const nextPrompt = remapVideoPromptReferences(prompt, inputs, expanded);
  const imageNumbers = new Map(numberVideoInputs(expanded).byKind.image.map(input => [input.id, input.kindIndex]));
  return {prompt: nextPrompt, inputs: expanded.map(input => {
    const definition = byInput.get(input.id);
    if (!definition) return input;
    const legend = definition.images.length ? `${definition.referenceLabel ?? "角色参考"}：${definition.images.map(image => `图片${imageNumbers.get(image.inputId)}`).join("、")}` : "";
    return {...input, nodeId: definition.frozenNodeId ?? input.nodeId, value: [input.value, legend].filter(Boolean).join("\n")};
  })};
}

/** Advisory preview only. The saved inputs remain live identities and the
 * server re-reads all definitions and media before accepting a task. */
export function previewVisualInputs(inputs: readonly OrderedInput[], prompt: string, choices: readonly VideoInputChoice[]) {
  const ids = new Set(inputs.map(input => input.id));
  const definitions = inputs.flatMap((input, index) => {
    const kind = input.nodeId.startsWith("character:") ? "character" : input.nodeId.startsWith("scene:") ? "scene" : null;
    if (!kind) return [];
    const choice = choices.find(item => item.nodeId === input.nodeId && item.category === kind);
    if (input.kind !== "text" || input.role !== "context" || !choice?.available || !choice.referenceArtworkIds) throw new Error(kind === "scene" ? "场景或状态素材已不可用" : "角色或外观素材已不可用");
    return [{inputId: input.id, text: choice.value, referenceLabel: kind === "scene" ? "场景参考" as const : "角色参考" as const, images: choice.referenceArtworkIds.map((artworkId, imageIndex) => {
      const image = choices.find(item => item.nodeId === artworkId && item.kind === "image" && item.available);
      if (!image) throw new Error(kind === "scene" ? "场景参考图片尚未完成或已不可用" : "角色参考图片尚未完成或已不可用");
      let id = `visual-preview-${index}-${imageIndex}`;
      while (ids.has(id)) id += "_";
      ids.add(id);
      return {inputId: id, artworkId, value: image.value};
    })}];
  });
  return expandVisualReferences(inputs, prompt, definitions);
}
