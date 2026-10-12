"use client";

import { cn } from "@/lib/utils";
import { useBrand } from "@/lib/brand-context";
import { useRef, useState } from "react";

// 隐藏工作台解锁:logo 连点 5 次(2.5s 内)写入一次性凭证,1 小时内有效。
// 凭证只存 localStorage,不进任何后端,过期后需重新连点解锁。
export const LABS_UNLOCK_KEY = "naumi:labs_unlock_at";
const LABS_UNLOCK_TTL_MS = 60 * 60 * 1000;

export function markLabsUnlocked() {
  try {
    window.localStorage.setItem(LABS_UNLOCK_KEY, String(Date.now()));
  } catch {
    // 隐私模式等 localStorage 不可用时静默放弃,不影响正常使用
  }
}

export function isLabsUnlocked(): boolean {
  try {
    const at = Number(window.localStorage.getItem(LABS_UNLOCK_KEY) || "0");
    return at > 0 && Date.now() - at < LABS_UNLOCK_TTL_MS;
  } catch {
    return false;
  }
}

export function Logo({ className }: { className?: string }) {
  // 运行时品牌:后台可改站点名 / Logo(DB 覆盖 → env 默认兜底),无需重新 build。
  const { name, logo, logoHasText } = useBrand();
  const clicksRef = useRef<number[]>([]);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  function showHint(text: string) {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 1800);
  }

  function handleLogoClick(e: React.MouseEvent) {
    const now = Date.now();
    const clicks = clicksRef.current.filter((t) => now - t < 2500);
    clicks.push(now);
    clicksRef.current = clicks;
    if (clicks.length < 5) {
      if (clicks.length >= 3) showHint(`再点 ${5 - clicks.length} 次…`);
      return;
    }
    clicksRef.current = [];
    // 第 5 击拦截外层 Link 跳转,原地解锁
    e.preventDefault();
    e.stopPropagation();
    markLabsUnlocked();
    showHint("已解锁 · /labs/workbench");
  }

  return (
    <div className={cn("relative flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        alt={name}
        onClick={handleLogoClick}
        className={cn(
          // wordmark (含文字) 用大点宽度;icon 用方形
          logoHasText ? "h-9 w-auto" : "h-8 w-auto rounded-lg",
          // 仅默认单色标随主题反白，不改变用户上传的彩色/白标图片。
          logo === "/brand/naumi/symbol-black.svg" && "dark:brightness-0 dark:invert"
        )}
      />
      {/* logo 已含品牌文字时不再渲染外置文字,避免重复 */}
      {!logoHasText && (
        <span className="text-lg font-bold tracking-tight">{name}</span>
      )}
      {hint && (
        <span className="absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded-md bg-c-card px-2 py-1 text-[11px] font-medium text-c-text shadow-[0_2px_8px_rgba(16,18,23,.12)]">
          {hint}
        </span>
      )}
    </div>
  );
}
