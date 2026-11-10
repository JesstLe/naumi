export const MODEL_BINDINGS = {
  "image.generate": { modality: "image", capability: "generate" },
  "image.edit": { modality: "image", capability: "edit" },
  "image.cutout": { modality: "image", capability: "transparent" },
  "agent.text": { modality: "text", capability: "generate" },
  "agent.vision": { modality: "text", capability: "vision" },
  "text.generate": { modality: "text", capability: "generate" },
  "text.title": { modality: "text", capability: "generate" },
  "text.competitor": { modality: "text", capability: "generate" },
  "vision.reference": { modality: "text", capability: "vision" },
  "vision.review": { modality: "text", capability: "vision" },
  "vision.ocr": { modality: "text", capability: "vision" },
  "audio.speech": { modality: "audio", capability: "generate" },
  "audio.transcribe": { modality: "audio", capability: "transcribe" },
  "video.generate": { modality: "video", capability: "generate" },
} as const;
export type ModelBinding = keyof typeof MODEL_BINDINGS;
