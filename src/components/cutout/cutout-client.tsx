"use client";
import {useFeatureBilling} from "@/lib/billing/preview";
import {FeatureImageResolution} from '@/components/tools/feature-image-resolution';

import * as React from "react";
import { Scissors } from "lucide-react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/locale-context";
import { useImageQuality } from "@/lib/image-quality-context";
import { chosenFeatureModel } from "@/lib/model-config/feature-client";
import { REMOVE_BACKGROUND_PROMPT } from "@/lib/imagegen/background-removal";
import { runToolImageEdit,ToolImageEditFailed } from "@/lib/imagegen/tool-image-edit";
import {WORKSPACE_SELECTION} from "@/lib/saas/workspace-client";

const ACCENT = "#2E7CF6"; // 图像处理(蓝)

export function CutoutClient() {
  const [resolution,setResolution]=React.useState('1K');
  const billing=useFeatureBilling("image.generate",{resolution});
  const {quality}=useImageQuality("image.generate");
  const { user } = useAuth();
  const account=React.useRef(user?.email);account.current=user?.email;
  const mounted=React.useRef(true);
  const failed=React.useRef<ToolImageEditFailed|null>(null);
  const [retrying,setRetrying]=React.useState(false);
  React.useEffect(()=>{failed.current=null;setRetrying(false);},[user?.email]);
  React.useEffect(()=>{const reset=()=>{failed.current=null;setRetrying(false);};window.addEventListener(WORKSPACE_SELECTION,reset);return()=>window.removeEventListener(WORKSPACE_SELECTION,reset);},[]);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const { locale } = useI18n();
  const L = (z: string, e: string) => (locale === "en" ? e : z);

  return (
    <ToolWorkspace
      name={L("AI 抠图", "AI Cutout")}
      desc={L("移除背景，输出透明 PNG", "Remove background and export transparent PNG")}
      Icon={Scissors}
      tint="var(--c-tint-b)"
      accent={ACCENT}
      category="cutout"
      feature="image.generate"
      resolution={resolution}
      controls={<FeatureImageResolution feature="image.generate" value={resolution} onChange={setResolution}/>}
      regenLabel={L("以此图重新抠", "Re-cut from this image")}
      cost={billing.cost}
      action={retrying?L("重新抠图","Retry cutout"):L("开始抠图", "Start cutout")}
      checker
      onProcess={async (file) => {
        if(!user)throw new Error("请先登录");
        const owner=user.email;
        const fd = new FormData();
        fd.append("image", file);
        fd.append("resolution",resolution);
        fd.append("ratio","auto");fd.append("quality",quality);fd.append("count","1");
        fd.append("prompt",REMOVE_BACKGROUND_PROMPT);fd.append("transparent","1");
        const model=chosenFeatureModel("image.generate");if(model)fd.append("model",model);
        // Only this explicit click can release a confirmed failed receipt.
        // A scope change makes its captured callback reject before any POST.
        if(failed.current){await failed.current.retry();failed.current=null;setRetrying(false);}
        try{return await runToolImageEdit(fd,{owner,isCurrent:()=>mounted.current&&account.current===owner});}
        catch(error){if(error instanceof ToolImageEditFailed){failed.current=error;setRetrying(true);}throw error;}
      }}
    />
  );
}
