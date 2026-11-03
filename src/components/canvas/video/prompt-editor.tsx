"use client";

import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Film, Music2, Type, Image, UserRound, Mountain } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import { ReferenceMentionPanel } from "../reference-mention-panel";
import { videoPromptReferenceTokens, videoPromptDisplayOffset, videoPromptRawOffset } from "@/lib/video/prompt-references";
import type { OrderedInput } from "@/lib/video/references";
import type { VideoInputChoice } from "@/lib/video/client-settings";
import { useVideoI18n } from "./i18n";
import { InlineReferenceEditor, type InlineReferenceEditorHandle } from "../inline-reference-editor";
import type { InlineReferenceToken } from "../inline-reference-dom";

export type VideoPromptEditorHandle = { openMentions: () => void; insert: (choice: VideoInputChoice) => void };
const referenceKey = (input: OrderedInput) => `video:${JSON.stringify([input.id, input.nodeId, input.kind])}`;

/** Named @ references are a UI projection; persisted prompts keep the existing compiler format. */
export const VideoPromptEditor = forwardRef<VideoPromptEditorHandle, {
  prompt: string; inputs: OrderedInput[]; choices: VideoInputChoice[]; nodeId?: string;
  onPrompt: (value: string) => void;
  onMention: (choice: VideoInputChoice, start: number, end: number) => number | undefined;
  readOnly?: boolean; rows?: number; className?: string;
}>(function VideoPromptEditor({ prompt, inputs, choices, nodeId, onPrompt, onMention, readOnly = false, rows = 4, className }, ref) {
  const V = useVideoI18n(), id = useId(), editor = useRef<InlineReferenceEditorHandle>(null), editorElement = useRef<HTMLDivElement>(null);
  const value = prompt;
  const pendingDisplayCaret = useRef<number | null>(null);
  const caret = useRef({ start: value.length, end: value.length });
  const [query, setQuery] = useState<{ text: string; start: number; end: number } | null>(null), [active, setActive] = useState(0);
  const options = choices.filter(choice => choice.nodeId !== nodeId && (!query?.text || choice.title.toLowerCase().includes(query.text.toLowerCase())));
  const available = options.filter(choice => choice.available), selected = available[Math.min(active, available.length - 1)];
  function track(next: string, start: number, end: number, composing: boolean) {
    caret.current = { start, end };
    const match = start === end && !composing ? next.slice(0, start).match(/@([^\s@【】]*)$/) : null;
    const text = match?.[1];
    if (text !== query?.text) setActive(0);
    const nextQuery = match ? { text: text!, start: start - match[0].length, end } : null;
    setQuery(old => old?.text === nextQuery?.text && old?.start === nextQuery?.start && old?.end === nextQuery?.end ? old : nextQuery);
  }
  function insert(choice: VideoInputChoice) {
    if (readOnly || !choice.available) return;
    const position = onMention(choice,
      videoPromptDisplayOffset(prompt, inputs, choices, query?.start ?? caret.current.start),
      videoPromptDisplayOffset(prompt, inputs, choices, query?.end ?? caret.current.end));
    setQuery(null);
    if (position === undefined) return;
    pendingDisplayCaret.current = position;
  }
  useLayoutEffect(() => {
    if (pendingDisplayCaret.current === null) return;
    const position = videoPromptRawOffset(prompt, inputs, choices, pendingDisplayCaret.current);
    pendingDisplayCaret.current = null; caret.current = { start: position, end: position }; editor.current?.select(position);
  }, [prompt, inputs, choices]);
  useImperativeHandle(ref, () => ({
    insert,
    openMentions() {
      if (readOnly) return;
      editor.current?.replace("@");

    },
  }));
  function tokens(text: string): InlineReferenceToken[] {
    return videoPromptReferenceTokens(text, inputs, choices).map(mention => {
      const input = mention.input, choice = input && choices.find(item => item.nodeId === input.nodeId);
      return { start: mention.start, end: mention.end, raw: mention.raw, key: input ? referenceKey(input) : `missing:${mention.raw}`,
        title: input ? mention.title : V("失效引用"), thumbnail: choice?.thumbnail,
        missing: !input, detail: input ? V(input.kind === "image" ? "图片" : input.kind === "video" ? "视频" : input.kind === "audio" ? "音频" : "文字") : undefined };
    });
  }
  function pastedToken(key: string) {
    let input = inputs.find(item => referenceKey(item) === key);
    if (!input && key.startsWith("video:")) {
      try {
        const identity: unknown = JSON.parse(key.slice(6));
        if (Array.isArray(identity) && identity.length === 3 && identity.every(item => typeof item === "string")) {
          // A different editor may own a different input ID, but a repeated
          // source with multiple roles/slots must never resolve to its first row.
          const candidates = inputs.filter(item => item.nodeId === identity[1] && item.kind === identity[2]);
          if (candidates.length === 1) input = candidates[0];
        }
      } catch { /* Unrecognized references remain explicitly invalid. */ }
    }
    return input ? `{{ref ${inputs.indexOf(input) + 1}}}` : "{{ref 0}}";
  }
  return <div className="min-w-0 flex-1" data-testid="video-prompt-editor">
    <InlineReferenceEditor key={nodeId} ref={editor} domRef={editorElement} testId="video-composer-prompt" ariaLabel={V("视频描述")} value={value}
      onChange={onPrompt} tokens={tokens}
      resolvePastedKey={pastedToken}
      readOnly={readOnly} placeholder={V("描述你想生成的视频…")}
      menuId={query ? id : undefined} activeOption={query && selected ? `${id}-${options.indexOf(selected)}` : undefined}
      className={className ?? `canvas-ui-text block w-full min-h-[100px] border-0 bg-transparent py-1 text-sm leading-7`}
      onSelection={(next, selection, composing) => track(next, selection.start, selection.end, composing)}
      onBlur={() => setQuery(null)} onKeyDown={event => {
        if (!query || event.nativeEvent.isComposing) return;
        if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); }
        if (event.key === "Escape") setQuery(null);
        else if (event.key === "ArrowDown") setActive(index => available.length ? (index + 1) % available.length : 0);
        else if (event.key === "ArrowUp") setActive(index => available.length ? (index + available.length - 1) % available.length : 0);
        else if (event.key === "Enter" && selected) insert(selected);
      }}/>
    {query && !readOnly && <ReferenceMentionPanel id={id} label={V("选择引用素材")} editorRef={editorElement} optionCount={options.length} revision={`${query.text}:${query.end}`} activeOption={selected ? `${id}-${options.indexOf(selected)}` : undefined} onClose={() => setQuery(null)}>
      {options.map((choice, index) => { const Icon = choice.category === "scene" ? Mountain : choice.category === "character" ? UserRound : choice.kind === "image" ? Image : choice.kind === "video" ? Film : choice.kind === "audio" ? Music2 : Type;
        return <button key={choice.id} id={`${id}-${index}`} type="button" role="option" aria-selected={choice === selected} disabled={!choice.available}
          onMouseDown={event => event.preventDefault()} onClick={() => insert(choice)}
          title={choice.title} style={{ minHeight: 66 }} className={`canvas-ui-action flex min-w-0 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs disabled:opacity-40 ${choice === selected ? "bg-indigo-500/10 ring-1 ring-inset ring-indigo-300" : "hover:bg-slate-500/5"}`}>
          {choice.thumbnail ? <CachedImage src={choice.thumbnail} reuseActivePreview alt="" className="h-10 w-10 shrink-0 rounded-md object-cover"/> : <Icon className="h-7 w-7 shrink-0"/>}
          <span className="min-w-0 flex-1 truncate">{choice.title}</span>{!choice.available && <span className="canvas-ui-muted">{V("尚未完成")}</span>}
        </button>;
      })}
      {!options.length && <span className="canvas-ui-muted col-span-full block p-2 text-xs">{V("没有匹配的素材")}</span>}
    </ReferenceMentionPanel>}
  </div>;
});
