"use client";

import { forwardRef, useId, useImperativeHandle, useRef, useState } from "react";
import { Film, Music2, Type, Image, UserRound, Mountain } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import { displayVideoPrompt, serializeVideoPrompt } from "@/lib/video/prompt-references";
import type { OrderedInput } from "@/lib/video/references";
import type { VideoInputChoice } from "@/lib/video/client-settings";
import { useVideoI18n } from "./i18n";

export type VideoPromptEditorHandle = { openMentions: () => void; insert: (choice: VideoInputChoice) => void };

/** Named @ references are a UI projection; persisted prompts keep the existing compiler format. */
export const VideoPromptEditor = forwardRef<VideoPromptEditorHandle, {
  prompt: string; inputs: OrderedInput[]; choices: VideoInputChoice[]; nodeId?: string;
  onPrompt: (value: string) => void;
  onMention: (choice: VideoInputChoice, start: number, end: number) => number | undefined;
  readOnly?: boolean; rows?: number; className?: string;
}>(function VideoPromptEditor({ prompt, inputs, choices, nodeId, onPrompt, onMention, readOnly = false, rows = 4, className }, ref) {
  const V = useVideoI18n(), id = useId(), textarea = useRef<HTMLTextAreaElement>(null), composing = useRef(false);
  const value = displayVideoPrompt(prompt, inputs, choices);
  const caret = useRef({ start: value.length, end: value.length });
  const [query, setQuery] = useState<{ text: string; start: number; end: number } | null>(null), [active, setActive] = useState(0);
  const options = choices.filter(choice => choice.nodeId !== nodeId && (!query?.text || choice.title.toLowerCase().includes(query.text.toLowerCase())));
  const available = options.filter(choice => choice.available), selected = available[Math.min(active, available.length - 1)];
  function track(next: string, start: number, end: number) {
    caret.current = { start, end };
    const match = start === end && !composing.current ? next.slice(0, start).match(/@([^\s@【】]*)$/) : null;
    const text = match?.[1];
    if (text !== query?.text) setActive(0);
    setQuery(match ? { text: text!, start: start - match[0].length, end } : null);
  }
  function insert(choice: VideoInputChoice) {
    if (readOnly || !choice.available) return;
    const position = onMention(choice, query?.start ?? caret.current.start, query?.end ?? caret.current.end);
    setQuery(null);
    if (position === undefined) return;
    caret.current = { start: position, end: position };
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(position, position); });
  }
  useImperativeHandle(ref, () => ({
    insert,
    openMentions() {
      if (readOnly) return;
      const { start, end } = caret.current, next = value.slice(0, start) + "@" + value.slice(end);
      onPrompt(serializeVideoPrompt(next, inputs, choices));
      caret.current = { start: start + 1, end: start + 1 }; setActive(0); setQuery({ text: "", start, end: start + 1 });
      requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start + 1, start + 1); });
    },
  }));
  return <div className="min-w-0 flex-1" data-testid="video-prompt-editor">
    <textarea ref={textarea} data-testid="video-composer-prompt" aria-label={V("视频描述")} value={value} readOnly={readOnly} rows={rows}
      placeholder={readOnly ? "" : V("描述你想生成的视频…")} aria-autocomplete="list"
      aria-controls={query ? id : undefined} aria-activedescendant={query && selected ? `${id}-${options.indexOf(selected)}` : undefined}
      className={className ?? "canvas-ui-text block w-full resize-none border-0 bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-[var(--canvas-ui-muted)]"}
      onCompositionStart={() => { composing.current = true; setQuery(null); }}
      onCompositionEnd={event => { composing.current = false; track(event.currentTarget.value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd); }}
      onChange={event => { onPrompt(serializeVideoPrompt(event.target.value, inputs, choices)); if (!(event.nativeEvent as InputEvent).isComposing) track(event.target.value, event.target.selectionStart, event.target.selectionEnd); }}
      onSelect={event => { const target = event.currentTarget; if (target.selectionStart !== caret.current.start || target.selectionEnd !== caret.current.end) track(target.value, target.selectionStart, target.selectionEnd); }}
      onBlur={() => setQuery(null)} onKeyDown={event => {
        if (!query || event.nativeEvent.isComposing) return;
        if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); }
        if (event.key === "Escape") setQuery(null);
        else if (event.key === "ArrowDown") setActive(index => available.length ? (index + 1) % available.length : 0);
        else if (event.key === "ArrowUp") setActive(index => available.length ? (index + available.length - 1) % available.length : 0);
        else if (event.key === "Enter" && selected) insert(selected);
      }}/>
    {query && !readOnly && <div id={id} role="listbox" aria-label={V("选择引用素材")} className="canvas-ui-control mb-2 max-h-40 overflow-y-auto rounded-lg border p-1 shadow-sm">
      {options.map((choice, index) => { const Icon = choice.category === "scene" ? Mountain : choice.category === "character" ? UserRound : choice.kind === "image" ? Image : choice.kind === "video" ? Film : choice.kind === "audio" ? Music2 : Type;
        return <button key={choice.id} id={`${id}-${index}`} type="button" role="option" aria-selected={choice === selected} disabled={!choice.available}
          onMouseDown={event => event.preventDefault()} onClick={() => insert(choice)}
          className={`canvas-ui-action flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs disabled:opacity-40 ${choice === selected ? "bg-indigo-500/10" : ""}`}>
          {choice.thumbnail ? <CachedImage src={choice.thumbnail} alt="" className="h-7 w-7 shrink-0 rounded object-cover"/> : <Icon className="h-4 w-4 shrink-0"/>}
          <span className="min-w-0 flex-1 truncate">{choice.title}</span>{!choice.available && <span className="canvas-ui-muted">{V("尚未完成")}</span>}
        </button>;
      })}
      {!options.length && <span className="canvas-ui-muted block p-2 text-xs">{V("没有匹配的素材")}</span>}
    </div>}
  </div>;
});
