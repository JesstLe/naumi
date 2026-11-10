"use client";
import {useEffect,useState} from "react";
import type { AudioDefinition } from "@/lib/audio/model-capabilities";
import { SPEECH_FORMATS, TRANSCRIPTION_MIME } from "@/lib/audio/model-capabilities";
import { Chips, NumberField, Toggle, Field, inputClass } from "./fields";

export function AudioCapabilityEditor({ value = {}, generate, transcribe, onChange }: {
  value?: AudioDefinition; generate: boolean; transcribe: boolean;
  onChange: (value: AudioDefinition, generate: boolean, transcribe: boolean) => void;
}) {
  const speech = value.speech, transcription = value.transcription;
  const voices = speech?.voices.join(", ") || "";
  const [voiceDraft,setVoiceDraft]=useState(voices);
  useEffect(()=>{setVoiceDraft(old=>old.split(/[,，]/).map(x=>x.trim()).filter(Boolean).join(", ")===voices?old:voices);},[voices]);
  const setSpeech = (patch: Partial<NonNullable<AudioDefinition["speech"]>>) => onChange({ ...value,
    speech: { enabled: false, voices: [], formats: [], maxCharacters: 1, maxOutputBytes: 1, instructions: false, ...speech, ...patch },
  }, patch.enabled ?? generate, transcribe);
  const setTranscription = (patch: Partial<NonNullable<AudioDefinition["transcription"]>>) => onChange({ ...value,
    transcription: { enabled: false, formats: [], timestamps: [], inputFormats: [], maxInputBytes: 1, maxDurationSeconds: 1, language: false, prompt: false, ...transcription, ...patch },
  }, generate, patch.enabled ?? transcribe);
  const decimal = (label: string, number: number, change: (v: number) => void) => <Field label={label}><input className={inputClass} aria-label={label} type="number" step="0.01" value={number} onChange={e => change(Number(e.target.value))}/></Field>;
  return <div className="grid gap-6 lg:grid-cols-2">
    <fieldset className="space-y-4 rounded-lg border border-c-border p-4">
      <legend className="px-2 font-medium">配音</legend>
      <Toggle label="开放配音" value={generate && speech?.enabled === true} onChange={enabled => setSpeech({ enabled })}/>
      <Field label="音色 ID（逗号分隔）"><input className={inputClass} aria-label="音色 ID（逗号分隔）" value={voiceDraft} onChange={e=>{const v=e.target.value;setVoiceDraft(v);setSpeech({voices:[...new Set(v.split(/[,，]/).map(x=>x.trim()).filter(Boolean))]});}}/></Field>
      <Chips label="输出格式" values={SPEECH_FORMATS.map(value => ({ value, label: value }))} selected={speech?.formats || []} onChange={v => setSpeech({ formats: v as NonNullable<typeof speech>["formats"] })}/>
      <NumberField label="单次字符上限" min={1} max={1000000} value={speech?.maxCharacters || 1} onChange={maxCharacters => setSpeech({ maxCharacters })}/>
      <NumberField label="最大输出字节" min={1} max={104857600} value={speech?.maxOutputBytes || 1} onChange={maxOutputBytes => setSpeech({ maxOutputBytes })}/>
      <Toggle label="支持朗读指令" value={speech?.instructions === true} onChange={instructions => setSpeech({ instructions })}/>
      <Toggle label="支持语速参数" value={!!speech?.speed} onChange={enabled => setSpeech({ speed: enabled ? { min: 1, max: 1 } : undefined })}/>
      {speech?.speed && <div className="grid grid-cols-2 gap-3">
        {decimal("最低语速", speech.speed.min, min => setSpeech({ speed: { min, max: speech.speed!.max } }))}
        {decimal("最高语速", speech.speed.max, max => setSpeech({ speed: { min: speech.speed!.min, max } }))}
      </div>}
    </fieldset>
    <fieldset className="space-y-4 rounded-lg border border-c-border p-4">
      <legend className="px-2 font-medium">转写</legend>
      <Toggle label="开放转写" value={transcribe && transcription?.enabled === true} onChange={enabled => setTranscription({ enabled })}/>
      <Chips label="输入格式" values={TRANSCRIPTION_MIME.map(value=>({value,label:value}))} selected={transcription?.inputFormats||[]} onChange={v=>setTranscription({inputFormats:v as NonNullable<typeof transcription>["inputFormats"]})}/>
      <Chips label="响应格式" values={["json", "verbose_json"].map(value => ({ value, label: value }))} selected={transcription?.formats || []} onChange={v => setTranscription({ formats: v as NonNullable<typeof transcription>["formats"] })}/>
      <Chips label="实际时间戳能力" values={[{ value: "segment", label: "分句" }, { value: "word", label: "逐词" }]} selected={transcription?.timestamps || []} onChange={v => setTranscription({ timestamps: v as NonNullable<typeof transcription>["timestamps"] })}/>
      <NumberField label="最大输入字节" min={1} max={104857600} value={transcription?.maxInputBytes || 1} onChange={maxInputBytes => setTranscription({ maxInputBytes })}/>
      {decimal("最大输入秒数", transcription?.maxDurationSeconds || 1, maxDurationSeconds => setTranscription({ maxDurationSeconds }))}
      <Toggle label="支持指定语言" value={transcription?.language === true} onChange={language => setTranscription({ language })}/>
      <Toggle label="支持转写提示词" value={transcription?.prompt === true} onChange={prompt => setTranscription({ prompt })}/>
    </fieldset>
  </div>;
}
