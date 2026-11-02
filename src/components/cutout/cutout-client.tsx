"use client";
import {useFeatureBilling} from "@/lib/billing/preview";

import * as React from "react";
import { Scissors } from "lucide-react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/locale-context";
import { authHeader } from "@/lib/supabase";

const ACCENT = "#2E7CF6"; // 图像处理(蓝)

export function CutoutClient() {
  const billing=useFeatureBilling("tool.cutout",{ quality: "medium" });
  const { user } = useAuth();
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
      regenLabel={L("以此图重新抠", "Re-cut from this image")}
      cost={billing.cost}
      action={L("开始抠图", "Start cutout")}
      checker
      onProcess={async (file) => {
        const fd = new FormData();
        fd.append("image", file);
        // quality 是图片模型档位，不再混用已退役的分割器 fine/fast 标签。
        fd.append("quality", "medium");
        fd.append("title", file.name.replace(/\.[^.]+$/, "") || "抠图");
        fd.append("category", "cutout");
        if (user) fd.append("email", user.email);
        const res = await billing.submit("/api/cutout", {
          method: "POST",
          headers: await authHeader(),
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.ok || !data.url) {
          throw new Error(data.error ?? "抠图失败");
        }
        return { url: data.url, user: data.user, creditsUsed: data.creditsUsed, replayed: data.replayed === true };
      }}
    />
  );
}
