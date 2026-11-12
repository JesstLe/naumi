"use client";
import { useFeatureAccess } from "@/lib/feature-access/client";


import * as React from "react";
import Link from "next/link";
import { Search, ArrowUpRight } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import { toolCovers } from "@/components/workspace/tool-covers";
import directory from "@/components/workspace/tool-directory.module.css";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/locale-context";
import {
  TOOLS,
  TOOL_CATEGORIES,
  type ToolCategory,
  type ToolMeta,
} from "@/lib/tool-meta";

/** ToolCard(spec B.10):白卡 + 左 44 色块图标 + 标题/描述 + 右 chevron。 */
export function ToolCard({ tool }: { tool: ToolMeta }) {
  const { canPage } = useFeatureAccess();
  const { locale } = useI18n();
  const L = (z: string, e: string) => (locale === "en" ? e : z);
  const cover = toolCovers[tool.slug];
  const inner = <>
    {cover ? <CachedImage src={`/demos/workbench-v2/${cover}.webp`} alt="" className={directory.cover}/> : <tool.Icon className={directory.cover}/>}
    <span className={directory.name}><span>{L(tool.key, tool.en)}</span>{tool.live === false && <span className={directory.soon}>{L("即将上线", "Soon")}</span>}</span>
    <ArrowUpRight className={directory.arrow}/>
  </>;
  const cls = directory.card;

  if (!canPage(tool.href)) return null;
  if (tool.live === false) {
    return (
      <div className={cn(cls, "cursor-default opacity-70 hover:translate-y-0 hover:shadow-none")}>
        {inner}
      </div>
    );
  }
  return (
    <Link href={tool.href} prefetch={false} className={cls}>
      {inner}
    </Link>
  );
}

export function CreateHubPage() {
  const { canPage } = useFeatureAccess();
  const { locale } = useI18n();
  const L = (z: string, e: string) => (locale === "en" ? e : z);
  const [filter, setFilter] = React.useState<"全部" | ToolCategory>("全部");
  const [q, setQ] = React.useState("");

  const chips: ("全部" | ToolCategory)[] = [
    "全部",
    ...TOOL_CATEGORIES.map((c) => c.name),
  ];

  const query = q.trim().toLowerCase();
  const sections = TOOL_CATEGORIES.filter(
    (c) => filter === "全部" || filter === c.name
  )
    .map((c) => ({
      cat: c,
      tools: TOOLS.filter(
        (t) =>
          canPage(t.href) && t.category === c.name &&
          (!query ||
            t.key.toLowerCase().includes(query) ||
            t.en.toLowerCase().includes(query) ||
            t.desc.toLowerCase().includes(query))
      ),
    }))
    .filter((s) => s.tools.length > 0);

  return (
    <div className="workspace-page w-full px-5 py-7 sm:px-6 lg:px-8">
      {/* Header */}
      <div data-page-header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-c-text">{L("创作工具", "Creative tools")}</h1>
        </div>
        <div className="relative w-full sm:w-[300px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-c-text4" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={L("搜索工具", "Search tools")}
            placeholder={L("搜索工具…", "Search tools…")}
            className="h-10 w-full rounded-[10px] border border-c-border2 bg-c-card pl-9 pr-3 text-[13px] text-c-text placeholder:text-c-text4 focus-visible:border-acc focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(79,70,229,.12)]"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="workspace-filter-row mt-5">
        {chips.map((c) => {
          const active = filter === c;
          const en =
            c === "全部"
              ? "All"
              : TOOL_CATEGORIES.find((x) => x.name === c)?.en ?? c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-full px-3.5 py-2 text-[12.5px] font-medium transition-colors",
                active
                  ? "bg-acc text-white"
                  : "border border-c-border2 bg-c-card text-c-text2 hover:bg-c-subtle"
              )}
            >
              {L(c, en)}
            </button>
          );
        })}
      </div>

      {/* Grouped sections */}
      <div className="mt-7 space-y-8">
        {sections.map(({ cat, tools }) => (
          <section key={cat.name}>
            <div className="mb-3 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: cat.dot }}
              />
              <h2 className="text-[15px] font-semibold text-c-text">
                {L(cat.name, cat.en)}
              </h2>
              <span className="rounded-full bg-c-subtle px-2 py-0.5 text-[11px] font-medium text-c-text3">
                {tools.length}
              </span>
            </div>
            <div className="workspace-catalog-grid">
              {tools.map((t) => (
                <ToolCard key={t.slug} tool={t} />
              ))}
            </div>
          </section>
        ))}

        {sections.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <Search className="h-7 w-7 text-c-text4" />
            <p className="text-[14px] text-c-text3">
              {L("没有匹配的工具", "No matching tools")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
