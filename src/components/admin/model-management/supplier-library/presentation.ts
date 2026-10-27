import {fixed} from "@/lib/supplier-cost/money";
import type {SupplierPrice} from "@/lib/supplier-models/types";
import {bases} from "./contracts";
export function costSummary(p?:SupplierPrice){if(!p)return "尚未维护";const symbol=p.currency==="USD"?"$":"¥";return p.basis==="token"?`输入 ${symbol}${fixed(p.inputMicrosPerMillion)} / 输出 ${symbol}${fixed(p.outputMicrosPerMillion)} · 每百万token`:`${symbol}${fixed(p.amountMicros)} · ${bases[p.basis]}`;}
export function download(name:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
