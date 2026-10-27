import { numberVideoInputs, type OrderedInput } from "./references";

type ReferenceName = { nodeId: string; title: string };
type Mention = { start: number; end: number; raw: string; input?: OrderedInput };
const kindLabels = { text: "参考文字", image: "图片", video: "视频", audio: "音频" };
const markerPattern = /\{\{\s*ref\s+(\d+)\s*\}\}|(图片|视频|音频)([1-9]\d*)/g;

function mentions(prompt: string, inputs: readonly OrderedInput[]): Mention[] {
  const numbered = numberVideoInputs(inputs);
  return Array.from(prompt.matchAll(markerPattern), match => {
    const input = match[1] !== undefined ? numbered.all[Number(match[1]) - 1]
      : numbered.byKind[({ 图片: "image", 视频: "video", 音频: "audio" } as const)[match[2] as "图片" | "视频" | "音频"]][Number(match[3]) - 1];
    return { start: match.index!, end: match.index! + match[0].length, raw: match[0], input };
  });
}

/** Positional wire labels follow input identity, never a different asset after a graph edit. */
export function remapVideoPromptReferences(prompt: string, before: readonly OrderedInput[], after: readonly OrderedInput[]): string {
  const numbered = numberVideoInputs(after);
  const next = new Map(numbered.all.map(input => [input.id, input]));
  let result = "", cursor = 0;
  for (const mention of mentions(prompt, before)) {
    const candidate = mention.input && next.get(mention.input.id);
    const target = candidate && candidate.nodeId === mention.input?.nodeId && candidate.kind === mention.input.kind ? candidate : undefined;
    // ref 0 is deliberately invalid in both current and older compilers. Never retarget a removed/missing source.
    const marker = !target ? "{{ref 0}}" : mention.raw.startsWith("{{") ? `{{ref ${target.index}}}` : `${kindLabels[target.kind]}${target.kindIndex}`;
    result += prompt.slice(cursor, mention.start) + (target && mention.input?.id === target.id &&
      (mention.raw.startsWith("{{") ? numbered.all.indexOf(target) === before.findIndex(input => input.id === target.id)
        : marker === mention.raw) ? mention.raw : marker);
    cursor = mention.end;
  }
  return result + prompt.slice(cursor);
}

export function videoReferenceNames(inputs: readonly OrderedInput[], choices: readonly ReferenceName[]): Map<string, string> {
  const used = new Set<string>(["失效引用"]), result = new Map<string, string>();
  for (const input of inputs) {
    const base = (choices.find(choice => choice.nodeId === input.nodeId)?.title || kindLabels[input.kind])
      .replace(/[【】\r\n]/g, " ").trim() || kindLabels[input.kind];
    let name = base, suffix = 2;
    while (used.has(name)) name = `${base} · ${suffix++}`;
    used.add(name); result.set(input.id, name);
  }
  return result;
}

function projection(prompt: string, inputs: readonly OrderedInput[], choices: readonly ReferenceName[]) {
  const names = videoReferenceNames(inputs, choices);
  let value = "", cursor = 0;
  const spans = mentions(prompt, inputs).map(mention => {
    value += prompt.slice(cursor, mention.start);
    const start = value.length, text = `@【${mention.input ? names.get(mention.input.id) : "失效引用"}】`;
    value += text; cursor = mention.end;
    return { ...mention, displayStart: start, displayEnd: value.length };
  });
  return { value: value + prompt.slice(cursor), spans };
}

export function displayVideoPrompt(prompt: string, inputs: readonly OrderedInput[], choices: readonly ReferenceName[]): string {
  return projection(prompt, inputs, choices).value;
}

/** UI-only names serialize back to the existing {{ref N}} format; provider payloads stay unchanged. */
export function serializeVideoPrompt(value: string, inputs: readonly OrderedInput[], choices: readonly ReferenceName[]): string {
  const names = videoReferenceNames(inputs, choices), markers = new Map<string, string>();
  inputs.forEach((input, index) => markers.set(names.get(input.id)!, `{{ref ${index + 1}}}`));
  return value.replace(/@【([^【】\r\n]+)】/g, (raw, name: string) => name === "失效引用" ? "{{ref 0}}" : markers.get(name) || raw);
}

export function insertVideoPromptReference(prompt: string, before: readonly OrderedInput[], after: readonly OrderedInput[], choices: readonly ReferenceName[], inputId: string, start: number, end: number) {
  const display = projection(prompt, before, choices);
  function rawOffset(offset: number, endBoundary: boolean) {
    let delta = 0;
    for (const span of display.spans) {
      if (offset <= span.displayStart) break;
      if (offset < span.displayEnd) return endBoundary ? span.end : span.start;
      delta += (span.end - span.start) - (span.displayEnd - span.displayStart);
    }
    return Math.max(0, Math.min(prompt.length, offset + delta));
  }
  const index = after.findIndex(input => input.id === inputId);
  if (index < 0) throw new Error("引用素材已移除，请重新选择");
  const left = remapVideoPromptReferences(prompt.slice(0, rawOffset(start, false)), before, after);
  const right = remapVideoPromptReferences(prompt.slice(rawOffset(end, true)), before, after);
  const marker = `{{ref ${index + 1}}}`, next = left + marker + right;
  const caret = displayVideoPrompt(left + marker, after, choices).length;
  return { prompt: next, caret };
}
