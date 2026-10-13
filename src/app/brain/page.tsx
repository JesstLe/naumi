import { redirect } from "next/navigation";

// /brain 已收敛进统一工作台 /dashboard(空态门户 ↔ 发送后对话同页渐变)。
// 旧链接与 ?prompt= 原样透传,保证存量入口(收藏/外链)不断链。
export default async function BrainPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value.length > 0) sp.set(key, value[0]);
  }
  const qs = sp.toString();
  redirect(qs ? `/agent?${qs}` : "/agent");
}
