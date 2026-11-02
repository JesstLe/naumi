"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CachedImage } from "@/components/cached-image";
import { inlineText, readInlineSelection, renderInlineReferences, setInlineSelection, wholeInlineSelection, type InlineReferenceToken, type InlineSelection, type InlineThumbnailSlot } from "./inline-reference-dom";

const CLIPBOARD = "application/x-naumi-inline-references";
type Entry = { value: string; selection: InlineSelection };
export type InlineReferenceEditorHandle = {
  focus: () => void; select: (start: number, end?: number) => void;
  replace: (text: string, selection?: InlineSelection) => void;
  selection: () => InlineSelection;
};
type Props = {
  value: string; onChange: (value: string) => void; tokens: (value: string) => InlineReferenceToken[];
  resolvePastedKey: (key: string) => string; onReference?: (key: string) => void;
  onSelection?: (value: string, selection: InlineSelection, composing: boolean) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void; onBlur?: () => void;
  domRef?: RefObject<HTMLDivElement | null>; readOnly?: boolean; placeholder?: string; className?: string;
  ariaLabel: string; ariaDescribedBy?: string; ariaInvalid?: boolean; menuId?: string; activeOption?: string; testId?: string;
};

/** The editable DOM is a projection, never the persisted document or raw HTML. */
export const InlineReferenceEditor = forwardRef<InlineReferenceEditorHandle, Props>(function InlineReferenceEditor(props, ref) {
  const root = useRef<HTMLDivElement>(null), current = useRef<Entry>({ value: props.value, selection: { start: props.value.length, end: props.value.length } });
  const composing = useRef(false), past = useRef<Entry[]>([]), future = useRef<Entry[]>([]), lastEdit = useRef({ kind: "", time: 0 });
  const latest = useRef(props); latest.current = props;
  const rendered = useRef("");
  const [thumbnails, setThumbnails] = useState<InlineThumbnailSlot[]>([]);
  const pendingSelection = useRef<InlineSelection | null>(null), propValue = useRef(props.value);
  const notify = useCallback(() => {
    if (!root.current) return;
    const selection = readInlineSelection(root.current);
    if (!selection || root.current.ownerDocument.activeElement !== root.current) return;
    current.current.selection = selection;
    latest.current.onSelection?.(composing.current ? inlineText(root.current) : current.current.value, selection, composing.current);
  }, []);
  function project(entry: Entry, focus = false) {
    const element = root.current; if (!element) return;
    const selected = element === element.ownerDocument.activeElement;
    const tokens = latest.current.tokens(entry.value), signature = JSON.stringify([entry.value, tokens]);
    const changed = rendered.current !== signature;
    if (changed) {
      const next = renderInlineReferences(element, entry.value, tokens); rendered.current = signature;
      setThumbnails(old => old.length === next.length && old.every((slot, index) => slot.key === next[index].key && slot.source === next[index].source && slot.container === next[index].container) ? old : next);
    }
    if (focus) element.focus();
    if (changed && selected || focus) setInlineSelection(element, entry.selection);
  }
  function change(value: string, selection: InlineSelection, kind = "edit") {
    if (latest.current.readOnly) return;
    const before = current.current;
    if (value !== before.value) {
      const time = Date.now(), coalesce = kind === "typing" && lastEdit.current.kind === kind && time - lastEdit.current.time < 650 && before.selection.start === before.selection.end;
      if (!coalesce) { past.current.push({ value: before.value, selection: { ...before.selection } }); if (past.current.length > 100) past.current.shift(); }
      future.current = []; lastEdit.current = { kind, time };
    }
    current.current = { value, selection }; project(current.current, true);
    latest.current.onChange(value); notify();
  }
  function replace(text: string, at = readInlineSelection(root.current!) || current.current.selection, kind = "edit") {
    const selection = wholeInlineSelection(at, latest.current.tokens(current.current.value));
    const value = current.current.value.slice(0, selection.start) + text + current.current.value.slice(selection.end), caret = selection.start + text.length;
    change(value, { start: caret, end: caret }, kind);
  }
  function remove(backward: boolean) {
    const selection = readInlineSelection(root.current!) || current.current.selection;
    if (selection.start !== selection.end) return replace("", selection);
    const token = latest.current.tokens(current.current.value).find(item => backward ? item.end === selection.start : item.start === selection.start);
    if (token) return replace("", { start: token.start, end: token.end });
    const text = current.current.value;
    // A Unicode code point is one editing unit, including supplementary emoji.
    const amount = backward ? [...text.slice(0, selection.start)].pop()?.length || 0 : [...text.slice(selection.end)][0]?.length || 0;
    replace("", { start: Math.max(0, selection.start - (backward ? amount : 0)), end: Math.min(text.length, selection.end + (backward ? 0 : amount)) });
  }
  function history(redo: boolean) {
    if (latest.current.readOnly) return;
    const from = redo ? future : past, to = redo ? past : future, next = from.current.pop(); if (!next) return;
    to.current.push(current.current); current.current = next; lastEdit.current = { kind: "", time: 0 };
    project(next, true); latest.current.onChange(next.value); notify();
  }
  const handlers = useRef({ replace, remove, history }); handlers.current = { replace, remove, history };
  useImperativeHandle(ref, () => ({
    focus() { root.current?.focus(); setInlineSelection(root.current!, current.current.selection); },
    select(start, end = start) { const selection = { start, end }; pendingSelection.current = selection; current.current.selection = selection; if (root.current) { root.current.focus(); setInlineSelection(root.current, selection); } },
    replace(text, selection) { handlers.current.replace(text, selection); }, selection: () => readInlineSelection(root.current!) || current.current.selection,
  }), []);
  useLayoutEffect(() => {
    if (!root.current || composing.current) return;
    const old = current.current;
    if (props.value !== propValue.current && props.value !== old.value) {
      past.current.push(old); future.current = []; lastEdit.current = { kind: "", time: 0 };
      current.current = { value: props.value, selection: { start: Math.min(props.value.length, old.selection.start), end: Math.min(props.value.length, old.selection.end) } };
    }
    propValue.current = props.value;
    if (pendingSelection.current) { current.current.selection = pendingSelection.current; pendingSelection.current = null; }
    project(current.current);
  });
  useEffect(() => {
    const element = root.current!;
    const before = (event: InputEvent) => {
      if (latest.current.readOnly) { event.preventDefault(); return; }
      if (composing.current || event.isComposing) return;
      if (event.inputType === "historyUndo" || event.inputType === "historyRedo") { event.preventDefault(); handlers.current.history(event.inputType === "historyRedo"); }
      else if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") { event.preventDefault(); handlers.current.replace("\n"); }
      else if (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward") { event.preventDefault(); handlers.current.remove(event.inputType === "deleteContentBackward"); }
    };
    element.addEventListener("beforeinput", before); element.ownerDocument.addEventListener("selectionchange", notify);
    return () => { element.removeEventListener("beforeinput", before); element.ownerDocument.removeEventListener("selectionchange", notify); };
  }, [notify]);
  function clipboard(event: React.ClipboardEvent<HTMLDivElement>, cut: boolean) {
    const selection = wholeInlineSelection(readInlineSelection(root.current!) || current.current.selection, props.tokens(current.current.value));
    if (selection.start === selection.end) return;
    event.preventDefault(); event.stopPropagation();
    const text = current.current.value.slice(selection.start, selection.end), mentions = props.tokens(current.current.value).filter(token => token.start >= selection.start && token.end <= selection.end)
      .map(token => ({ start: token.start - selection.start, end: token.end - selection.start, key: token.key }));
    event.clipboardData.setData("text/plain", text); event.clipboardData.setData(CLIPBOARD, JSON.stringify({ version: 1, text, mentions }));
    if (cut && !props.readOnly) replace("", selection);
  }
  return <><div ref={element => { root.current = element; if (props.domRef) props.domRef.current = element; }}
    role="textbox" aria-multiline="true" aria-label={props.ariaLabel} aria-readonly={!!props.readOnly}
    aria-describedby={props.ariaDescribedBy} aria-invalid={props.ariaInvalid || undefined}
    aria-autocomplete="list" aria-controls={props.menuId} aria-expanded={!!props.menuId} aria-activedescendant={props.activeOption}
    contentEditable={!props.readOnly} suppressContentEditableWarning spellCheck={false} data-testid={props.testId}
    data-placeholder={props.readOnly ? "" : props.placeholder} tabIndex={0}
    className={`nodrag nopan nowheel whitespace-pre-wrap break-words outline-none [&[data-empty=true]]:before:pointer-events-none [&[data-empty=true]]:before:float-left [&[data-empty=true]]:before:text-[var(--canvas-ui-muted)] [&[data-empty=true]]:before:content-[attr(data-placeholder)] ${props.className || ""}`}
    onFocus={notify} onBlur={() => { lastEdit.current.kind = ""; props.onBlur?.(); }}
    onCompositionStart={() => { composing.current = true; props.onSelection?.(current.current.value, current.current.selection, true); }}
    onCompositionEnd={() => { composing.current = false; rendered.current = ""; const value = inlineText(root.current!), selection = readInlineSelection(root.current!) || current.current.selection; change(value, selection, "composition"); }}
    onInput={() => { if (composing.current) return; rendered.current = ""; const value = inlineText(root.current!), selection = readInlineSelection(root.current!) || current.current.selection; change(value, selection, "typing"); }}
    onKeyDown={event => {
      event.stopPropagation(); props.onKeyDown?.(event);
      if (event.defaultPrevented || composing.current || event.nativeEvent.isComposing || props.readOnly) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && !event.altKey && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) { event.preventDefault(); history(event.key.toLowerCase() === "y" || event.shiftKey); }
      else if (event.key === "Backspace" || event.key === "Delete") { if (!command && !event.altKey) { event.preventDefault(); remove(event.key === "Backspace"); } }
      else if (event.key === "Enter") { event.preventDefault(); replace("\n"); }
    }}
    onCopy={event => clipboard(event, false)} onCut={event => clipboard(event, true)}
    onPaste={event => {
      event.preventDefault(); event.stopPropagation(); if (props.readOnly) return;
      const literal = event.clipboardData.getData("text/plain"); let text = literal;
      try {
        const item = JSON.parse(event.clipboardData.getData(CLIPBOARD));
        if (item.version === 1 && item.text === text && Array.isArray(item.mentions) && item.mentions.length <= 1000) {
          const mentions = [...item.mentions].reverse(); let end = text.length;
          // Validate the complete untrusted payload before transforming any text.
          for (const mention of mentions) {
            if (typeof mention.key !== "string" || !Number.isInteger(mention.start) || !Number.isInteger(mention.end) || mention.start < 0 || mention.end > end || mention.end <= mention.start) throw Error("clipboard");
            end = mention.start;
          }
          for (const mention of mentions) text = text.slice(0, mention.start) + props.resolvePastedKey(mention.key) + text.slice(mention.end);
        }
      } catch { text = literal; /* Unstructured clipboard remains literal plain text, never HTML. */ }
      replace(text.replace(/\r\n?/g, "\n"));
    }}
    onDragStart={event => { event.preventDefault(); event.stopPropagation(); }} onDragOver={event => { event.preventDefault(); event.stopPropagation(); }} onDrop={event => { event.preventDefault(); event.stopPropagation(); }}
    onMouseDown={event => { const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-reference-key]"); if (chip) { event.preventDefault(); event.stopPropagation(); } }}
    onClick={event => { const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-reference-key]"); if (chip && chip.dataset.referenceMissing !== "true") { event.stopPropagation(); props.onReference?.(chip.dataset.referenceKey!); } }}
  />{thumbnails.map(slot => createPortal(<CachedImage src={slot.source} alt="" draggable={false} reuseActivePreview networkQueue="canvas"
    onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
    onClick={event => { event.stopPropagation(); props.onReference?.(slot.referenceKey); }}
    style={{ width: 18, height: 18, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />, slot.container, slot.key))}</>;
});
