"use client";
import {useFeatureBilling} from "@/lib/billing/preview";

import * as React from "react";
import { Smile } from "lucide-react";
import { ToolWorkspace, ToolChips } from "@/components/tools/tool-workspace";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/locale-context";
import { authHeader } from "@/lib/supabase";

const ACCENT = "#2E7CF6"; // 抠头像(蓝)

export function AvatarClient() {
  const billing=useFeatureBilling("tool.avatar",{});
  const { user } = useAuth();
  const { locale } = useI18n();
  const L = (z: string, e: string) => (locale === "en" ? e : z);
  const [bgColor, setBgColor] = React.useState("白");

  const controls = (
    <>
      <ToolChips
        label={L("输出背景", "Output background")}
        options={[
          { value: "白", label: L("白", "White") },
          { value: "黑", label: L("黑", "Black") },
          { value: "透明", label: L("透明", "Transparent") },
        ]}
        value={bgColor}
        onChange={setBgColor}
        accent={ACCENT}
      />

    </>
  );

  return (
    <ToolWorkspace
      name={L("抠头像", "AI Avatar")}
      desc={L("人像、证件照精准抠取,自动补光", "Precise portrait & ID-photo cutout with auto fill light")}
      Icon={Smile}
      tint="var(--c-tint-b)"
      accent={ACCENT}
      category="avatar"
      regenLabel={L("以此图再生成", "Regenerate from this image")}
      cost={billing.cost}
      action={L("开始抠图", "Start cutout")}
      checker
      controls={controls}
      onProcess={async (file) => {
        const fd = new FormData();
        fd.append("image", file);
        fd.append("bg", bgColor === "白" ? "white" : bgColor === "黑" ? "black" : "transparent");
        if (user) fd.append("email", user.email);
        const res = await billing.submit("/api/avatar", {
          method: "POST",
          headers: await authHeader(),
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error ?? "抠图失败");
        return { url: data.url, user: data.user, creditsUsed: data.creditsUsed, replayed: data.replayed === true };
      }}
    />
  );
}
