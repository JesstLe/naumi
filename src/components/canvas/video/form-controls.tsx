"use client";
import type {ReactNode} from "react";
export const videoFieldClass="canvas-ui-action w-full min-w-0 rounded-lg border border-current/15 px-2.5 py-2 text-xs outline-none focus:border-teal-500";
export const videoButtonClass="canvas-ui-action rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-40";
export function assertVideoFieldsValid(root:HTMLElement|null){const invalid=root?.querySelector<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>("input:invalid,textarea:invalid,select:invalid");if(invalid){invalid.reportValidity();throw new Error(invalid.validationMessage||"请检查视频参数");}}
export function VideoField({label,children}:{label:string;children:ReactNode}){return <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium"><span className="opacity-70">{label}</span>{children}</label>;}
export function VideoSection({title,children}:{title:string;children:ReactNode}){return <section className="space-y-3 border-t border-current/10 pt-3"><h3 className="text-xs font-semibold">{title}</h3>{children}</section>;}
