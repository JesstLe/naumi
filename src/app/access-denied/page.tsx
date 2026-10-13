import Link from "next/link";
import { ShieldOff } from "lucide-react";
export default function AccessDeniedPage() {
  return <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
    <ShieldOff className="h-10 w-10 text-slate-400" /><h1 className="text-xl font-semibold">此页面尚未授权</h1>
    <Link href="/account" className="rounded-xl border bg-white px-5 py-2 text-sm text-slate-700 hover:bg-slate-50">返回我的账户</Link>
  </section>;
}
