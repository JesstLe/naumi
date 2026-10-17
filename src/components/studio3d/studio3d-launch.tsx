"use client";
import Link from "next/link";
import { ArrowUpRight, Box } from "lucide-react";
import { useFeatureAccess } from "@/lib/feature-access/client";

/** Lightweight entry: the home page never imports the WebGL engine. */
export function Studio3dLaunch({ desktop = false }: { desktop?: boolean }) {
  const { can } = useFeatureAccess();
  if (!can("studio3d")) return null;
  return (
    <Link
      href={desktop ? "/desktop/studio3d" : "/studio3d"}
      prefetch={false}
      className="mb-5 flex items-center gap-3 rounded-xl border border-[#dfe7d9] bg-[#f3f7ee] px-5 py-4 text-[#405e38]"
    >
      <Box size={21} />
      <span className="flex-1 text-sm font-semibold">3D 工作台</span>
      <span className="hidden text-xs text-[#819176] sm:inline">
        产品 · 材质 · 渲染
      </span>
      <ArrowUpRight size={17} />
    </Link>
  );
}
