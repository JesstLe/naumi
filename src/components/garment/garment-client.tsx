"use client";
import {useFeatureBilling} from "@/lib/billing/preview";

import * as React from "react";
import { Shirt } from "lucide-react";
import { ToolWorkspace, ToolChips } from "@/components/tools/tool-workspace";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/locale-context";
import { authHeader } from "@/lib/supabase";

const ACCENT = "#7C3AED"; // 服装提取(紫)

export function GarmentClient() {
  const billing=useFeatureBilling("tool.garment",{});
  const { user } = useAuth();
  const { locale } = useI18n();
  const L = (z: string, e: string) => (locale === "en" ? e : z);
  const [detail, setDetail] = React.useState("标准");

  const controls = (
    <>
      <ToolChips
        label={L("保留细节", "Detail")}
        options={[
          { value: "标准", label: L("标准", "Standard") },
          { value: "精细", label: L("精细", "Fine") },
        ]}
        value={detail}
        onChange={setDetail}
        accent={ACCENT}
      />

    </>
  );

  return (
    <ToolWorkspace
      name={L("服装提取", "Garment Photo")}
      desc={L("从模特图中提取平铺服装图", "Extract a flat-lay garment image from model photos")}
      Icon={Shirt}
      tint="var(--c-tint-v)"
      accent={ACCENT}
      category="garment"
      regenLabel={L("以此图再提取", "Extract from this image")}
      cost={billing.cost}
      action={L("提取平铺图", "Extract flat lay")}
      controls={controls}
      onProcess={async (file) => {
        const fd = new FormData();
        fd.append("image", file);
        // 后端默认白底(bg 非 black/transparent 即白底),保持原契约。
        fd.append("bg", "white");
        fd.append("prompt", detail === "精细" ? "Preserve fine fabric texture, stitching, buttons and print details with high fidelity." : "Preserve the garment shape, color and main details.");
        if (user) fd.append("email", user.email);
        const res = await billing.submit("/api/garment", {
          method: "POST",
          headers: await authHeader(),
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error ?? "提取失败");
        return { url: data.url, user: data.user, creditsUsed: data.creditsUsed };
      }}
    />
  );
}
