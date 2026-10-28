import {remapVideoPromptReferences} from "../video/prompt-references";
import {numberVideoInputs, type OrderedInput} from "../video/references";

export type CharacterReferenceExpansion = {
  inputId: string;
  text: string;
  frozenNodeId?: string;
  images: Array<{inputId: string; artworkId: string; value: string}>;
};

/** Shared expansion and numbering. Callers supply either public UI choices or
 * trusted server records; only the server supplies immutable revision identities. */
export function expandCharacterReferences(inputs: readonly OrderedInput[], prompt: string, definitions: readonly CharacterReferenceExpansion[]) {
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
    const legend = definition.images.length ? `角色参考：${definition.images.map(image => `图片${imageNumbers.get(image.inputId)}`).join("、")}` : "";
    return {...input, nodeId: definition.frozenNodeId ?? input.nodeId, value: [input.value, legend].filter(Boolean).join("\n")};
  })};
}
