"use client";
import type { ReactNode } from "react";
export const inputClass =
  "w-full min-w-0 rounded-lg border border-c-border bg-c-card px-3 py-2 text-sm text-c-text focus:outline-none focus:ring-2 focus:ring-c-accent";
export const buttonClass =
  "rounded-lg border border-c-border bg-c-card px-3 py-2 text-sm text-c-text disabled:opacity-40";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="text-c-text2">{label}</span>
      {children}
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
  disabled = false,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        aria-label={label}
        className={inputClass}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100000,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <input
        aria-label={label}
        className={inputClass}
        type="number"
        step={1}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-c-border bg-c-card p-4 sm:p-5">
      <h2 className="break-words text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
export function Chips({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-c-text2">{label}</legend>
      <div className="flex flex-wrap gap-3">
        {values.map((o) => (
          <Toggle
            key={o.value}
            label={o.label}
            value={selected.includes(o.value)}
            onChange={(checked) =>
              onChange(
                checked
                  ? [...selected, o.value]
                  : selected.filter((v) => v !== o.value),
              )
            }
          />
        ))}
      </div>
    </fieldset>
  );
}
