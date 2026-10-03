"use client";
import type { ReactNode } from "react";
import type { ExpiryPolicy } from "@/lib/billing/types";
import { useEffect, useState } from "react";
import { microsToDecimal, decimalToMicros } from "@/lib/billing/decimal";
export const control = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
export function Field({ label, children }: {
    label: string;
    children: ReactNode;
}) { return <label className="flex min-w-0 flex-col gap-1.5 text-sm text-foreground"><span>{label}</span>{children}</label>; }
export function NumberField({ label, value, onChange, min = 0, max = 2147483647 }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
}) { return <Field label={label}><input aria-label={label} className={control} type="number" min={min} max={max} step={1} value={value} onChange={e => onChange(Number(e.target.value))}/></Field>; }
export function Choice({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: readonly (readonly [
        string,
        string
    ])[];
    onChange: (value: string) => void;
}) { return <Field label={label}><select aria-label={label} className={control} value={value} onChange={e => onChange(e.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>; }
export function ExpiryEditor({ label, value, onChange }: {
    label: string;
    value: ExpiryPolicy;
    onChange: (value: ExpiryPolicy) => void;
}) { return <div className="grid grid-cols-2 gap-3"><NumberField label={`${label} · 时长`} value={value.value} min={1} max={36500} onChange={n => onChange({ ...value, value: n })}/><Choice label={`${label} · 单位`} value={value.unit} options={[["days", "天"], ["months", "月"], ["years", "年"]]} onChange={unit => onChange({ ...value, unit: unit as ExpiryPolicy["unit"] })}/></div>; }
export function MoneyField({ label, value, onChange }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) { const [text, setText] = useState(microsToDecimal(value)); useEffect(() => { if (/^\d+$/.test(value))
    setText(microsToDecimal(value)); }, [value]); const invalid = decimalToMicros(text) === null; return <Field label={label}><input className={control} inputMode="decimal" aria-invalid={invalid} value={text} onChange={e => { setText(e.target.value); const micros = decimalToMicros(e.target.value); onChange(micros ?? `invalid:${e.target.value}`); }}/>{invalid && <span className="text-xs text-destructive">请输入非负金额，最多保留六位小数</span>}</Field>; }
export function PercentField({ label, value, onChange, min = 0, max = 10000 }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
}) { return <Field label={label}><input className={control} type="number" step="0.01" min={min / 100} max={max / 100} value={value / 100} onChange={e => onChange(Math.round(Number(e.target.value) * 100))}/></Field>; }
