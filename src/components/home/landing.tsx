"use client";

import { cdnUrl } from "@/lib/cdn";
import Link from "next/link";
import {
  Sparkles,
  Layers,
  Scissors,
  Workflow,
  Shirt,
  Megaphone,
  ArrowRight,
  Check,
} from "lucide-react";
import { Media } from "@/components/media";
import { HeroCompare } from "@/components/home/hero-compare";
import { useI18n } from "@/lib/i18n/locale-context";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { BRAND } from "@/lib/brand";
import type { PickedTemplate } from "@/lib/homepage-picks";

// hero「商品原图 → 可上架成片」对比素材(本地资产,国内加载快;与 /suite 示例同源)。
const HERO_BEFORE = "/demos/hero-before.png";
const HERO_AFTER = "/demos/hero-after.png";

export function Landing({ hot }: { hot: PickedTemplate[] }) {
  const { locale } = useI18n();
  const { user } = useAuth();
  const { openAuth } = useAuthModal();
  const L = (zh: string, en: string) => (locale === "en" ? en : zh);

  const start = () => {
    if (user) {
      window.location.href = "/generate";
    } else {
      openAuth();
    }
  };

  // 能力区:六个能力作为「全流程」的六个节点,时间线呈现(非卡片网格)。
  const flow = [
    {
      Icon: Sparkles,
      title: L("AI 生图", "AI generation"),
      desc: L("一句话或参考图,几秒出商业图。", "One sentence or a reference — shots in seconds."),
    },
    {
      Icon: Layers,
      title: L("一键套图", "One-click suite"),
      desc: L("主图 + 副图 + 详情页,整套素材一次出。", "Hero + secondary + detail set in one go."),
    },
    {
      Icon: Scissors,
      title: L("抠图改图", "Cutout & edit"),
      desc: L("抠图、局部改图、变清晰、风格转换。", "Cutout, inpaint, upscale, restyle."),
    },
    {
      Icon: Workflow,
      title: L("节点式画布", "Node canvas"),
      desc: L("血缘画布上编排迭代,版本派生一目了然。", "Compose and iterate on a lineage canvas."),
    },
    {
      Icon: Shirt,
      title: L("服装电商", "Apparel"),
      desc: L("上身、提取、3D 服装图、去皱。", "Try-on, extract, 3D garment, de-wrinkle."),
    },
    {
      Icon: Megaphone,
      title: L("营销工具", "Marketing"),
      desc: L("标题、印花、海报、拼接、多语言。", "Titles, prints, posters, translation."),
    },
  ];

  return (
    <div className="w-full">
      {/* ───────── Hero ───────── */}
      <section className="bg-aurora relative overflow-hidden">
        <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-black leading-[1.12] tracking-tight text-foreground sm:text-6xl">
            {L("为「你的商品」", "For your products:")}
            <br />
            {L("交付「整套可上架素材」", "a full listing-ready set")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {L(
              `上传商品图,${BRAND} 自动产出 1 主图 + 4 副图 + 8 张详情页,整套可直接上架。`,
              `Upload a product photo — ${BRAND} delivers 1 hero, 4 secondary and 8 detail images, ready to list.`
            )}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-semibold text-white shadow-[var(--shadow-btn)] transition-[filter] [background:var(--grad-acc)] hover:brightness-[1.07]"
            >
              {L("开始一个任务", "Start a task")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* 随手拍 → AI 成片 对比(可拖动) */}
          <div className="mx-auto mt-12 w-full max-w-[1040px]">
            <HeroCompare
              before={HERO_BEFORE}
              after={HERO_AFTER}
              beforeLabel={L("商品原图", "Snapshot")}
              afterLabel={L("AI 成片", "AI result")}
            />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {L(
                "← 拖动对比 · 随手拍的产品图，一句话变成可上架的商业大片",
                "← Drag to compare · a quick snapshot becomes a listing-ready hero shot"
              )}
            </p>
          </div>
        </div>
      </section>

      {/* ───────── 成片展示 ───────── */}
      {hot.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {hot.slice(0, 6).map((tpl) => (
              <Link
                key={tpl.id}
                href={user ? `/generate?template=${encodeURIComponent(tpl.id)}` : "#"}
                onClick={(e) => {
                  if (!user) {
                    e.preventDefault();
                    openAuth();
                  }
                }}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] transition-transform hover:-translate-y-1"
              >
                <Media
                  src={cdnUrl(tpl.image)}
                  alt={tpl.title}
                  gradient={tpl.gradient}
                  thumbWidth={480}
                  ratio="aspect-[3/4]"
                  className="rounded-none border-0"
                />
                <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                  {L("AI 成片", "AI result")}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ───────── 能力区:全流程时间线 ───────── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {L("覆盖电商出图全流程", "The whole e-commerce imaging pipeline")}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted-foreground sm:text-base">
          {L(
            "从一张随手拍到整套可上架素材,六个环节一线贯通。",
            "From a quick snapshot to a listing-ready set — six steps, one line."
          )}
        </p>

        <div className="relative mt-14">
          {/* 连接线:移动端纵向 / 桌面端横向(穿过各节点圆心) */}
          <div
            aria-hidden
            className="absolute bottom-6 left-6 top-6 w-px bg-border lg:left-6 lg:right-6 lg:top-6 lg:bottom-auto lg:h-px lg:w-auto"
          />
          <ol className="grid gap-10 lg:grid-cols-6 lg:gap-5">
            {flow.map((f, i) => (
              <li key={f.title} className="relative pl-20 lg:pl-0">
                {/* 节点:圆形图标压在连接线上 */}
                <span className="absolute left-0 top-0 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-primary shadow-[var(--shadow-card)] lg:relative">
                  <f.Icon className="h-5 w-5" />
                </span>
                <p className="text-[12px] font-semibold tracking-widest text-primary">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-1 text-[15px] font-bold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>


      {/* ───────── 画布工作流展示 ───────── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid items-center gap-8 overflow-hidden rounded-3xl border border-c-border bg-c-card p-6 shadow-card sm:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
          {/* 左:文案 */}
          <div className="flex flex-col gap-4">
            <span className="self-start rounded-full bg-[#F4ECFE] px-3 py-1.5 text-[12px] font-semibold text-[#9869F2]">
              {L("画布工作流", "Canvas workflow")}
            </span>
            <h2 className="text-[26px] font-bold leading-snug tracking-tight text-c-text sm:text-[28px]">
              {L("把生图、抠图、套图", "Chain generation, cutout & suites")}
              <br />
              {L("串成一条可复用的流程", "into one reusable flow")}
            </h2>
            <p className="text-[14.5px] leading-relaxed text-c-text3">
              {L(
                "节点式画布让你像搭积木一样组合 AI 步骤:上传参考 → 生成 → 批量套图 → 导出。流程可保存、可复用,一次搭好,长期受益。",
                "Compose AI steps like building blocks: upload → generate → batch suite → export. Save and reuse the flow — build once, benefit long-term."
              )}
            </p>
            <ul className="mt-1 flex flex-col gap-2.5">
              {[
                L("可视化节点 · 连线自动跟随", "Visual nodes · links auto-follow"),
                L("一次配置,批量出图", "Configure once, batch output"),
                L("流程模板一键套用", "One-click flow templates"),
              ].map((tx) => (
                <li
                  key={tx}
                  className="flex items-center gap-2.5 text-[13.5px] text-c-text2"
                >
                  <Check className="h-4 w-4 flex-none text-acc" strokeWidth={2.4} />
                  {tx}
                </li>
              ))}
            </ul>
          </div>
          {/* 右:画布预览(深色点阵 + 连线 + 节点卡;流程依次点亮动画) */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[#23252C] bg-[#0E0F13] [background-image:radial-gradient(#1F2024_1px,transparent_1px)] [background-size:24px_24px]">
            <style
              dangerouslySetInnerHTML={{
                __html: `
@keyframes nvCvDraw{0%{stroke-dashoffset:200}45%,100%{stroke-dashoffset:0}}
@keyframes nvCvDraw3{0%,50%{stroke-dashoffset:120}80%,100%{stroke-dashoffset:0}}
@keyframes nvCvLit{0%,100%{border-color:#2A2C34;filter:none}8%,22%{border-color:#6366F1;filter:drop-shadow(0 0 8px rgba(99,102,241,.55))}}
@keyframes nvCvEng{0%,100%{border-color:#4F46E5;box-shadow:0 0 0 0 rgba(79,70,229,0)}40%{border-color:#818CF8;box-shadow:0 0 0 6px rgba(79,70,229,.3)}}
@keyframes nvCvOut{0%,60%{filter:none;transform:scale(1)}72%{filter:drop-shadow(0 0 12px rgba(255,255,255,.5));transform:scale(1.07)}88%,100%{filter:none;transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.nv-cv-anim [style*=animation]{animation:none!important}}
`,
              }}
            />
            <div className="nv-cv-anim absolute inset-0">
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 400 300"
                preserveAspectRatio="none"
              >
                <path
                  d="M120 90 C 180 90 160 150 215 150"
                  fill="none"
                  stroke="#6366F1"
                  strokeWidth="2.2"
                  strokeDasharray="200"
                  style={{
                    strokeDashoffset: 200,
                    animation: "nvCvDraw 3.6s ease-in-out infinite .4s",
                  }}
                />
                <path
                  d="M120 210 C 180 210 160 150 215 150"
                  fill="none"
                  stroke="#6366F1"
                  strokeWidth="2.2"
                  strokeDasharray="200"
                  style={{
                    strokeDashoffset: 200,
                    animation: "nvCvDraw 3.6s ease-in-out infinite .4s",
                  }}
                />
                <path
                  d="M320 150 C 350 150 350 110 372 110"
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="2.2"
                  strokeDasharray="120"
                  style={{
                    strokeDashoffset: 120,
                    animation: "nvCvDraw3 3.6s ease-in-out infinite 1.8s",
                  }}
                />
              </svg>
              {/* 提示词节点 */}
              <div
                className="absolute left-[6%] top-[19%] flex h-[50px] w-[78px] items-center justify-center rounded-[9px] border border-[#2A2C34] bg-[#191A20] text-[10px] font-semibold text-[#A6AAB4]"
                style={{ animation: "nvCvLit 3.6s ease-in-out infinite" }}
              >
                {L("提示词", "Prompt")}
              </div>
              {/* 参考图节点 */}
              <div
                className="absolute left-[6%] top-[59%] flex h-[50px] w-[78px] items-center justify-center rounded-[9px] border border-[#2A2C34] bg-[#191A20] text-[10px] font-semibold text-[#A6AAB4]"
                style={{ animation: "nvCvLit 3.6s ease-in-out infinite" }}
              >
                {L("参考图", "Reference")}
              </div>
              {/* 生成引擎节点(中心) */}
              <div
                className="absolute left-1/2 top-1/2 w-[120px] -translate-x-1/2 -translate-y-1/2 rounded-[11px] border border-acc bg-[#191A20] p-3"
                style={{ animation: "nvCvEng 3.6s ease-in-out infinite 1.4s" }}
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 rounded-[4px] [background:linear-gradient(160deg,#6366F1,#4F46E5)]" />
                  <span className="text-[11px] font-semibold text-[#ECEDF1]">
                    {L("生成引擎", "Engine")}
                  </span>
                </div>
                <div className="mb-1.5 h-[7px] rounded-[3px] bg-[#2A2C34]" />
                <div className="h-[7px] w-[70%] rounded-[3px] bg-[#2A2C34]" />
              </div>
              {/* 成品节点 */}
              <div
                className="absolute right-[3.5%] top-[29%] h-[56px] w-[56px] rounded-[9px] [background:radial-gradient(120%_90%_at_50%_16%,#FBFBFD,#DEE2EA)] shadow-[0_8px_18px_-6px_rgba(0,0,0,.5)]"
                style={{ animation: "nvCvOut 3.6s ease-in-out infinite 2.4s" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ───────── 底部 CTA ───────── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="bg-dark-module relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:py-16">
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
            {L("现在就开始,免费出第一张图", "Start now — your first image is free")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">
            {L(
              "一句话,AI 直接出图,覆盖电商出图全流程。",
              "One sentence, AI delivers — the whole e-commerce imaging pipeline."
            )}
          </p>
          <button
            type="button"
            onClick={start}
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 text-[15px] font-bold text-[#16181D] transition-transform hover:scale-[1.03]"
          >
            {L("免费开始创作", "Start creating free")}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
