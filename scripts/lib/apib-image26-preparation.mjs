import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (value, code) => { if (!value) throw new Error(code); };
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object'
  ? `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')}}` : JSON.stringify(value);

/** Offline additive preparation only. No fetch, credential decryption, SQL, or publication. */
export function prepareAPIBImage26({snapshot, catalog, manifest, expectedVersion, expectedDigest}) {
  requireValue(Number.isSafeInteger(expectedVersion) && expectedVersion > 0 && /^(?:[1-9]\d*)$/.test(String(snapshot?.version)) && Number(snapshot.version) === expectedVersion && snapshot?.digest === expectedDigest, 'BASELINE_CHANGED');
  requireValue(sha256(canonical(snapshot.config)) === expectedDigest, 'BASELINE_CONTENT_DIGEST_MISMATCH');
  requireValue(manifest?.schemaVersion === 1 && manifest.baseUrl === 'https://api.apib.ai/v1' && manifest.providerId === 'apib-image', 'MANIFEST_TARGET_MISMATCH');
  requireValue(catalog?.source === 'https://api.apib.ai/v1/models' && catalog.httpStatus === 200 && Array.isArray(catalog.models), 'CATALOG_SOURCE_MISMATCH');
  const ids = catalog.models.map(row => typeof row === 'string' ? row : row.id);
  requireValue(ids.every(id => typeof id === 'string') && new Set(ids).size === ids.length, 'CATALOG_DUPLICATE_OR_INVALID_ID');
  requireValue(Array.isArray(manifest.models) && manifest.models.length > 0, 'NO_SELECTED_MODELS');
  requireValue(new Set(manifest.models.map(row => row.id)).size === manifest.models.length, 'MANIFEST_DUPLICATE_MODEL');
  const original = snapshot.config;
  const provider = original?.providers?.find(row => row.id === manifest.providerId);
  requireValue(provider?.protocol === 'apimart-images' && provider.baseUrl.replace(/\/$/, '') === manifest.baseUrl, 'EXISTING_PROVIDER_CONTRACT_MISMATCH');
  const config = structuredClone(original), additions = [];
  for (const selected of manifest.models) {
    requireValue(ids.includes(selected.id), 'MODEL_NOT_IN_AUTHENTICATED_CATALOG:' + selected.id);
    const row = selected.upstream;
    requireValue(/^(?:gpt-image-2\.6-(?:ext|flare|sunburst)|mai-image-2\.6(?:-flash)?)$/.test(selected.id), 'UNEXPECTED_MODEL_ID');
    requireValue(row?.id === 'apib:' + selected.id && row.providerId === provider.id && row.model === selected.id && row.modality === 'image', 'UPSTREAM_IDENTITY_MISMATCH');
    requireValue(row.enabled === false && row.capabilities?.verified === false, 'CANDIDATE_MUST_REMAIN_DISABLED_UNVERIFIED');
    requireValue(!Object.hasOwn(row, 'procurement') && !Object.hasOwn(row, 'costRef'), 'UNAPPROVED_PRICE_IN_CANDIDATE');
    requireValue(selected.documentation?.url?.startsWith('https://docs.apimart.ai/en/api-reference/images/') && /^[a-f0-9]{64}$/.test(selected.documentation.sha256), 'DOCUMENTATION_EVIDENCE_REQUIRED');
    const old = config.upstreamModels.find(x => x.id === row.id);
    if (old) requireValue(isDeepStrictEqual(old, row), 'UPSTREAM_COLLISION:' + row.id);
    else { config.upstreamModels.push(structuredClone(row)); additions.push(row.id); }
  }
  for (const [key, value] of Object.entries(original)) {
    if (key === 'upstreamModels') {
      requireValue(config.upstreamModels.slice(0, value.length).every((row, i) => isDeepStrictEqual(row, value[i])), 'OLD_UPSTREAM_CHANGED');
    } else requireValue(isDeepStrictEqual(config[key], value), 'ORIGINAL_FIELD_CHANGED:' + key);
  }
  return {state:'OFFLINE_DISABLED_UNVERIFIED', basedOnVersion:expectedVersion, basedOnDigest:expectedDigest, config,
    additions, contracts:structuredClone(manifest.models),
    summary:{selectedWireModels:manifest.models.length, newlyEnabledModels:0, providerChanges:0, publicModelChanges:0, billingChanges:0, productionWrites:0, generationCalls:0},
    evidenceBoundary:'Authenticated directory plus related documentation only; no live APIB generation or output acceptance.'};
}
