"use client";

import { Landing } from "@/components/home/landing";
import type { PickedTemplate } from "@/lib/homepage-picks";

/**
 * 首页对所有人一致 = 营销落地页 Landing(登录态无关,利于 SEO + 一致体验)。
 * 大 Agent 工作台在独立路由 /brain,不占首页。
 */
export function HomeGate({ hot }: { hot: PickedTemplate[] }) {
  return <Landing hot={hot} />;
}
