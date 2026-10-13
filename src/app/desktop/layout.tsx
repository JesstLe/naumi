import type { Metadata } from "next";
import { Suspense } from "react";
import { DesktopShell } from "@/components/desktop/desktop-shell";
import "./desktop.css";
export const metadata: Metadata = { title: "Naumi · 工作空间", robots: { index: false, follow: false } };
export default function DesktopLayout({children}: {children: React.ReactNode}) {
  return <Suspense fallback={<div className="p-8 text-sm">加载工作空间…</div>}><DesktopShell>{children}</DesktopShell></Suspense>;
}
