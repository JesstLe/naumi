"use client";
import {CANVAS_TEXT_RESULT_LIMIT} from "@/lib/canvas/text-output-policy";
import {canvasTextContent,CANVAS_TEXT_CONTENT_LIMIT,CANVAS_TEXT_INSTRUCTION_LIMIT} from "@/lib/canvas/text-content";
import {resolveCanvasTextInstruction} from "@/lib/canvas/text-generation-input";
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type RefObject,type Dispatch,type SetStateAction} from "react";
import {ArrowUp,Image as ImageIcon,Loader2,PenLine,Plus,X} from "lucide-react";
import {CanvasPromptOptimizer} from "./prompt-optimizer";
import {optimizeCanvasPrompt} from "@/lib/canvas/prompt-optimizer-client";
import {CachedImage} from "@/components/cached-image";
import {Textarea} from "@/components/ui/textarea";
import {TextModelSelect} from "@/components/ui/text-model-select";
import {FeatureVisible} from "@/lib/feature-access/client";
import {useI18n} from "@/lib/i18n/locale-context";
import {cdnUrl} from "@/lib/cdn";
import {cn} from "@/lib/utils";
import {isHostedImageUrl as hasRenderableImage} from "@/lib/media-url";
import type {Artwork} from "@/lib/mock-data";
import type {CanvasTextNode} from "@/lib/canvas/text-document-model";
import type {CanvasTextTaskState} from "@/lib/canvas/text-task";
import type {DockPlacement} from "@/lib/canvas/dock-placement";
import type {CanvasSize,SafeArea} from "@/lib/canvas/dock-layout";
import {CanvasComposerShell,CanvasComposerFooter} from "./composer-shell";
import {useGrowingTextarea} from "./use-growing-textarea";
import {StoryboardPlanButton} from "./video/storyboard-panel";

type ComposerReference=Pick<Artwork,"id"|"image"|"title">;
export type CanvasTextComposerProps={
  node:CanvasTextNode; members:ComposerReference[]; light:boolean;
  draft:{prompt:string;onChange:(value:string)=>void};
  content:{onChange:(value:string)=>void;onCommit:(value:string,initial?:string)=>void;onFlush:()=>unknown};
  optimization?:{contextKey:string|null;disabled:boolean};
  task:{state:CanvasTextTaskState;retryable:boolean;onGenerate:(intent?:"polish")=>unknown;onAcceptPartial?:()=>unknown;onDiscardPartial?:()=>unknown;onContinueWriting?:()=>unknown};
  layout:{dockRef:RefObject<HTMLDivElement|null>;style?:DockPlacement;safeArea:SafeArea;canvasSize:CanvasSize;expanded:boolean;onExpandedChange:Dispatch<SetStateAction<boolean>>};
  focusRevision?:number;onDismiss:()=>void;onReference:(id:string,enabled:boolean)=>unknown;onMenuOpenChange:(open:boolean)=>void;
  assist:{busy:boolean;onPickProduct:()=>void};image:{disabled:boolean;onGenerate:()=>void};
  storyboard?:{disabled:boolean;onPlan:()=>void};
};
/** Owns only composer presentation. Draft, document and paid task remain with
 * their existing owners; callbacks do not create a second execution path. */
