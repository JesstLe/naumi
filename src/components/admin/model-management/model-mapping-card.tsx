"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import type { ManagedModelRow } from "@/lib/model-config/management";
import styles from "./model-mapping-card.module.css";
import { orderedRoutes } from "./channel-display";

export type MappingAction = {
  label: string;
  group: "display" | "routing" | "parameters";
  disabled?: boolean;
  title?: string;
  onClick: () => void;
};

const types: Record<string, string> = { image: "图片", text: "文字", video: "视频", audio: "声音" };

export function ModelMappingHeader() {
  return <div className={styles.tableHead} aria-hidden="true">
    <span>前端显示名称</span><span>实际调用模型</span><span>应用范围</span><span>积分售价</span><span />
  </div>;
}

export function ModelMappingCard({ row, actions, scopeDisabled, onScope, onManage, onPrice }: {
  row: ManagedModelRow;
  actions: MappingAction[];
  scopeDisabled: boolean;
  onScope: () => void;
  onManage?: () => void;
  onPrice?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const enabled = orderedRoutes(row, true);
  const disabled = orderedRoutes(row, false);
  const actualModels = [...new Set(enabled.map(route => route.model))];
  const enabledChannels = new Set(enabled.map(route => route.upstreamId)).size;
  const disabledChannels = new Set(disabled.map(route => route.upstreamId)).size;
  const price = row.pricing?.[0];
  const priceKnown = price?.credits != null;
  const priceUnit = price?.unit === "image" ? "张" : price?.unit === "item" ? "项" : "次";
  const RouteList = ({ routes }: { routes: ManagedModelRow["routes"] }) => <ul className={styles.routeList}>
    {routes.map((route, index) => {
      const policy = row.supplierRouting?.channels.find(channel => channel.upstreamId === route.upstreamId);
      return <li key={`${route.upstreamId}-${route.kind}`} data-enabled={route.enabled}>
        <span className={styles.routeOrder}>{route.enabled ? String(index + 1).padStart(2, "0") : "—"}</span>
        <div className={styles.routeIdentity}><b>{route.provider}</b><span>实际模型 <code>{route.model}</code></span></div>
        <span className={styles.routeKind}>{!route.enabled ? "已停用" : policy ? <>优先级 {policy.priority}{row.supplierRouting?.mode === "balanced" && <small>同级权重 {policy.weight}</small>}</> : route.kind}</span>
      </li>;
    })}
  </ul>;

  return <article className={styles.card} data-testid={`managed-model-${row.id}`} data-expanded={expanded} data-workspace={!!onManage}>
    <div className={styles.summary}>
      <div className={styles.identity}>
        <span className={styles.modality}>{types[row.modality]}</span>
        <h2>{row.label}</h2>
        {row.publicIds.length > 1 && <small>{row.publicIds.length} 个比例分支</small>}
      </div>
      <div className={styles.actual}>
        <span className={styles.mobileLabel}>实际调用模型</span>
        {actualModels.length ? <><code title={actualModels.join(" / ")}>{actualModels[0]}</code>
          <div className={styles.channelSummary}><span className={styles.enabledBadge}>{enabledChannels} 个启用通道</span>
            {actualModels.length > 1 && <span>另 {actualModels.length - 1} 个模型</span>}</div>
        </> : <span className={styles.noChannel}>暂无启用通道</span>}
      </div>
      <div className={styles.scope}>
        <span className={styles.mobileLabel}>应用范围</span>
        <button type="button" disabled={scopeDisabled} onClick={onScope} className={styles.scopeButton} aria-label={`编辑 ${row.label} 的应用范围`}>{row.features.length} 个工具 <ChevronRight size={13} /></button>
        <small title={row.features.map(feature => feature.label).join("、")}>{row.features.length ? row.features.slice(0, 2).map(feature => feature.label).join("、") + (row.features.length > 2 ? "等" : "") : "未应用到工具"}</small>
      </div>
      <div className={styles.price}>
        <span className={styles.mobileLabel}>积分售价</span>
        {onPrice ? <button type="button" className={styles.priceLink} disabled={scopeDisabled || !row.features.length} onClick={onPrice}>查看价目</button> : <><span>{priceKnown ? <><b>{price.credits}</b> 积分/{priceUnit}</> : "按工具配置"}</span>{priceKnown && <small>{price.estimated ? "预估" : "标准 1K"} · {price.label}{price.source ? ` · ${price.source.label}` : ""}</small>}</>}
      </div>
      <button type="button" className={styles.configure} aria-expanded={onManage ? undefined : expanded} aria-controls={onManage ? undefined : panelId} onClick={onManage || (() => setExpanded(value => !value))}>
        {onManage ? <ChevronRight size={15}/> : expanded ? <ChevronDown size={15} /> : <Settings2 size={15} />}{onManage ? "管理" : expanded ? "收起" : "配置"}
      </button>
    </div>
    {expanded && <div id={panelId} className={styles.panel}>
      <section className={styles.connectionPanel} aria-label={`${row.label} 的调用通道`}>
        <div className={styles.sectionHeading}><h3>调用通道</h3><span>{row.supplierRouting?.mode === "balanced" ? "同级分流" : row.supplierRouting?.mode === "priority" ? "主备优先" : row.conditional ? "条件路由 / 回退" : row.preset ? "默认预设" : row.publicIds.length > 1 ? "按比例选择" : "固定调用"}</span></div>
        {enabled.length ? <RouteList routes={enabled} /> : <p className={styles.empty}>当前没有启用的调用通道。</p>}
        {disabled.length > 0 && <details className={styles.disabledRoutes}><summary>已停用通道 · {disabledChannels}</summary><RouteList routes={disabled} /></details>}
      </section>
      <div className={styles.settingsPanel}>
        <section aria-label={`${row.label} 的配置入口`}>
          <h3>配置</h3>
          {([['display', '展示与积分'], ['routing', '调用方式'], ['parameters', '生成参数']] as const).map(([group, label]) => {
            const items = actions.filter(action => action.group === group);
            return items.length > 0 && <div key={group} className={styles.actionGroup}><span>{label}</span><div>{items.map(action => <button type="button" key={action.label} disabled={action.disabled} title={action.title} onClick={action.onClick}>{action.label}<ChevronRight size={12} /></button>)}</div></div>;
          })}
        </section>
        <section className={styles.toolsPanel} aria-label={`${row.label} 的应用工具`}>
          <div className={styles.sectionHeading}><h3>应用工具 <span>{row.features.length}</span></h3><button type="button" disabled={scopeDisabled} onClick={onScope}>编辑范围</button></div>
          <div className={styles.featureTags}>{row.features.map(feature => <span key={feature.id}>{feature.label}</span>)}</div>
          {!row.features.length && <p className={styles.empty}>尚未应用到工具。</p>}
          {row.publicIds.length > 1 && <small className={styles.familyNote}>模型家族 · {row.publicIds.length} 个比例分支，统一管理</small>}
        </section>
      </div>
    </div>}
  </article>;
}
