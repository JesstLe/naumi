import type { ModelConfig } from '../src/lib/model-config/types';

/** Explicit administrator repair, not a blanket conversion of unknown models.
 * Retain every manual negative and every unrelated capability/price/map. */
export function repairJimengEditEvidence(source: ModelConfig): ModelConfig {
  const model = source.publicModels.find(m => m.id === 'jimeng-image-5.0-pro');
  if (!model?.enabled || model.target.type !== 'upstream' || model.target.id !== 'local-jimeng-50-pro') throw new Error('即梦发布来源已变化，请重新核对');
  const upstream = source.upstreamModels.find(u => u.id === model.target.id);
  const provider = source.providers.find(p => p.id === upstream?.providerId);
  if (!upstream?.enabled || upstream.model !== 'jimeng/jimeng-image-5.0-pro' || !upstream.capabilities.edit || !provider?.enabled || provider.options?.imageAdapter !== 'reverse-hub') throw new Error('即梦编辑通道与已验收来源不一致');
  const explicit = upstream.capabilities.imagegen?.edit;
  if (explicit) {
    if (explicit.state === 'supported') return structuredClone(source);
    throw new Error('管理员已显式维护编辑能力，保留当前值，不覆盖');
  }
  const result = structuredClone(source);
  const target = result.upstreamModels.find(u => u.id === upstream.id)!;
  target.capabilities.imagegen = { ...target.capabilities.imagegen, edit: {
    state: 'supported',
    source: 'docs/changes/2026-10-12-jimeng-provider-onboarding.md：实际单参考图换色完成并核验2048×2048结果；本次只补历史编辑证据，不声明其他参数均已实测',
    checkedAt: '2026-10-12',
  } };
  return result;
}
