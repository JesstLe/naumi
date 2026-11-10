import { z } from "zod";

// Only file formats supported by the owned-media decoder are exposed. Raw PCM
// and event streams need a separate sample-rate/stream contract, not a guess.
export const SPEECH_FORMATS = ["mp3", "wav", "flac", "opus", "aac"] as const;
export const TRANSCRIPTION_MIME = ["audio/mpeg", "audio/wav", "audio/flac", "audio/ogg", "audio/aac", "audio/mp4", "video/mp4", "audio/webm", "video/webm"] as const;
const unique = <T,>(values: T[]) => new Set(values).size === values.length;
const namedVoice = z.string().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const audioDefinitionSchema = z.strictObject({
  speech: z.strictObject({
    enabled: z.boolean(),
    voices: z.array(namedVoice).max(100).refine(unique),
    formats: z.array(z.enum(SPEECH_FORMATS)).max(5).refine(unique),
    maxCharacters: z.number().int().min(1).max(1000000),
    maxOutputBytes: z.number().int().min(1).max(100 * 1024 * 1024),
    speed: z.strictObject({ min: z.number().min(0.25).max(4), max: z.number().min(0.25).max(4) }).refine(v => v.min <= v.max).optional(),
    instructions: z.boolean(),
  }).refine(v => !v.enabled || v.voices.length > 0 && v.formats.length > 0, "启用配音需要明确音色及格式").optional(),
  transcription: z.strictObject({
    enabled: z.boolean(),
    formats: z.array(z.enum(["json", "verbose_json"])).max(2).refine(unique),
    timestamps: z.array(z.enum(["segment", "word"])).max(2).refine(unique),
    inputFormats: z.array(z.enum(TRANSCRIPTION_MIME)).max(9).refine(unique),
    maxInputBytes: z.number().int().min(1).max(100 * 1024 * 1024),
    maxDurationSeconds: z.number().positive().max(7200),
    language: z.boolean(),
    prompt: z.boolean(),
  }).refine(v => !v.enabled || v.formats.length > 0 && v.inputFormats.length > 0, "启用转写需要明确输入及响应格式")
    .refine(v => !v.timestamps.length || v.formats.includes("verbose_json"), "时间戳需要 verbose_json").optional(),
});
export type AudioDefinition = z.infer<typeof audioDefinitionSchema>;
export type SpeechFormat = typeof SPEECH_FORMATS[number];
export const AUDIO_MIME: Record<SpeechFormat, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", opus: "audio/ogg", aac: "audio/aac",
};
