"use client";

import { createContext, useContext, useMemo } from "react";

type Ctx = {
  // 是否向普通前端访客公开价格、充值和销售入口。内测期默认 false。
  commerceVisible: boolean;
  pricingVisible: boolean;
  // 前端是否显示「在线充值」(= 后台开关开 且 已配置收款信息;SSR 注入)。
  // 假 → 隐藏在线充值,改显示「兑换码」入口。
  rechargeEnabled: boolean;
  // 是否为官方站(NAUMI_OFFICIAL_SITE=1)。落地页据此决定显不显示"我们的"销售内容
  // 仅用于发布者文案,不限制功能。
  official: boolean;
};

const PaymentContext = createContext<Ctx | null>(null);

export function PaymentProvider({
  commerceVisible,
  pricingVisible = commerceVisible,
  rechargeEnabled,
  official,
  children,
}: {
  commerceVisible: boolean;
  pricingVisible?: boolean;
  rechargeEnabled: boolean;
  official: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo<Ctx>(
    () => ({ commerceVisible, pricingVisible, rechargeEnabled, official }),
    [commerceVisible, pricingVisible, rechargeEnabled, official]
  );
  return (
    <PaymentContext.Provider value={value}>{children}</PaymentContext.Provider>
  );
}

/** Safe-to-call:在 Provider 外用返回默认(无充值、非官方站)。 */
export function usePaymentConfig(): Ctx {
  const c = useContext(PaymentContext);
  if (!c) {
    return {
      commerceVisible: false,
      pricingVisible: false,
      rechargeEnabled: false,
      official: false,
    };
  }
  return c;
}
