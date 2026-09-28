import { redirect } from "next/navigation";

// 模板库已收编进工作台(最近作品下方),旧路由重定向保留兼容(导航「模板」/落地页 CTA)。
export default function TemplatesPage() {
  redirect("/dashboard#templates");
}
