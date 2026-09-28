import { WorkbenchClient } from "@/components/home/workbench-client";
import { BRAND } from "@/lib/brand";

// 顶栏「工作台」= 统一入口:空态门户(问候/统计/快捷入口/最近作品/模板库),
// 大输入框发送后同页渐变为 Agent 对话。原 /brain 已 302 收敛到此页。
// 模板库原为独立 /templates 页,已收编至本页 #templates 锚点(该路由重定向至此)。
export const metadata = { title: `工作台 — ${BRAND}` };

export default function DashboardPage() {
  return <WorkbenchClient />;
}
