import type { Metadata } from "next";
import { WorkbenchClient } from "@/components/labs/workbench-client";

// 隐藏内部工具:无导航入口,logo 连点 5 次解锁后才能访问;不进索引。
export const metadata: Metadata = {
  title: "生图工作台",
  robots: { index: false, follow: false },
};

export default function LabsWorkbenchPage() {
  return <WorkbenchClient />;
}
