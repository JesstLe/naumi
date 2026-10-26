/** UI_FIXTURE: real quality components; only provider hooks and quote responses are mocked. */
import React, { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ImageQualityControl } from "@/components/image-quality-control";

type Settings = {
  model: string; modelId?: string; quality: string; quantity: number; ratio: string;
  resolution: string; pathname: string; feature?: string; disabled: boolean;
  compact: boolean; fail: boolean; hold: boolean; mode: string; offset: number;
  invalid?: "null" | "nan" | "negative"; capable: boolean;
};
const defaults: Settings = { model: "modelA", quality: "high", quantity: 1, ratio: "1:1", resolution: "1K", pathname: "/canvas", disabled: false, compact: true, fail: false, hold: false, mode: "fixed", offset: 0, capable: true };
let settings = { ...defaults }, snapshot = { settings, mount: 0 }, serial = 0;
const listeners = new Set<() => void>();
const records: { input: Record<string, any>; cacheHit: boolean }[] = [];
const pending: (() => void)[] = [];
const cache = new Map<string, Promise<any>>();
let networkQuotes = 0, paidCalls = 0;
function publish(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  snapshot = { ...snapshot, settings };
  listeners.forEach(listener => listener());
}
function useFixture() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => snapshot).settings;
}
const labels = { low: "低", medium: "中", high: "高", xhigh: "超高", max: "极致" };
function makeQuote() {
  return (input: Record<string, any>) => {
    const key = JSON.stringify(input), existing = cache.get(key);
    records.push({ input: { ...input }, cacheHit: !!existing });
    if (existing) return existing;
    networkQuotes++;
    const captured = { ...settings };
    const promise = new Promise((resolve, reject) => {
      const finish = () => {
        if (captured.fail) { reject(new Error("UI_FIXTURE quote read failed")); return; }
        const prices = input.modelId === "modelB" ? [0, 19, 29, 39, 49] : [0, 7, 11, 17, 23];
        const index = ["low", "medium", "high", "xhigh", "max"].indexOf(input.quality);
        const unit = prices[index] + (input.ratio === "16:9" ? 3 : 0) + (input.resolution === "2K" ? 5 : 0) + captured.offset;
        // An independent fixture batch tariff intentionally differs from unit * quantity.
        let credits: any = input.quantity > 1 ? unit * input.quantity - (input.quantity - 1) * 2 : unit;
        if (captured.invalid === "null") credits = null;
        if (captured.invalid === "nan") credits = NaN;
        if (captured.invalid === "negative") credits = -1;
        resolve({ version: 1, feature: input.feature, modelId: input.modelId, quantity: input.quantity, mode: captured.mode, credits, authorizedCredits: 88888, reserveCredits: 99999 });
      };
      if (captured.hold) pending.push(finish); else queueMicrotask(finish);
    });
    cache.set(key, promise);
    void promise.then((q: any) => { if (typeof q.credits !== "number" || !Number.isFinite(q.credits) || q.credits < 0) cache.delete(key); }, () => cache.delete(key));
    return promise;
  };
}
let quote = makeQuote();
export function mockUseBilling() {
  useFixture();
  return { quote, catalog: null, loading: false, error: null, refresh: async () => {}, submit: () => { paidCalls++; throw new Error("UI_FIXTURE paid submit forbidden"); }, quoteAndSubmit: () => { paidCalls++; throw new Error("UI_FIXTURE paid submit forbidden"); } };
}
export function mockUseImageQuality() {
  const current = useFixture();
  return { quality: current.quality, setQuality: (quality: string) => publish({ quality }), qualityLabels: labels,
    capable: current.capable, experimental: false, allowedQualities: ["low", "medium", "high", "xhigh", "max"], modelConfig: null };
}
export function mockUseFeatureModels() { const current = useFixture(); return { selected: current.model }; }
export function mockUsePathname() { return useFixture().pathname; }
export function mockUseI18n() {
  return { t: (key: string) => ({ "gen.qualityLabel": "品质", "gen.qLow": "低", "gen.qMedium": "中", "gen.qHigh": "高", "gen.qXhigh": "超高", "gen.qMax": "极致", "gen.qualityPending": "品质待开放", "gen.qualityBeta": "内测" } as Record<string, string>)[key] || key };
}
const api = {
  reset(patch: Partial<Settings> = {}) {
    records.length = 0; cache.clear(); networkQuotes = 0; paidCalls = 0;
    settings = { ...defaults, ...patch }; quote = makeQuote();
    snapshot = { settings, mount: ++serial }; listeners.forEach(listener => listener());
  },
  update: publish,
  refresh() { cache.clear(); quote = makeQuote(); publish({}); },
  release() { const jobs = pending.splice(0); jobs.forEach(finish => finish()); },
  stats: () => ({ records: records.map(record => ({ ...record, input: { ...record.input } })), networkQuotes, paidCalls, pending: pending.length, settings }),
};
(window as any).qualityPriceFixture = api;
function Preview() {
  const current = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => snapshot);
  const s = current.settings;
  return <main>
    <header><strong>品质报价</strong><span>UI_FIXTURE · 真实共享组件</span></header>
    <nav>
      <label>模型 <select value={s.model} onChange={event => publish({ model: event.target.value })}><option>modelA</option><option>modelB</option></select></label>
      <label>张数 <select value={s.quantity} onChange={event => publish({ quantity: Number(event.target.value) })}>{[1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select></label>
      <label>比例 <select value={s.ratio} onChange={event => publish({ ratio: event.target.value })}><option>1:1</option><option>16:9</option></select></label>
    </nav>
    <section data-testid="quality-fixture-control" className={s.pathname === "/canvas" ? "canvas-ui-light" : "tool-page"}>
      <ImageQualityControl key={current.mount} feature={s.feature as any} value={s.quality} modelId={s.modelId} quantity={s.quantity} ratio={s.ratio} resolution={s.resolution} disabled={s.disabled} compact={s.compact} />
    </section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Preview /></StrictMode>);
