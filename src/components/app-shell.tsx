"use client";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";


import { usePathname } from "next/navigation";
import { AppRail } from "@/components/app-rail";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";
import { TOOLS } from "@/lib/tool-meta";
import "@/components/tools/tool-surface.css";
import {toolImageError} from "@/lib/tool-ui";
import {useToast} from "@/components/ui/toast";
import {useI18n} from "@/lib/i18n/locale-context";

/**
 * 全站工作台壳:左侧图标导航栏(手机为底部 tab)+ 右侧内容区。
 * - 登录/注册页:无壳(全屏)。
 * - 管理中心:使用独立管理导航，不叠加用户工作台导航。
 * - 画布页:有壳、无页脚(全屏沉浸由画布自身处理)。
 * - 其余页:壳 + 页脚(保留 ICP 备案等)。
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const { user } = useAuth();
  const { ready, canPage } = useFeatureAccess();
  const {toast}=useToast(),{locale}=useI18n();
  const noShell = path === "/brand-orb" || path === "/sign-in" || path === "/sign-up" || path === "/admin" || path.startsWith("/admin/");
  const isCanvas = path.startsWith("/canvas");
  const isToolPage = path === "/tools" || path === "/dashboard" || TOOLS.some(tool => tool.href === path);
  // 沉浸全屏(无页脚):画布 / 对话生成。生图/套图/工作台改成和工具页一致的自然流(带页脚)。
  const isImmersive = isCanvas || path.startsWith("/genchat");

  if (path === "/desktop" || path.startsWith("/desktop/")) return <>{children}</>;

  if (noShell) return <main className="min-h-screen">{children}</main>;

  return (
    <div className={isToolPage ? "tool-page" : undefined}>
      <AppRail />
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-300 ease-out",
          isCanvas ? "pb-0 md:pt-0" : "pb-[58px] md:pb-0 md:pt-[60px]"
        )}
      >
        <main className={cn("min-w-0 flex-1", isToolPage && "tool-page")}
          onChangeCapture={event=>{
            if(!isToolPage||path==="/competitors"||!(event.target instanceof HTMLInputElement)||event.target.type!=="file")return;
            const input=event.target,files=Array.from(input.files||[]);
            const limit=(file:File)=>path==="/video"?(file.type.startsWith("video/")?200:file.type.startsWith("audio/")?50:input.multiple||!input.hidden?20:12):path==="/packaging3d"?16:path==="/printfile"?20:path==="/titles"?8:12;
            const invalid=files.find(file=>toolImageError(file,limit(file)*1024*1024,input.accept||"image/*"));
            const max=invalid?limit(invalid)*1024*1024:12*1024*1024;
            const issue=invalid?toolImageError(invalid,max,input.accept||"image/*"):null;
            if(!issue)return;
            event.stopPropagation();input.value="";
            toast(issue==="size"?(locale==="en"?`Each file must be under ${max/1024/1024}MB`:`单个文件需小于${max/1024/1024}MB`):(locale==="en"?"Choose a supported file":"请选择支持的文件格式"),"error");
          }}>{user && !canPage(path) ? <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6"><h1 className="text-xl font-semibold">{ready ? "此页面尚未授权" : "正在加载权限"}</h1>{ready && <Link href="/account" className="rounded-xl border bg-white px-5 py-2 text-sm">返回我的账户</Link>}</section> : children}</main>
        {!isImmersive && <SiteFooter />}
      </div>
    </div>
  );
}
