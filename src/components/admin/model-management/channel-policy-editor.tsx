"use client";

import type { ChannelPolicy } from "@/lib/model-config/channel-policy";
import type { ManagedModelRow, ModelManagementState } from "@/lib/model-config/management";
import { orderedChannels } from "./channel-display";
import styles from "./channel-policy-editor.module.css";

export function ChannelPolicyEditor({ row, state, channels, mode, locked, onMode, onUpdate, onRemove }: {
  row: ManagedModelRow;
  state: ModelManagementState;
  channels: ChannelPolicy["channels"];
  mode: ChannelPolicy["mode"];
  locked: boolean;
  onMode: (mode: ChannelPolicy["mode"]) => void;
  onUpdate: (id: string, patch: Partial<ChannelPolicy["channels"][number]>) => void;
  onRemove: (id: string) => void;
}) {
  const active = orderedChannels(channels.filter(channel => channel.enabled));
  const inactive = orderedChannels(channels.filter(channel => !channel.enabled));
  const renderChannel = (channel: ChannelPolicy["channels"][number], index: number) => {
    const candidate = state.candidates.find(c => c.id === channel.upstreamId);
    const route = row.routes.find(r => r.upstreamId === channel.upstreamId);
    const provider = state.providers.find(p => p.id === (candidate?.providerId || route?.providerId));
    const capacity = provider && state.providerCapacity?.[provider.id];
    const health = state.channelHealth?.[channel.upstreamId];
    const title = candidate?.provider || route?.provider || "来源未登记";
    return <fieldset key={channel.upstreamId} disabled={locked} className={styles.channel} data-testid={`supplier-channel-${channel.upstreamId}`} data-enabled={channel.enabled}>
      <legend className={styles.srOnly}>{title}</legend>
      <div className={styles.channelTop}>
        <span className={styles.order}>{channel.enabled ? String(index + 1).padStart(2, "0") : "—"}</span>
        <div className={styles.identity}><b>{title}</b><span>实际模型 <code>{candidate?.model || route?.model || channel.upstreamId}</code></span></div>
        <label className={styles.toggle}><input type="checkbox" aria-label={`启用通道 ${channel.upstreamId}`} checked={channel.enabled} onChange={e => onUpdate(channel.upstreamId, { enabled: e.target.checked })} />{channel.enabled ? "启用" : "停用"}</label>
      </div>
      <div className={styles.rules}>
        <label>优先级<input aria-label={`通道优先级 ${channel.upstreamId}`} type="number" min={1} max={100} value={channel.priority} onChange={e => onUpdate(channel.upstreamId, { priority: Number(e.target.value) })} /></label>
        {mode === "balanced" && <label>同级权重<input aria-label={`通道权重 ${channel.upstreamId}`} type="number" min={1} max={1000} value={channel.weight} onChange={e => onUpdate(channel.upstreamId, { weight: Number(e.target.value) })} /></label>}
        <details className={styles.runtime}><summary>运行信息</summary><dl>
          <div><dt>调用状态</dt><dd>{({ available: "最近调用成功", cooldown: "暂停，等待恢复", recovering: "恢复探测中", failed: "最近调用失败", unobserved: "尚未调用" } as Record<string, string>)[health?.state || ""] || "调用状态未取得"}</dd></div>
          <div><dt>上游并发</dt><dd>{capacity ? `${capacity.inFlight} / ${capacity.unlimited ? "不限" : capacity.maxConcurrent}` : "运行占用未取得"}</dd></div>
          <div><dt>能力核对</dt><dd>{candidate?.verified ? "能力已登记" : "尚未全面核对"}</dd></div>
          <div><dt>通道 ID</dt><dd><code>{channel.upstreamId}</code></dd></div>
        </dl></details>
        <button type="button" className={styles.remove} disabled={locked} onClick={() => onRemove(channel.upstreamId)}>移除通道</button>
      </div>
    </fieldset>;
  };
  return <div className={styles.editor}>
    <header className={styles.heading}><div><span>前端模型</span><h3>{row.label}</h3></div><span>{active.length} 个启用 / {channels.length} 个已配置</span></header>
    <div className={styles.mode}>
      <label>调度方式<select aria-label="调度方式" value={mode} disabled={locked} onChange={e => onMode(e.target.value as ChannelPolicy["mode"])}><option value="priority">主备优先</option><option value="balanced">同级分流</option></select></label>
      <p>{mode === "priority" ? "优先级数字越小越先用；同级按原配置顺序。" : "先选优先级，数字越小越优先；同级按权重分流。"}</p>
    </div>
    <div className={styles.sectionTitle}><h4>启用通道</h4><span>{mode === "priority" ? "按配置优先顺序排列" : "按优先级排列 · 同级按权重分配"}</span></div>
    <div className={styles.channelList}>{active.map(renderChannel)}</div>
    {!active.length && <p role="alert" className={styles.empty}>至少启用一条通道后才能保存。</p>}
    {inactive.length > 0 && <details className={styles.inactive}><summary>停用通道 <span>{inactive.length}</span></summary><div className={styles.channelList}>{inactive.map(renderChannel)}</div></details>}
  </div>;
}
