"use client";
import {useState} from "react";
import {Check,ChevronRight,Plus,RefreshCw,Search,Unplug} from "lucide-react";
import type {CatalogEntry} from "@/lib/model-config/catalog-store";
import type {State} from "./contracts";
import styles from "./model-management.module.css";

export function Source({ provider: p, catalog, candidates, refreshing, locked, onRefresh, onRegister, className="" }: { provider: State["providers"][number]; catalog?: CatalogEntry; candidates: State["candidates"]; refreshing: boolean; locked: boolean; onRefresh: () => void; onRegister: (model: string) => void; className?:string }) {
  const [search, setSearch] = useState(""), [expanded, setExpanded] = useState(false);
  const models = catalog?.models.filter(m => `${m.id} ${m.label}`.toLowerCase().includes(search.toLowerCase())) || [];
  const statuses: Record<string, string> = { ok: "目录已连接", empty: "目录为空", unsupported: "无标准目录接口", "no-credential": "缺少凭据", error: "目录不可用" };
  return <article className={`${styles.source} ${className}`}><header><span className={styles.sourceIcon}><Unplug size={20} /></span><div><h3>{p.name}<span className={styles.sourceState}>{!p.enabled ? "已停用" : refreshing ? "正在发现模型" : catalog?.cached || catalog?.fetchedAt ? statuses[catalog!.status] : "等待发现"}</span></h3><p>{p.baseUrl}</p></div><button className={styles.iconButton} aria-label={`刷新 ${p.name} 模型目录`} disabled={locked || refreshing} onClick={onRefresh}><RefreshCw size={17} className={refreshing ? styles.spin : ""} /></button></header><div className={styles.sourceMeta}><span>{p.protocol}</span><span>{p.configured ? "凭据已保存" : "未配置凭据"}</span><span>{catalog?.models.length || 0} 个目录模型</span></div>
    {catalog?.error && <p className={styles.catalogError}>{catalog.error}。{catalog.models.length > 0 && "以下保留上次目录，不代表当前可访问。"}</p>}
    {catalog?.truncated && <p className={styles.catalogError}>目录仅展示前 600 个模型，可能仍有未加载的模型。</p>}
    {catalog?.fetchedAt && <p className={styles.timestamp}>最近查询：{new Date(catalog.fetchedAt).toLocaleString("zh-CN")}{catalog.stale ? "（需要刷新）" : ""}</p>}
    <button className={styles.catalogToggle} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起模型目录" : "查看模型目录"}<ChevronRight size={16} /></button>
    {expanded && <div className={styles.catalog}><label className={styles.search}><Search size={15} /><input aria-label={`${p.name} 搜索模型 ID`} placeholder="搜索模型 ID" value={search} onChange={e => setSearch(e.target.value)} /></label><p className={styles.ruleNote}>目录可访问不等于能力已验证；只有已接入并确认能力的模型可以切换。</p><div className={styles.catalogList}>{models.map(m => { const configured = candidates.some(c => c.providerId === p.id && c.model === m.id); return <div key={m.id}><code>{m.id}</code>{configured ? <span className={styles.added}><Check size={13} />已接入</span> : <button disabled={locked || refreshing || catalog?.status !== "ok" || catalog.stale || !p.enabled} onClick={() => onRegister(m.id)}>添加模型 <Plus size={13} /></button>}</div>; })}</div>{!models.length && <p className={styles.ruleNote}>没有匹配模型。可刷新目录，或在完整配置中心检查接口协议。</p>}</div>}
  </article>;
}
