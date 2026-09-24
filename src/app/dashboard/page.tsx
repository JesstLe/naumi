import { WorkbenchClient } from "@/components/home/workbench-client";
import { pickHomepageImages } from "@/lib/homepage-picks";
import { BRAND } from "@/lib/brand";

// 顶栏「工作台」= 统一入口:空态门户(问候/统计/快捷入口/最近作品),
// 大输入框发送后同页渐变为 Agent 对话。原 /brain 已 302 收敛到此页。
export const revalidate = 86400;
export const metadata = { title: `工作台 — ${BRAND}` };

export default async function DashboardPage() {
  const { showcase } = await pickHomepageImages();
  return <WorkbenchClient hot={showcase} />;
}
