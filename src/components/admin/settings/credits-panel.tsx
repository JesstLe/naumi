"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {Loader2,Database,Sparkles} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

import type {SettingsSession} from "./use-settings-session";
import {OPERATOR_EMAIL} from "@/lib/operator";
export function AdminCreditSettings({section,settings,prefillEmail}:{section:string;settings:SettingsSession;prefillEmail:string|null}){
 const {busy,mutation}=settings;
const [grantEmail, setGrantEmail] = useState(OPERATOR_EMAIL);
const [grantAmount, setGrantAmount] = useState("100");
const [grantMsg, setGrantMsg] = useState<string | null>(null);
useEffect(()=>{if(prefillEmail)setGrantEmail(prefillEmail)},[prefillEmail]);
async function grantCredits(){const email=grantEmail.trim().toLowerCase(),delta=Math.trunc(Number(grantAmount)||0);if(!email||!delta){setGrantMsg("请填写邮箱和有效的积分数");return;}setGrantMsg(null);await mutation(async actor=>{const response=await fetch("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${actor}`},body:JSON.stringify({action:"adjust",email,delta,months:0})});const data=await response.json();if(!response.ok)throw Error(data.error||"操作失败");return data;},()=>setGrantMsg(`已给 ${email} ${delta>0?"增加":"扣减"} ${Math.abs(delta)} 积分`),undefined,error=>setGrantMsg(error.message));}
return <>
      {section === "credits" && (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">管理员 · 积分计费</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            仅管理员可见
          </span>
        </div>

        <div className="mb-5 rounded-2xl border bg-card p-6"><h2 className="text-sm font-semibold">计费与充值开关</h2><p className="mt-2 text-sm text-muted-foreground">统一管理功能价格、成本、计费开关、注册赠送及大额确认门槛。</p><Link href="/admin/billing" className="mt-3 inline-block text-sm text-primary underline">打开计费管理</Link></div>
        {/* 加/减积分 */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            给账号加 / 减积分
          </div>
          <p className="text-xs text-muted-foreground">
            填邮箱和数值(正=加,负=减),永久有效不过期。给自己充就填自己的账号邮箱
            (单用户模式默认已预填站长账号邮箱)。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="账号邮箱"
              className="min-w-[220px] flex-1"
            />
            <Input
              value={grantAmount}
              inputMode="numeric"
              onChange={(e) =>
                setGrantAmount(e.target.value.replace(/[^0-9-]/g, ""))
              }
              placeholder="100"
              className="w-24"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void grantCredits()}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              执行
            </Button>
          </div>
          {grantMsg && (
            <p className="text-[12.5px] font-medium text-c-text2">{grantMsg}</p>
          )}
        </div>
      </div>
      )}

</>;
}