export function CanvasTextComposer({node:selectedText,members,light:lightCanvas,draft,content,optimization,task,layout,focusRevision,onDismiss,onReference,onMenuOpenChange,assist,image,storyboard}:CanvasTextComposerProps){
  const {locale,t}=useI18n(),L=(zh:string,en:string)=>locale==="en"?en:zh;
  const {prompt:textPrompt,onChange:setTextPrompt}=draft;
  const {dockRef:textComposerDockRef,style:dockStyle,safeArea:overlaySafeArea,canvasSize,expanded:textComposerExpanded,onExpandedChange:setTextComposerExpanded}=layout;
  const assistBusy=assist.busy;
  const partial=task.state.phase==="incomplete"?task.state.partial:undefined;
  const canContinue=!!partial&&partial.text.length<CANVAS_TEXT_RESULT_LIMIT;
  const recoveryLabel=task.state.phase==="rejected"?L("重新生成","Generate again"):task.state.hasResult?L("重试保存","Retry save"):L("查询原任务","Check original task");
  const [mode,setMode]=useState<"content"|"write">("content");
  const actionLabel=partial?L("继续写作","Continue writing"):task.retryable?recoveryLabel:mode==="content"?L("润色文字","Polish text"):L("生成文字","Generate text");

  const bodyEdit=useRef<{initial:string;draft:string;change:typeof content.onChange;commit:typeof content.onCommit}|null>(null);
  const value=mode==="content"?canvasTextContent(selectedText):textPrompt;
  const setValue=(next:string)=>{if(mode==="content"){const session=bodyEdit.current;if(session){session.draft=next;session.change(next);}else content.onChange(next);}else setTextPrompt(next);};
  const textComposerBodyRef=useRef<HTMLDivElement>(null),textPromptRef=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(focusRevision){setMode("write");requestAnimationFrame(()=>textPromptRef.current?.focus());}},[focusRevision]);
  const [textReferenceMenuOpen,setTextReferenceMenuOpen]=useState(false);
  const [mentionState,setMentionState]=useState<{query:string;start:number}|null>(null);
  useLayoutEffect(()=>{onMenuOpenChange(textReferenceMenuOpen||!!mentionState);return()=>onMenuOpenChange(false);},[textReferenceMenuOpen,mentionState,onMenuOpenChange]);
  useGrowingTextarea(textPromptRef,value,`${selectedText.id}:${mode}:${textComposerExpanded}`);
  useEffect(() => {
    if (textComposerDockRef.current) textComposerDockRef.current.style.height = "";
  }, [selectedText.id,textComposerDockRef]);
  useEffect(()=>{if(task.state.phase==="succeeded")setMode("content");else if(task.state.phase==="incomplete")setMode("write");},[task.state.phase]);
  const selectedTextRefs = useMemo(
    () =>
      (selectedText?.sourceIds ?? [])
        .map((id) => members.find((member) => member.id === id))
        .filter(Boolean) as ComposerReference[],
    [selectedText, members]
  );
  return (
            <CanvasComposerShell
              ref={textComposerDockRef}

              data-testid="text-node-dock"
              style={
                textComposerExpanded
                  ? {
                      left: overlaySafeArea.left,
                      right: overlaySafeArea.right,
                      top: dockStyle?.top ?? overlaySafeArea.top,
                      bottom: overlaySafeArea.bottom,
                      width: "auto",
                      maxHeight: dockStyle?.maxHeight,
                      minHeight: Math.min(218, dockStyle?.maxHeight ?? 218),
                    }
                  : dockStyle ? { ...dockStyle, minHeight: Math.min(218, dockStyle.maxHeight ?? 218) } : {
                      left: 12,
                      bottom: 12,
                      width: canvasSize.width ? Math.max(1, Math.min(820, canvasSize.width - 24)) : 820,
                    }
              }
              className={textComposerExpanded ? "resize-none" : "resize-y"}
             kind="text" heading={selectedText.title || L("文字", "Text")} onDismiss={onDismiss} expanded={textComposerExpanded} onToggleExpand={() => { if (textComposerDockRef.current) textComposerDockRef.current.style.height = ""; setTextComposerExpanded(value => !value); }} expandLabel={L("展开文字编辑窗口", "Expand text editor")} collapseLabel={L("收起文字编辑窗口", "Collapse text editor")} closeLabel={L("关闭创作栏", "Close composer")}>
              <div role="tablist" aria-label={L("文字编辑方式","Text editing mode")} className="flex gap-1 px-3.5 pt-2">
                {(["content","write"] as const).map(item=><button key={item} type="button" role="tab" aria-selected={mode===item} onClick={()=>{setMode(item);setMentionState(null);}} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold",mode===item?"bg-[#edf2ff] text-[#315fc8]":"canvas-ui-action")}>{item==="content"?L("正文","Content"):L("AI 写作","AI writing")}</button>)}
              </div>
              <div
                ref={textComposerBodyRef} data-composer-body="true"
                className="flex min-h-0 flex-1 items-stretch gap-2 overflow-hidden px-3.5 pb-2 pt-3"
              >
                <button
                  type="button"
                  style={partial&&mode==="write"?{display:"none"}:undefined}
                  title={t("canvas.textAddReference")}
                  aria-label={t("canvas.textAddReference")}
                  aria-expanded={textReferenceMenuOpen}
                  onClick={() => setTextReferenceMenuOpen((open) => !open)}
                  className={cn(
                    "mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border transition-colors",
                    lightCanvas
                      ? "border-[#dfe4ea] bg-[#f3f5f7] text-[#596271] hover:border-[#aeb8c5] hover:bg-[#e9edf2] hover:text-[#20242c]"
                      : "border-[#2a2d36] bg-[#1f2229] text-[#b9c0cb] hover:border-[#4a505c] hover:text-white"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <Textarea
                  autoFocus
                  style={partial&&mode==="write"?{display:"none"}:undefined}
                  ref={textPromptRef}
                  key={mode} value={value} aria-label={mode==="content"?L("文字内容","Text content"):L("AI 写作要求","AI writing instructions")}
                  placeholder={mode==="content"?L("输入文字","Write text"):L("输入写作或修改要求","Describe what to write or change")}
                  maxLength={mode==="content"?CANVAS_TEXT_CONTENT_LIMIT:CANVAS_TEXT_INSTRUCTION_LIMIT}
                  readOnly={task.state.busy || selectedText.status==="generating"}
                  onFocus={()=>{if(mode==="content")bodyEdit.current={initial:canvasTextContent(selectedText),draft:canvasTextContent(selectedText),change:content.onChange,commit:content.onCommit};}}
                  onBlur={()=>{const session=bodyEdit.current;bodyEdit.current=null;if(mode==="content"&&session)session.commit(session.draft,session.initial);else if(mode==="write")void content.onFlush();}}
                  onChange={(event) => {
                    setValue(event.target.value);
                    // 检测光标前未完成的 "@关键词" → 弹出图片选择框
                    const el = event.target;
                    const caret = el.selectionStart ?? event.target.value.length;
                    const before = event.target.value.slice(0, caret);
                    const m = before.match(/@([^@\n\s]{0,24})$/);
                    setMentionState(
                      m ? { query: m[1], start: caret - m[1].length - 1 } : null
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && mentionState) {
                      event.preventDefault();
                      setMentionState(null);
                      return;
                    }
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      if(event.nativeEvent.isComposing)return;
                      if(mode==="write"){if(partial){if(canContinue)void task.onContinueWriting?.();}else void task.onGenerate();}else {const session=bodyEdit.current;content.onCommit(event.currentTarget.value,session?.initial);if(session)session.initial=event.currentTarget.value;}
                    }
                  }}
                  className={cn(
                    "min-h-[112px] min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-0.5 text-sm leading-relaxed shadow-none focus-visible:border-0 focus-visible:bg-transparent focus-visible:ring-0",
                    "max-h-none overflow-hidden",
                    lightCanvas
                      ? "text-[#303641] placeholder:text-[#929aa6]"
                      : "text-[#e7e9ee] placeholder:text-[#818895]"
                  )}
                />
              {partial && mode==="write" && <section aria-label={L("未完成的回复","Incomplete reply")} className="flex min-h-0 flex-1 flex-col rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                  <span className="flex-1 text-xs font-semibold text-amber-900">{L("未完成的回复","Incomplete reply")}</span>
                  <button type="button" disabled={optimization?.disabled||task.state.busy} onClick={()=>void task.onAcceptPartial?.()} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900">{L("使用这段文字","Use this text")}</button>
                  <button type="button" aria-label={L("放弃本次回复","Discard this reply")} title={L("放弃本次回复","Discard this reply")} disabled={optimization?.disabled||task.state.busy} onClick={()=>void task.onDiscardPartial?.()} className="rounded-md p-1 text-amber-700 hover:bg-amber-100"><X className="h-4 w-4"/></button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{partial.text}</div>
              </section>}
              </div>
              {/* @提及选图:输入 @ 触发,点击=插入 @图片名 并绑引用(等同连线) */}
              {mentionState && selectedText && (() => {
                const q = mentionState.query.toLowerCase();
                const options = members
                  .filter(
                    (member) =>
                      hasRenderableImage(member.image) &&
                      (!q || (member.title || "").toLowerCase().includes(q))
                  )
                  .slice(0, 8);
                return (
                  <div
                    data-testid="mention-picker"
                    className={cn(
                      "border-t px-3.5 py-2.5",
                      lightCanvas
                        ? "border-[#edf0f3] bg-[#fafbfd]"
                        : "border-[#2a2d36] bg-[#17191f]"
                    )}
                  >
                    <p
                      className={cn(
                        "mb-2 text-[11px] font-medium",
                        lightCanvas ? "text-[#697383]" : "text-[#9aa1ae]"
                      )}
                    >
                      {t("canvas.mentionPickHint")}
                    </p>
                    {options.length ? (
                      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
                        {options.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => {
                              const insert = `@${member.title || t("canvas.imageNode")} `;
                              const end = mentionState.start + 1 + mentionState.query.length;
                              setValue(value.slice(0,mentionState.start)+insert+value.slice(end));
                              setMentionState(null);
                              void onReference(member.id, true);
                            }}
                            className={cn(
                              "flex max-w-[210px] items-center gap-1.5 rounded-[8px] border px-2 py-1 text-[11px] font-medium transition-colors",
                              lightCanvas
                                ? "border-[#dfe4ea] bg-white text-[#46505e] hover:border-[#8794a4] hover:bg-[#f2f5f8] hover:text-[#20242c]"
                                : "border-[#343842] bg-[#20232a] text-[#cdd2da] hover:border-[#6bd7ec] hover:text-[#8fe7f5]"
                            )}
                          >
                            <CachedImage src={cdnUrl(member.image)} alt="" className="h-5 w-5 flex-none object-cover" />
                            <span className="truncate">@{member.title || t("canvas.imageNode")}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p
                        className={cn(
                          "text-[11px]",
                          lightCanvas ? "text-[#7b8492]" : "text-[#7f8793]"
                        )}
                      >
                        {t("canvas.mentionEmpty")}
                      </p>
                    )}
                  </div>
                );
              })()}
              {textReferenceMenuOpen && (
                <div
                  className={cn(
                    "border-t px-3.5 py-2.5",
                    lightCanvas
                      ? "border-[#edf0f3] bg-[#fafbfd]"
                      : "border-[#2a2d36] bg-[#17191f]"
                  )}
                >
                  <p
                    className={cn(
                      "mb-2 text-[11px] font-medium",
                      lightCanvas ? "text-[#697383]" : "text-[#9aa1ae]"
                    )}
                  >
                    {t("canvas.textReferenceHint")}
                  </p>
                  <div className="flex max-h-24 flex-wrap gap-1.5 overflow-auto">
                    {members.map((reference) => {
                      const checked = (selectedText.sourceIds ?? []).includes(reference.id);
                      return (
                        <button
                          key={reference.id}
                          type="button"
                          data-artwork-id={reference.id}
                          onClick={() =>
                            void onReference(reference.id, !checked)
                          }
                          className={cn(
                            "flex max-w-[210px] items-center gap-1.5 border px-2 py-1 text-[11px] font-medium transition-colors",
                            checked
                              ? lightCanvas
                                ? "border-[#8aa6b2] bg-[#e8f2f5] text-[#315a68]"
                                : "border-[#6bd7ec] bg-[#163842] text-[#8fe7f5]"
                              : lightCanvas
                                ? "border-[#dfe4ea] bg-white text-[#46505e] hover:border-[#9aa6b5] hover:bg-[#f2f5f8]"
                                : "border-[#343842] bg-[#20232a] text-[#cdd2da] hover:border-[#596170]"
                          )}
                        >
                          <CachedImage src={cdnUrl(reference.image)} alt="" className="h-5 w-5 flex-none object-cover" />
                          <span className="truncate">@{reference.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!!selectedTextRefs.length && (
                <div
                  className={cn(
                    "flex flex-wrap gap-1.5 border-t px-3.5 py-2",
                    lightCanvas ? "border-[#edf0f3]" : "border-[#2a2d36]"
                  )}
                >
                  {selectedTextRefs.map((reference) => (
                    <span
                      key={reference.id}
                      className={cn(
                        "flex max-w-[220px] items-center gap-1 rounded-[8px] border py-0.5 pl-2 pr-1 text-[11px] font-semibold",
                        lightCanvas
                          ? "border-[#b9d0d8] bg-[#e8f2f5] text-[#315a68]"
                          : "border-[#24505f] bg-[#163842] text-[#8fe7f5]"
                      )}
                    >
                      <span className="truncate">@{reference.title}</span>
                      <button
                        type="button"
                        aria-label={`${t("canvas.textRemoveReference")} ${reference.title}`}
                        onClick={() =>
                          void onReference(reference.id, false)
                        }
                        className={cn(
                          "flex h-4 w-4 flex-none items-center justify-center rounded transition-colors",
                          lightCanvas
                            ? "text-[#668a96] hover:bg-[#cfe2e8] hover:text-[#284d59]"
                            : "text-[#79bcc7] hover:bg-[#24505f] hover:text-white"
                        )}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {task.state.error && !partial && (
                <p className="canvas-ui-error px-12 pb-2 text-xs font-medium">{task.state.error}</p>
              )}
              <CanvasComposerFooter testId="text-node-dock-footer" controls={partial?<TextModelSelect feature="canvas.text-generate" compact dark={!lightCanvas} direction="up" />:<>
                {storyboard&&<StoryboardPlanButton english={locale==='en'} disabled={storyboard.disabled} onClick={storyboard.onPlan}/>}
                {mode==="write"&&<TextModelSelect feature="canvas.text-generate" compact dark={!lightCanvas} direction="up" />}
                <CanvasPromptOptimizer contextKey={optimization?.contextKey??null} prompt={canvasTextContent(selectedText)}
                  disabled={!optimization || optimization.disabled || task.state.busy || selectedText.status === "generating" || assistBusy} english={locale === "en"}
                  onOptimize={(prompt, signal) => optimizeCanvasPrompt("canvas-text", prompt, signal)} onApply={value=>content.onCommit(value,canvasTextContent(selectedText))}/>

                <FeatureVisible feature="generate"><button
                  type="button"
                  disabled={image.disabled}
                  onClick={() => image.onGenerate()}
                  title={t("canvas.genImagesHint")}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-[9px] border px-3 text-[11px] font-semibold transition-colors",
                    lightCanvas
                      ? "border-[#d8dde4] bg-white text-[#46505e] hover:border-[#aeb7c3] hover:bg-[#f2f4f6] hover:text-[#20242c]"
                      : "border-[#343842] text-[#d5d8df] hover:bg-[#24272f] hover:text-white"
                  )}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t("canvas.genImages")}
                </button></FeatureVisible>
                 </>} actions={<>
                <button data-text-primary="true" type="button" onClick={()=>void (partial?task.onContinueWriting?.():task.onGenerate(mode==="content"?"polish":undefined))}
                  disabled={optimization?.disabled||!!partial&&!canContinue||(!partial&&!resolveCanvasTextInstruction(mode==="write"?textPrompt:"",canvasTextContent(selectedText))&&!task.retryable)||task.state.busy||selectedText.status==="generating"&&task.state.phase==="idle"}
                  title={actionLabel}
                  aria-label={actionLabel}
                  className="canvas-ui-primary flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-xs font-semibold disabled:opacity-45">
                  {task.state.busy?<Loader2 className="h-4 w-4 animate-spin"/>:<ArrowUp aria-hidden="true" className="h-4 w-4"/>}{actionLabel}
                </button>

               </>}/>
            </CanvasComposerShell>
  );
}
