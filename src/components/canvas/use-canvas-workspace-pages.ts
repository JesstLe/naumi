"use client";
import {useEffect,useState} from "react";
import type {CreditPack} from "@/lib/mock-data";

export type ModalRoute = {
  page: "templates" | "plans" | "account" | "generate" | "checkout" | "security";
  params?: Record<string, string>;
};

type CanvasCheckoutInfo = {qrContent:string;provider:"alipay"|"wechat";pack?:CreditPack};

/** Canvas-local page navigation and QR lifecycle; no canvas graph/document state. */
export function useCanvasWorkspacePages({commerceVisible,email}:{commerceVisible:boolean;email?:string|null}) {
  const [modalStack, setModalStack] = useState<ModalRoute[]>([]);
  const modalTop = modalStack[modalStack.length - 1] ?? null;
  // 画布内扫码支付(原生支付宝/微信二维码 + 轮询到账,统一走共用 PayQrModal)
  const [payModal, setPayModal] = useState<{
    orderId: string;
    qrContent: string;
    provider: "alipay" | "wechat";
    credits: number;
    bonus: number;
    fen: number;
    discount?: string;
    packId: string;
  } | null>(null);
  // 打开一级弹窗(右上角按钮)
  function openModal(page: ModalRoute["page"]) {
    setModalStack([{ page }]);
  }
  // 弹窗内点链接 → 进下一级(画布内层叠);返回 = 出栈
  const MODAL_ROUTES: Record<string, ModalRoute["page"]> = {
    "/templates": "templates",
    "/plans": "plans",
    "/account": "account",
    "/account/security": "security",
    "/generate": "generate",
  };
  function pushModalHref(href: string): boolean {
    const [path, qs] = href.split("?");
    const route = path.replace(/\/+$/, "") || "/";
    const page = MODAL_ROUTES[route];
    if (!page) return false; // 未知/外部 → 不拦截,照常跳转
    if (!commerceVisible && (page === "plans" || page === "checkout")) {
      return false;
    }
    const params = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
    setModalStack((s) => [...s, { page, params }]);
    return true;
  }
  function modalBack() {
    setModalStack((s) => (s.length > 1 ? s.slice(0, -1) : []));
  }
  // 扫码支付二维码渲染 + 轮询到账 + 倒计时统一由共用 PayQrModal 处理(见下方 JSX)。
  // 预加载二维码库:进会员弹窗时就把 qrcode chunk 拉好,点开通后秒出码
  useEffect(() => {
    if (modalTop?.page === "plans") void import("qrcode");
  }, [modalTop?.page]);
  function checkout(orderId: string, info: CanvasCheckoutInfo) {
    if (!info.pack) return;
    setPayModal({
      orderId,
      qrContent: info.qrContent,
      provider: info.provider,
      credits: info.pack.credits,
      bonus: info.pack.bonus,
      fen: info.pack.fen,
      discount: info.pack.discount,
      packId: info.pack.id,
    });
  }
  async function refreshPayment() {
    const em = email;
    if (!em || !payModal) return;
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: em,
          kind: "pack",
          itemId: payModal.packId,
          method: payModal.provider,
        }),
      });
      const data = await res.json();
      if (res.ok && data.mode === "native" && data.qrContent) {
        setPayModal((m) =>
          m
            ? {
                ...m,
                orderId: data.orderId,
                qrContent: String(data.qrContent),
                provider:
                  (data.provider as "alipay" | "wechat") ?? m.provider,
              }
            : m
        );
      }
    } catch {
      /* ignore */
    }
  }
  function close() { setModalStack([]); }
  function closePayment() { setPayModal(null); }
  return {modalStack,modalTop,payModal,open:openModal,close,back:modalBack,pushHref:pushModalHref,
    checkout,closePayment,refreshPayment,isOpen:Boolean(modalTop||payModal)};
}
export type CanvasWorkspacePages = ReturnType<typeof useCanvasWorkspacePages>;
