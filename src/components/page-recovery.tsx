"use client";

import { useEffect, useState } from "react";
import { clearCachesAndReload, isStaleAssetError, reloadOnceForStaleAssets } from "@/lib/browser-storage/recovery";

type Props = { error: Error & { digest?: string }; reset: () => void; standalone?: boolean };

// global-error has no locale provider; the locale cookie is the same source the layout uses.
const english = () => typeof document !== "undefined" && (document.documentElement.lang === "en" || /(?:^|;\s*)naumi_locale=en(?:;|$)/.test(document.cookie));

/** Shared fallback for app/error and app/global-error. A standalone render has
 * no layout CSS, so it uses inline styles only. */
export function PageRecovery({ error, reset, standalone = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    console.error(error);
    if (reloadOnceForStaleAssets(error)) setReloading(true);
  }, [error]);
  const en = english();
  const L = (zh: string, enText: string) => (en ? enText : zh);
  const stale = isStaleAssetError(error);
  const button = (primary: boolean): React.CSSProperties => ({
    padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer",
    border: primary ? "1px solid #4f46e5" : "1px solid #d9dfe7", background: primary ? "#4f46e5" : "#fff", color: primary ? "#fff" : "#252a33",
    opacity: busy ? 0.6 : 1,
  });
  return (
    <div role="alert" style={{ minHeight: standalone ? "100vh" : "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "24px 16px", textAlign: "center", color: "#252a33", background: standalone ? "#f5f6f8" : "transparent", fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>
        {reloading ? L("正在载入新版本…", "Loading the latest version…") : L("页面没有正常加载", "This page failed to load")}
      </div>
      {!reloading && (
        <div style={{ fontSize: 14, color: "#697383", maxWidth: 420 }}>
          {stale
            ? L("网站刚更新过，请刷新页面。", "The site was just updated. Please reload.")
            : L("可以先重试；仍然不行时，清理本机缓存后会重新从服务器读取，草稿和任务记录不受影响。", "Try again first. If it keeps failing, clearing the local cache reloads data from the server; drafts and task records are kept.")}
        </div>
      )}
      {!reloading && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" disabled={busy} style={button(true)} onClick={() => (stale ? window.location.reload() : reset())}>
            {stale ? L("刷新页面", "Reload") : L("重试", "Try again")}
          </button>
          <button type="button" disabled={busy} style={button(false)} onClick={() => { setBusy(true); void clearCachesAndReload(); }}>
            {busy ? L("正在清理…", "Clearing…") : L("清理缓存并刷新", "Clear cache and reload")}
          </button>
        </div>
      )}
      {error.digest && !reloading && <div style={{ fontSize: 12, color: "#9aa1ae" }}>{L("错误编号", "Error ID")} {error.digest}</div>}
    </div>
  );
}
