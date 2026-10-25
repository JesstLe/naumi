
export type ImageModelProvider =
  | "managed"
  | "openai-images"
  | "new-api-flow"
  | "user-openai-images"
  | "user-chat-completions";

export type ImageModelDescriptor = {
  creditHint?:string;
  id: string;
  label: string;
  supportsEdit: boolean;
  provider: ImageModelProvider;
  qualities?: string[];
  nativeResolutions?: string[];
  generationParameters?: { ratios?: string[]; resolutions?: string[]; combinations?: string[] };
  qualitySupported?: boolean;
};
