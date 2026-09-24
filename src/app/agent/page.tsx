import { redirect } from "next/navigation";

// /agent 任务模式已收编进统一工作台 /dashboard:对话 + 历史会话抽屉全覆盖。
export default function AgentPage() {
  redirect("/dashboard");
}
