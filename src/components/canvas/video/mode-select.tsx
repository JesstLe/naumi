"use client";

import {useEffect, useRef, useState} from "react";
import {ArrowRight, X} from "lucide-react";
import {SelectMenu} from "@/components/ui/select-menu";
import {ModelIcon} from "@/components/ui/model-icon";
import {CanvasActionPanel} from "../canvas-action-menu";
import {catalogCapability, type VideoCatalogModel} from "@/lib/video/client-settings";
import {availableVideoIntents, supportsVideoIntent, videoIntentModels, VIDEO_CREATION_LABELS, type VideoCreationIntent} from "@/lib/video/mode-selection";
import {useVideoI18n} from "./i18n";

/** A mode may be discoverable across the catalog, but a model change is always
 * an explicit click. Opening/cancelling the picker never mutates the draft. */
export function VideoModeSelect({value, model, models, disabled, className, onSelect}: {
  value: VideoCreationIntent|'auto'; model?: VideoCatalogModel; models: VideoCatalogModel[];
  disabled: boolean; className: string; onSelect: (intent: VideoCreationIntent|'auto', model: VideoCatalogModel) => void;
}) {
  const V = useVideoI18n(), container = useRef<HTMLDivElement>(null), anchor = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState<VideoCreationIntent | null>(null);
  const cap = catalogCapability(model), candidates = pending ? videoIntentModels(models, pending) : [];
  useEffect(() => { setPending(null); }, [model?.providerId, model?.modelId, disabled]);
  if(model?.execution)return <div ref={container} className='min-w-0' data-testid='video-mode-control'><SelectMenu label={V('视频生成模式')} size='sm' value={value} disabled={disabled} className={className} popoverClassName='canvas-ui-light'
    onChange={selected=>onSelect(selected as VideoCreationIntent|'auto',model)} options={[
      {value:'auto',label:V('自动'),buttonLabel:V('自动')},
      ...model.execution.operations.map(operation=>{const intent=operation.intent==='reference'?'omni_reference':operation.intent;return {value:intent,label:V(VIDEO_CREATION_LABELS[intent]),buttonLabel:V(VIDEO_CREATION_LABELS[intent])};}),
      ...(!['auto',...model.execution.operations.map(op=>op.intent==='reference'?'omni_reference':op.intent)].includes(value)?[{value,label:V(VIDEO_CREATION_LABELS[value as VideoCreationIntent]||value),buttonLabel:V(VIDEO_CREATION_LABELS[value as VideoCreationIntent]||value)}]:[]),
    ]}/></div>;
  function choose(intent: VideoCreationIntent) {
    if (disabled) return;
    if (model && supportsVideoIntent(cap, intent)) { onSelect(intent, model); return; }
    if (!videoIntentModels(models, intent).length) return;
    anchor.current = container.current?.querySelector<HTMLButtonElement>('button[role="combobox"]') ?? null;
    setPending(intent);
  }
  function close() { setPending(null); anchor.current?.focus({preventScroll: true}); }
  return <div ref={container} className="min-w-0" data-testid="video-mode-control">
    <SelectMenu label={V("视频生成模式")} size="sm" value={value} disabled={disabled}
      className={className} popoverClassName="canvas-ui-light" onChange={value => choose(value as VideoCreationIntent)}
      options={availableVideoIntents(models).map(intent => {
        const here = supportsVideoIntent(cap, intent), available = videoIntentModels(models, intent).length > 0;
        return {value: intent, disabled: !available, buttonLabel: V(VIDEO_CREATION_LABELS[intent]),
          label: <span className="flex min-w-0 items-center justify-between gap-4" title={available ? undefined : V("暂无已配置模型支持此模式")}>
            <span>{V(VIDEO_CREATION_LABELS[intent])}</span>{!here && available && <ArrowRight size={14} aria-hidden="true"/>}
          </span>};
      })}/>
    {pending && !disabled && <CanvasActionPanel anchorRef={anchor} label={V("选择视频模型")} light width={340} onClose={close}>
      <div className="mb-2 flex items-center justify-between text-xs font-semibold">
        <span>{V(VIDEO_CREATION_LABELS[pending])}</span><button type="button" aria-label={V("取消切换模型")} onClick={close} className="canvas-ui-action rounded-md p-1"><X size={15}/></button>
      </div>
      <div className="space-y-1" onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
        {candidates.map(candidate => <button type="button" key={`${candidate.providerId}/${candidate.modelId}`}
          className="canvas-ui-action flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
          onClick={() => { if (supportsVideoIntent(catalogCapability(candidate), pending)) onSelect(pending, candidate); close(); }}>
          <ModelIcon modelId={candidate.modelId} modelName={candidate.label} size={17}/><span className="min-w-0 truncate">{candidate.label}</span>
        </button>)}
        {!candidates.length && <p role="status" className="canvas-ui-muted py-2 text-xs">{V("暂无已配置模型支持此模式")}</p>}
      </div>
    </CanvasActionPanel>}
  </div>;
}
