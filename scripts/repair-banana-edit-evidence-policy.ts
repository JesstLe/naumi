import assert from 'node:assert/strict';
import type { ModelConfig } from '../src/lib/model-config/types';

export const BANANA_EDIT_PROOFS = [
  { id: 'geeknow-nano-banana-pro', model: 'gemini-3-pro-image-preview', call: 'fdd50214-3389-4eac-888b-cae521448598', job: 'job-449bfcbd-0fb2-4220-a0b0-fdfac1b25c4a' },
  { id: 'geeknow-nano-banana-2', model: 'gemini-nano-banana-2.1', call: '7cd9a47e-632a-4e9d-b863-9a008293d9ca', job: 'job-048ed97c-5be2-47fe-9b1a-479325760532' },
] as const;

/** One-off administrator repair; never infer a supplier-wide capability. */
export function repairBananaEditEvidence(source: ModelConfig): ModelConfig {
  const provider = source.providers.find(p => p.id === 'geeknow-images');
  assert.ok(provider?.enabled && provider.protocol === 'openai-images' && provider.baseUrl === 'https://www.geeknow.top/v1', '已验收供应商入口已变化');
  const result = structuredClone(source);
  for (const proof of BANANA_EDIT_PROOFS) {
    const upstream = result.upstreamModels.find(u => u.id === proof.id);
    assert.ok(upstream?.enabled && upstream.modality === 'image' && upstream.model === proof.model && upstream.providerId === provider.id && upstream.capabilities.edit && upstream.capabilities.maxReferenceImages === 1, '已验收单参考图通道已变化');
    assert.ok(result.publicModels.some(m => m.enabled && m.supplierRouting?.channels.some(c => c.enabled && c.upstreamId === proof.id)), '已验收通道已退出公开路由');
    if (Object.hasOwn(upstream.capabilities.imagegen || {}, 'edit')) {
      assert.equal(upstream.capabilities.imagegen?.edit?.state, 'supported', '保留管理员显式编辑能力，不覆盖');
      continue;
    }
    upstream.capabilities.imagegen = { ...upstream.capabilities.imagegen, edit: {
      state: 'supported', checkedAt: '2026-10-15',
      source: `47已验收单参考图编辑；supplier call ${proof.call} phase=edit delivered=1，${proof.job} completed 私有媒体1024x1024；不声明其他参数已实测`,
    } };
  }
  return result;
}

/** Remove only this patch; retain unrelated edits made after publication. */
export function rollbackBananaEditEvidence(current: ModelConfig, original: ModelConfig): ModelConfig {
  const expected = repairBananaEditEvidence(original), result = structuredClone(current);
  for (const proof of BANANA_EDIT_PROOFS) {
    const before = original.upstreamModels.find(u => u.id === proof.id)!;
    const after = expected.upstreamModels.find(u => u.id === proof.id)!;
    const target = result.upstreamModels.find(u => u.id === proof.id);
    assert.ok(target && target.model === after.model && target.providerId === after.providerId, '回滚来源已变化');
    assert.deepEqual(target.capabilities.imagegen?.edit, after.capabilities.imagegen?.edit, '回滚前编辑证据已由他人更新');
    if (Object.hasOwn(before.capabilities.imagegen || {}, 'edit')) continue;
    delete target.capabilities.imagegen!.edit;
    if (!Object.keys(target.capabilities.imagegen!).length && !before.capabilities.imagegen) delete target.capabilities.imagegen;
  }
  return result;
}
