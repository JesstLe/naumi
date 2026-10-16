"use client";
import { SelectMenu } from "@/components/ui/select-menu";
import { ModelIcon } from "@/components/ui/model-icon";
import { cn } from "@/lib/utils";

export type CanvasModelOption = { value: string; modelId: string; label: string; note?: string };
/** Image and video composers share the same light, keyboard-accessible portal picker. */
export function CanvasModelSelect({ value, options, label, placeholder, disabled = false, fullWidth = false, testId, onChange }: {
  value: string; options: CanvasModelOption[]; label: string; placeholder: string;
  disabled?: boolean; fullWidth?: boolean; testId?: string; onChange: (value: string) => void;
}) {
  const current = options.find(option => option.value === value);
  const name = (option: CanvasModelOption, trigger = false) => <span className="flex min-w-0 items-center gap-2">
    <ModelIcon modelId={option.modelId} modelName={option.label} size={trigger ? 15 : 16} />
    <span className="min-w-0 truncate" data-testid={trigger ? testId : undefined}>{option.label}</span>
  </span>;
  return <div className={cn("canvas-ui-light min-w-0", fullWidth ? "w-full" : "max-w-[190px]")} data-testid="canvas-model-control">
    <SelectMenu label={label} size="sm" value={value} disabled={disabled || options.length === 0 || options.length === 1 && Boolean(current)}
      className={cn("canvas-ui-control h-8 rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold", fullWidth && "w-full")}
      popoverClassName="canvas-ui-light" onChange={onChange}
      options={[
        ...(!current ? [{ value, label: <span data-testid={testId}>{placeholder}</span>, disabled: true }] : []),
        ...options.map(option => ({ value: option.value, buttonLabel: name(option, true), label: <span className="flex min-w-0 items-center justify-between gap-3">{name(option)}{option.note && <span className="text-[10px] text-slate-500">{option.note}</span>}</span> })),
      ]} />
  </div>;
}
