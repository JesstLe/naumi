"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { authHeader } from "@/lib/supabase";
import { subscribeModelCatalogRefresh } from "@/lib/model-config/catalog-refresh";
import { useFeatureCatalogScope } from "@/lib/model-config/feature-client";
import type { VideoCatalogModel } from "@/lib/video/client-settings";

/**
 * 视频模型目录的浏览器侧共享缓存。
 * 与 feature-catalog-browser 同思路：模块统一持有 scope/代际/在途/错误，预取、挂载、reload 共用同一入口。
 * HTTP 层保持 no-store，缓存只是 UI 渲染层；失效即时，不改变服务端冻结语义。
 * - 代际（epoch）：发布失效递增，旧代际的在途响应不得回填缓存、不得冒充新结果。
 * - 在途请求按 scope 绑定：切 scope 不复用旧 scope 的在途 promise。
 * - 挂载读取与 load 共用同一 TTL 判断，过期缓存只经 refresh 连接新结果。
 */
type Entry = { scope: string; models: VideoCatalogModel[]; fetchedAt: number };
const MAX_AGE_MS = 120_000;
let cache: Entry | null = null;
let inflight: Promise<VideoCatalogModel[]> | null = null, inflightScope = "", inflightEpoch = 0;
let epoch = 0;
let unsubscribeInvalidation: (() => void) | null = null;

/** 缓存所有者自己订阅发布事件：即使面板从未挂载，发布也会使缓存失效。 */
function ensureInvalidationListener(): void {
  if (unsubscribeInvalidation || typeof window === "undefined") return;
  unsubscribeInvalidation = subscribeModelCatalogRefresh(() => { epoch++; cache = null; });
}

async function readModels(): Promise<VideoCatalogModel[]> {
  const headers = await authHeader();
  const response = await fetch("/api/video/catalog", { headers, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "视频模型读取失败");
  return Array.isArray(data.models) ? data.models as VideoCatalogModel[] : [];
}

function load(scope: string): Promise<VideoCatalogModel[]> {
  ensureInvalidationListener();
  if (inflight && inflightScope === scope && inflightEpoch === epoch) return inflight;
  if (cache && cache.scope === scope && Date.now() - cache.fetchedAt < MAX_AGE_MS) return Promise.resolve(cache.models);
  const started = epoch;
  const promise = readModels()
    .then(models => { if (started === epoch) cache = { scope, models, fetchedAt: Date.now() }; return models; })
    .finally(() => { if (inflight === promise) inflight = null; });
  inflight = promise; inflightScope = scope; inflightEpoch = started;
  return promise;
}

/** 提前拉取(hover/挂载预取),已缓存或在途时为空操作。 */
export function prefetchVideoCatalog(scope: string): void {
  void load(scope).catch(() => { /* 错误由面板显式 reload 时呈现 */ });
}

export function useVideoCatalogModels(): { models: VideoCatalogModel[]; ready: boolean; error: string; reload: () => void } {
  const scope = useFeatureCatalogScope();
  const [state, setState] = useState<{ scope: string; models: VideoCatalogModel[]; error: string; ready: boolean }>({ scope: "", models: [], error: "", ready: false });
  const [, tick] = useReducer((count: number) => count + 1, 0);
  // 提交防护:旧代际(发布后晚到的旧响应)与旧 scope(切换后晚到的旧响应)都不得覆盖当前面板状态,
  // 否则要么退回旧目录、要么写入错误 scope 触发永久加载。渲染期同步 ref 保证判定用最新 scope。
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const refresh = useCallback(() => {
    const startedEpoch = epoch;
    void load(scope)
      .then(models => { if (scopeRef.current === scope && epoch === startedEpoch) setState({ scope, models, error: "", ready: true }); })
      // 失败始终呈现错误(面板据此显示重试);同 scope 已知模型保留展示,不把请求失败伪装成正常空目录。
      .catch(() => { if (scopeRef.current === scope && epoch === startedEpoch) setState(previous => ({ scope, models: previous.scope === scope ? previous.models : [], error: "视频模型读取失败", ready: true })); });
  }, [scope]);
  useEffect(() => {
    // 模块级失效订阅必须先于面板刷新订阅安装:发布事件到达时先递增 epoch,
    // 面板 refresh 才能捕获新代际提交,否则新响应会被自家提交守卫丢弃。
    ensureInvalidationListener();
    const unsubscribe = subscribeModelCatalogRefresh(() => { cache = null; refresh(); });
    const cached = cache && cache.scope === scope && Date.now() - cache.fetchedAt < MAX_AGE_MS ? cache.models : null;
    if (cached) setState({ scope, models: cached, error: "", ready: true });
    else refresh();
    return unsubscribe;
  }, [refresh, scope]);
  const visible = state.scope === scope && state.ready ? state : { scope, models: [], error: "", ready: false };
  // 显式 reload 是失效通道:先递增 epoch 作废旧在途请求(不得复用旧响应冒充重试结果)再重拉,
  // 旧代际响应晚到时被 load 回填防护与提交守卫双双丢弃。
  return { models: visible.models, ready: visible.ready, error: visible.error, reload: () => { epoch++; cache = null; refresh(); tick(); } };
}
