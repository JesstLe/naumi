"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import styles from "./provider-ops.module.css";

type WindowStats = { total: number; ok: number; rejected: number; failed: number; unknown: number };
type Balance = {
  status: "ok" | "unsupported" | "error";
  currency: string;
  remainBalance: number | null;
  usedBalance: number | null;
  detail: string | null;
  probedAt: string;
};
type ProviderOps = {
  id: string; name: string; protocol: string; baseUrl: string; enabled: boolean;
  timeoutMs: number; maxConcurrent: number; hasCredential: boolean;
  balance: Balance;
  stats: { h1: WindowStats; h24: WindowStats };
};
type Payload = { providers: ProviderOps[]; circuitOpenChannels: number; generatedAt: string };

const LOW_BALANCE_USD = 5;
const REFRESH_MS = 60_000;

function rate(ok: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((ok / total) * 100)}%`;
}

function balanceTone(balance: Balance): "ok" | "low" | "unknown" {
  if (balance.status !== "ok" || balance.remainBalance === null) return "unknown";
  return balance.remainBalance < LOW_BALANCE_USD ? "low" : "ok";
}

function formatClock(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString("zh-CN", { hour12: false }) : "";
}

function StatsCell({ label, stats }: { label: string; stats: WindowStats }) {
  return (
    <div className={styles.statsCell}>
      <span className={styles.statsLabel}>{label}</span>
      <span className={stats.total && stats.ok < stats.total ? styles.rateWarn : styles.rateGood} data-testid="provider-rate">
        {rate(stats.ok, stats.total)}
      </span>
      <span className={styles.statsMeta}>
        {stats.ok}/{stats.total}
        {stats.rejected > 0 && ` · 被拒 ${stats.rejected}`}
        {stats.unknown > 0 && ` · 未知 ${stats.unknown}`}
        {stats.failed > 0 && ` · 失败 ${stats.failed}`}
      </span>
    </div>
  );
}

export function ProviderOps() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/bi/provider-ops${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      setData(payload as Payload);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const timer = setInterval(() => void load(false), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <section className={styles.card} aria-label="供应商余额与成功率">
      <header className={styles.header}>
        <h2 className={styles.title}><Wallet size={16} aria-hidden /> 供应商余额与成功率</h2>
        <div className={styles.headerMeta}>
          {data && <span className={styles.meta}>更新 {formatClock(data.generatedAt)}{data.circuitOpenChannels > 0 ? ` · ${data.circuitOpenChannels} 条通道熔断中` : ""}</span>}
          <button type="button" className={styles.refresh} disabled={busy} onClick={() => void load(true)}>
            <RefreshCw size={14} aria-hidden /> {busy ? "刷新中" : "刷新"}
          </button>
        </div>
      </header>
      {error && <p className={styles.error} role="alert">加载失败：{error}</p>}
      {data && (
        <div className={styles.grid}>
          {data.providers.map(provider => {
            const tone = balanceTone(provider.balance);
            return (
              <article key={provider.id} className={styles.providerCard} data-disabled={!provider.enabled}>
                <header className={styles.providerHead}>
                  <span className={styles.providerName}>{provider.name}</span>
                  <span className={styles.providerMeta}>
                    {provider.enabled ? "" : "已停用 · "}
                    {provider.protocol}
                  </span>
                </header>
                <div className={styles.balanceRow} data-tone={tone}>
                  {tone === "unknown"
                    ? <span className={styles.balanceUnknown}>{provider.balance.status === "unsupported" ? "余额查询暂不支持" : (provider.balance.detail || "余额未知")}</span>
                    : <><span className={styles.balanceValue}>{provider.balance.remainBalance?.toFixed(2)}</span>
                        <span className={styles.balanceUnit}>{provider.balance.currency} 剩余{provider.balance.usedBalance !== null ? ` · 已用 ${provider.balance.usedBalance.toFixed(2)}` : ""}</span></>}
                </div>
                <p className={styles.probeTime}>探测 {formatClock(provider.balance.probedAt)}</p>
                <div className={styles.statsRow}>
                  <StatsCell label="近 1 小时" stats={provider.stats.h1} />
                  <StatsCell label="近 24 小时" stats={provider.stats.h24} />
                </div>
                <p className={styles.capacity}>并发上限 {provider.maxConcurrent} · 超时 {Math.round(provider.timeoutMs / 1000)}s{provider.hasCredential ? "" : " · 缺凭据"}</p>
              </article>
            );
          })}
        </div>
      )}
      {data && data.providers.length === 0 && <p className={styles.empty}>当前配置没有登记供应商</p>}
    </section>
  );
}
