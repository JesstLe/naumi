"use client";

import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { AtSign, LocateFixed, X } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import { InlineReferenceEditor, type InlineReferenceEditorHandle } from "./inline-reference-editor";
import type { InlineReferenceToken } from "./inline-reference-dom";
import { cdnThumb } from "@/lib/cdn";
import { type CanvasImageReference } from "@/lib/canvas/image-references";
import { referenceRoleLabels, type ReferenceRole } from "@/lib/imagegen/reference-labels";

type Props = {
  references: CanvasImageReference[]; prompt: string; onPrompt: (prompt: string) => void;
  onRole: (key: string, role: ReferenceRole) => void; onRemove: (ref: CanvasImageReference) => void;
  onPreview: (ref: CanvasImageReference) => void; onLocate: (id: string) => void;
  textareaRef: RefObject<HTMLDivElement | null>; placeholder: string;
  readOnly?: boolean; english?: boolean; error?: string | null; children?: ReactNode;
};

export function ImageReferenceComposer(props: Props) {
  const { references, prompt, onPrompt, textareaRef, english, readOnly } = props;
  const menuId = useId(), errorId = useId();
  const editor = useRef<InlineReferenceEditorHandle>(null);
  const [query, setQuery] = useState<string | null>(null), [active, setActive] = useState(0);
  const [caret, setCaret] = useState({ start: prompt.length, end: prompt.length });
  const options = references.filter(ref => query === "" || `${ref.number} ${ref.title}`.toLowerCase().includes((query || "").toLowerCase()));
  function track(value: string, start: number, end: number, composing: boolean) {
    setCaret(old => old.start === start && old.end === end ? old : { start, end });
    const nextQuery = !composing && start === end ? value.slice(0, start).match(/@([^\s@【】]*)$/)?.[1] ?? null : null;
    setQuery(nextQuery); if (nextQuery !== query) setActive(0);
  }
  function insert(ref: CanvasImageReference) {
    if (readOnly) return;
    const before = prompt.slice(0, caret.start), match = before.match(/@[^\s@【】]*$/);
    editor.current?.replace(`【图${ref.number}】`, { start: match ? caret.start - match[0].length : caret.start, end: caret.end });
    setQuery(null);
  }
  function tokens(value: string): InlineReferenceToken[] {
    return [...value.matchAll(/【图([1-9]\d{0,4})】|【失效引用】/g)].map(match => {
      const reference = references.find(item => item.number === Number(match[1]));
      return { start: match.index!, end: match.index! + match[0].length, raw: match[0], key: reference?.key || `missing:${match[0]}`,
        title: reference?.title || (english ? "Missing reference" : "失效引用"), thumbnail: reference ? cdnThumb(reference.url, 64) : undefined,
        detail: reference ? `${english ? "Img " : "图"}${reference.number}` : undefined, missing: !reference };
    });
  }
  return <div className="min-w-0" data-testid="image-reference-composer">
    <div className="mb-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto" aria-label={english ? "Input images" : "输入图片"}>
      {references.map(ref => <div key={ref.key} className="relative flex w-[calc(50%-4px)] min-w-[138px] gap-2 sm:w-[166px] rounded-[10px] border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-panel)] p-2" data-reference-number={ref.number}>
        <button type="button" onClick={() => props.onPreview(ref)} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md" aria-label={`${english ? "Preview image" : "预览图"}${ref.number}`}>
          <CachedImage src={cdnThumb(ref.url, 128)} reuseActivePreview alt="" className="h-full w-full object-cover" />
          <span className="absolute bottom-0 left-0 rounded-tr bg-black/65 px-1 text-[10px] text-white">{english ? "Img " : "图"}{ref.number}</span>
        </button>
        <div className="min-w-0 flex-1 pr-1">
          <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => insert(ref)} className="canvas-ui-text block max-w-full truncate text-left text-xs font-medium hover:text-indigo-500" title={english ? "Insert image reference" : "插入图片引用"}>{english ? "Image " : "图"}{ref.number}</button>
          <div className="flex min-w-0 items-center gap-1 text-[10px] text-[var(--canvas-ui-muted)]">
            <span className="truncate" title={ref.title}>{ref.title}</span>
            {ref.sourceNodeId && <button type="button" className="shrink-0" onClick={() => props.onLocate(ref.sourceNodeId!)} aria-label={`${english ? "Locate source of image " : "定位图"}${ref.number}${english ? "" : "来源节点"}`}><LocateFixed size={12} /></button>}
          </div>
          <select aria-label={`${english ? "Role of image " : "图"}${ref.number}${english ? "" : "用途"}`} value={ref.role} disabled={readOnly} title={ref.role === "edit-target" ? (english ? "Modify this original image" : "直接修改这张原图") : referenceRoleLabels[ref.role][english ? "en" : "zh"]}
            onChange={event => props.onRole(ref.key, event.target.value as ReferenceRole)} className="canvas-ui-control mt-1 w-full rounded border px-0.5 py-0.5 text-[10px]">
            {(Object.keys(referenceRoleLabels) as ReferenceRole[]).map(role => <option key={role} value={role}>{referenceRoleLabels[role][english ? "en" : "zh"]}</option>)}
          </select>
        </div>
        {!readOnly && <button type="button" onClick={() => props.onRemove(ref)} className="absolute right-0.5 top-0.5 rounded p-0.5 text-[var(--canvas-ui-muted)] hover:bg-black/10" aria-label={`${english ? "Remove image " : "移除图"}${ref.number}`}><X size={12} /></button>}
      </div>)}
      {props.children}
    </div>
    <div className="relative">
      <InlineReferenceEditor ref={editor} domRef={textareaRef} ariaLabel="节点提示词" value={prompt} onChange={onPrompt} tokens={tokens}
        resolvePastedKey={key => { const item = references.find(ref => ref.key === key); return item ? `【图${item.number}】` : "【失效引用】"; }}
        onReference={key => { const ref = references.find(item => item.key === key); if (ref) props.onPreview(ref); }}
        readOnly={readOnly} placeholder={props.placeholder} ariaDescribedBy={props.error ? errorId : undefined} ariaInvalid={!!props.error}
        menuId={query !== null ? menuId : undefined} activeOption={query !== null && options.length ? `${menuId}-${Math.min(active, options.length - 1)}` : undefined}
        onSelection={(value, selection, composing) => track(value, selection.start, selection.end, composing)} onBlur={() => setQuery(null)}
        onKeyDown={event => {
          if (query === null || event.nativeEvent.isComposing) return;
          if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); }
          if (event.key === "Escape") setQuery(null);
          else if (event.key === "ArrowDown") setActive(index => options.length ? (index + 1) % options.length : 0);
          else if (event.key === "ArrowUp") setActive(index => options.length ? (index + options.length - 1) % options.length : 0);
          else if (event.key === "Enter" && options.length) insert(options[Math.min(active, options.length - 1)]);
        }}
        className="canvas-ui-text min-h-[112px] max-h-[220px] overflow-y-auto border-0 bg-transparent px-0 py-0.5 text-sm leading-7 shadow-none" />
      {query !== null && !readOnly && <div id={menuId} role="listbox" aria-label={english ? "Choose an image reference" : "选择图片引用"} className="canvas-ui-control mt-1 max-h-40 overflow-y-auto rounded-lg border p-1 shadow-sm">
        {options.map((ref, index) => <button key={ref.key} id={`${menuId}-${index}`} type="button" role="option" aria-selected={index === active} onMouseDown={event => event.preventDefault()} onClick={() => insert(ref)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${index === active ? "bg-indigo-500/10" : ""}`}>
          <CachedImage src={cdnThumb(ref.url,64)} alt="" className="h-7 w-7 shrink-0 rounded object-cover"/><span className="truncate">{ref.title}</span><span className="shrink-0 text-[10px] opacity-60">{english ? "Img " : "图"}{ref.number}</span><span className="ml-auto shrink-0 text-[10px] opacity-60">{referenceRoleLabels[ref.role][english ? "en" : "zh"]}</span>
        </button>)}
        {!options.length && <span className="block p-2 text-xs opacity-60">{english ? "No matching image" : "没有匹配的图片"}</span>}
      </div>}
    </div>
    {!!references.length && !readOnly && <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { editor.current?.replace("@"); setQuery(""); setActive(0); }} className="canvas-ui-text mt-1 flex items-center gap-1 rounded px-1 py-1 text-xs opacity-70 hover:opacity-100"><AtSign size={13} />{english ? "Reference image" : "引用图片"}</button>}
    {props.error && <p id={errorId} role="alert" className="py-1 text-xs text-red-500">{props.error}</p>}
  </div>;
}
