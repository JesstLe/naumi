"use client";
import * as React from "react";
import { Check, Cloud, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * 云端托管开通弹窗(MVP:人工开通)。
 * 流程:前往官方站提交云端托管需求 → 沟通域名/品牌/算力方案 → 1 个工作日内交付
 * 独立白标实例。自助支付/自动开通(L3)在国内官方站进行,施工计划见
 * docs/cloud-provisioning.md。
 * 非购买站(海外官方站、自托管实例)打开本弹窗时,主按钮引导到国内官方站开通。
 */
// 外部开通入口必须显式配置，未配置时不提供猜测的购买链接。
const CLOUD_BUY_URL = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_CLOUD_BUY_URL || "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
})();

const BENEFITS = [
  "免部署 · 自动更新,无需自己的服务器",
  "大陆可用 · 无需自备中转,连模型开箱即通",
  "独立实例 · 绑定你自己的域名(CNAME)",
  "全白标:自有品牌名 / Logo,无平台署名",
  "含算力积分,超出按量购买",
  "优先支持 · 一对一开通对接",
];

export function CloudModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // 是否就在购买站上(挂载后判 host,SSR 期间按“不是”渲染,避免水合不一致)
  const [onBuyHost, setOnBuyHost] = React.useState(false);
  React.useEffect(() => {
    setOnBuyHost(!!CLOUD_BUY_URL && window.location.host === new URL(CLOUD_BUY_URL).host);
  }, []);

  return (
    <Modal open={open} onClose={onClose} width={460}>
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-c-tint-b">
          <Cloud className="h-5 w-5 text-c-blue" />
        </span>
        <div>
          <h3 className="text-[16px] font-bold text-c-text">云端托管开通</h3>
          <p className="text-[12.5px] text-c-text3">
            <span className="font-bold text-c-text">¥3,999</span> /年起 · 免运维
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {BENEFITS.map((b) => (
          <li key={b} className="flex items-start gap-2 text-[13px] text-c-text2">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-c-blue" />
            {b}
          </li>
        ))}
      </ul>

      {/* 开通步骤 */}
      <div className="mt-4 rounded-xl bg-c-subtle2 p-3.5">
        <p className="text-[12px] font-semibold text-c-text2">开通流程</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[12.5px] leading-relaxed text-c-text3">
          <li>前往官方站提交云端托管需求</li>
          <li>沟通域名、品牌与算力方案</li>
          <li>1 个工作日内开通交付你的专属实例</li>
        </ol>
      </div>

      {CLOUD_BUY_URL ? <Button variant="primary" className="mt-4 w-full" asChild>
        <a
          href={onBuyHost ? "/deploy" : CLOUD_BUY_URL}
          target={onBuyHost ? undefined : "_blank"}
          rel={onBuyHost ? undefined : "noopener noreferrer"}
        >
          <ExternalLink className="h-4 w-4" />
          前往官方站开通云端
        </a>
      </Button> : <Button variant="primary" className="mt-4 w-full" disabled>
        联系管理员开通云端
      </Button>}
    </Modal>
  );
}
