import assert from 'node:assert/strict';

export const BANANA_REFERENCE_IDS = ['apib:gemini-3-pro-image-preview', 'apib:gemini-3.1-flash-image-preview'];
export function bananaReferenceConfig(original, direction = 'apply') {
  assert(['apply', 'rollback'].includes(direction));
  const config = structuredClone(original);
  const provider = config.providers.find(p => p.id === 'apib-image');
  assert(provider?.enabled && provider.protocol === 'apimart-images' && provider.baseUrl === 'https://api.apib.ai/v1', 'BANANA_PROVIDER_CHANGED');
  for (const id of BANANA_REFERENCE_IDS) {
    const rows = config.upstreamModels.filter(u => u.id === id);
    assert.equal(rows.length, 1);
    const upstream = rows[0];
    assert(upstream.enabled && upstream.providerId === provider.id && upstream.capabilities.edit, 'BANANA_CHANNEL_CHANGED');
    assert.equal(upstream.capabilities.maxReferenceImages, direction === 'apply' ? 1 : 14, 'BANANA_REFERENCE_BASELINE_CHANGED');
    upstream.capabilities.maxReferenceImages = direction === 'apply' ? 14 : 1;
  }
  return config;
}
