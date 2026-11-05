"use client";
import {createPortal} from "react-dom";
import dynamic from "next/dynamic";
import {ChevronLeft,X} from "lucide-react";
import {cn} from "@/lib/utils";
import type {CanvasWorkspacePages} from "./use-canvas-workspace-pages";

const panelLoading = () => <div role="status" className="p-4 text-sm text-slate-500">加载中…</div>;
const TemplatesClient = dynamic(() => import("@/components/templates/templates-client").then(module => module.TemplatesClient), { ssr: false, loading: panelLoading });
const CreditPacks = dynamic(() => import("@/components/credits/credit-packs").then(module => module.CreditPacks), { ssr: false, loading: panelLoading });
const PayQrModal = dynamic(() => import("@/components/credits/pay-qr-modal").then(module => module.PayQrModal), { ssr: false, loading: panelLoading });
const AccountClient = dynamic(() => import("@/components/account/account-client").then(module => module.AccountClient), { ssr: false, loading: panelLoading });
const SecurityClient = dynamic(() => import("@/components/account/security-client").then(module => module.SecurityClient), { ssr: false, loading: panelLoading });
const GenerateClient = dynamic(() => import("@/components/generate/generate-client").then(module => module.GenerateClient), { ssr: false, loading: panelLoading });
const CheckoutClient = dynamic(() => import("@/components/checkout/checkout-client").then(module => module.CheckoutClient), { ssr: false, loading: panelLoading });

/** Workspace pages are lazy UI; Canvas supplies only domain callbacks. */
export function CanvasWorkspacePagesView({pages,lightCanvas,commerceVisible,t,applyTemplateToCanvas,refreshCredits}:{
  pages:CanvasWorkspacePages;lightCanvas:boolean;commerceVisible:boolean;t:(key:string)=>string;
  applyTemplateToCanvas:(id:string)=>void|Promise<void>;refreshCredits:()=>void|Promise<void>;
}) {
  const {modalTop,modalStack,payModal}=pages;
  return <>
      {/* 右上角按钮:在画布内弹窗打开模板/会员/账户(可层叠下一级,可返回) */}
      {modalTop &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={cn(
              "fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm text-foreground",
              lightCanvas ? "canvas-ui-light" : "dark canvas-ui-dark"
            )}
            onClick={() => pages.close()}
          >
            <div
              className={cn(
                "relative flex h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl",
                modalTop.page === "templates" || modalTop.page === "generate"
                  ? "max-w-6xl"
                  : "max-w-5xl"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-none items-center justify-between border-b border-border px-5 py-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  {modalStack.length > 1 && (
                    <button
                      type="button"
                      onClick={pages.back}
                      aria-label={t("canvas.backToProjects")}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}
                  <span className="truncate text-base font-bold text-foreground">
                    {modalTop.page === "templates"
                      ? t("nav.templates")
                      : modalTop.page === "plans"
                        ? t("nav.plans")
                        : modalTop.page === "account"
                          ? t("nav.account")
                          : modalTop.page === "security"
                            ? "账户与安全"
                            : modalTop.page === "generate"
                              ? t("nav.generate")
                              : "结算"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => pages.close()}
                  aria-label={t("canvas.close")}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto"
                onClickCapture={(e) => {
                  // 弹窗内点向 模板/会员/账户/生成 的内部链接 → 不跳页面,改为在弹窗内进下一级;
                  // 未知/外部(支付等)照常跳转。
                  const a = (e.target as HTMLElement).closest("a");
                  if (!a) return;
                  const href = a.getAttribute("href") || "";
                  if (!href.startsWith("/")) return; // 外链照常
                  // 模板「做同款」(/generate?template=ID)→ 关弹窗,在画布里新建一个项目
                  const [hp, hq] = href.split("?");
                  if (hp.replace(/\/+$/, "") === "/generate") {
                    const tplId = new URLSearchParams(hq || "").get("template");
                    if (tplId) {
                      e.preventDefault();
                      e.stopPropagation();
                      void applyTemplateToCanvas(tplId);
                      return;
                    }
                  }
                  if (pages.pushHref(href)) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                {modalTop.page === "templates" && (
                  <TemplatesClient gridClass="columns-2 md:columns-3 xl:columns-4" />
                )}
                {commerceVisible && modalTop.page === "plans" && (
                  <div className="p-4">
                    <CreditPacks
                      onCheckout={pages.checkout}
                    />
                  </div>
                )}
                {modalTop.page === "account" && <AccountClient />}
                {modalTop.page === "security" && <SecurityClient />}
                {modalTop.page === "generate" && (
                  <GenerateClient seedTemplateId={modalTop.params?.template} />
                )}
                {commerceVisible && modalTop.page === "checkout" && (
                  <CheckoutClient pack={modalTop.params?.pack} />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      {/* 画布内扫码支付:统一走共用 PayQrModal */}
      {commerceVisible && payModal && (
        <PayQrModal
          open={!!payModal}
          orderId={payModal.orderId}
          provider={payModal.provider}
          qrContent={payModal.qrContent}
          credits={payModal.credits}
          bonus={payModal.bonus}
          fen={payModal.fen}
          discount={payModal.discount}
          onClose={() => pages.closePayment()}
          onPaid={() => void refreshCredits()}
          onRefresh={pages.refreshPayment}
        />
      )}
  </>;
}
