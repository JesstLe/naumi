"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { authHeader } from "@/lib/supabase";
import { copyText } from "@/lib/clipboard";

type UpdateInfo = {
  current: string; latest: string; currentLabel: string; latestLabel: string;
  updateAvailable: boolean; reachable: boolean; updateCmd: string;
};

export function DeployCenter({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const [info, setInfo] = React.useState<UpdateInfo | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void authHeader().then(headers => fetch("/api/admin/update-check", { headers }))
      .then(async response => response.ok ? await response.json() : null)
      .then(result => { if (!cancelled) setInfo(result); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <Shell embedded={embedded}>
      <h1 className="text-2xl font-semibold">部署与更新</h1>
      <p className="mt-2 text-sm text-c-text3">Naumi 统一提供全部产品功能。接口、账号、积分和品牌可在后台配置。</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link href="/admin">管理配置</Link></Button>
        <Button asChild variant="outline"><Link href="/cardkeys">兑换码管理</Link></Button>
      </div>
      {info ? <UpdateCard info={info} toast={toast} /> : <p className="mt-5 text-sm text-c-text3">正在检查应用更新…</p>}
    </Shell>
  );
}

function UpdateCard({
  info,
  toast,
}: {
  info: UpdateInfo;
  toast: (text: string, kind?: "success" | "error" | "info") => void;
}) {
  return (
    <div
      className={`mt-5 rounded-xl border p-4 ${
        info.updateAvailable ? "border-acc bg-acc/5" : "border-c-line"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-c-text">
          {info.updateAvailable ? "🎉 有新版本可更新" : "✓ 已是最新版本"}
        </span>
        <span className="text-[11.5px] text-c-text3">
          当前版本 {info.currentLabel}
        </span>
      </div>
      {info.updateAvailable && (
        <>
          <p className="mt-1.5 text-[12px] leading-relaxed text-c-text3">
            最新 {info.latestLabel}。在服务器的项目目录执行下面命令即可更新
            <b className="text-c-text2">(数据不会丢失)</b>:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-c-subtle2 px-2.5 py-1.5 font-mono text-[12px] text-c-text2">
              {info.updateCmd}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const ok = await copyText(info.updateCmd);
                toast(
                  ok ? "更新命令已复制" : "复制失败,请手动选择",
                  ok ? "success" : "error"
                );
              }}
            >
              复制
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── 外壳:按 embedded 切换页级包裹 ──
 * embedded=false(独立页 /deploy):min-h-screen 满屏底色 + 外层大 padding,与原样一致。
 * embedded=true(后台内嵌):后台内容区已有底色与内边距,这里只用普通容器包住内容。 */
function Shell({
  embedded,
  children,
}: {
  embedded: boolean;
  children: React.ReactNode;
}) {
  if (embedded) return <div>{children}</div>;
  return (
    <div className="min-h-screen bg-c-bg">
      <div className="w-full px-5 py-7 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
