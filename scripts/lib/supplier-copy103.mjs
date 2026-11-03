import { isIP } from 'node:net';
import { canonical, digest } from './apib-activation.mjs';

const GROUPS = ['providers', 'upstreamModels', 'publicModels', 'pools'];
const clone = value => structuredClone(value);
const same = (left, right) => canonical(left) === canonical(right);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const slot = (parent, key) => Object.hasOwn(parent, key) ? { present: true, value: clone(parent[key]) } : { present: false };
const absent = () => ({ present: false });
const requireThat = (condition, code) => { if (!condition) throw new Error(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

function index(rows, identity, path) {
  requireThat(Array.isArray(rows), `ARRAY_REQUIRED:${path}`);
  const result = new Map();
  for (const row of rows) {
    requireThat(typeof row?.[identity] === 'string' && !result.has(row[identity]), `ROW_IDENTITY:${path}`);
    result.set(row[identity], row);
  }
  return result;
}

/** Detect site-bound endpoints, but never infer a destination URL or resolve DNS. */
export function supplierCopy103LocalEndpoints(config) {
  const result = [];
  for (const provider of config.providers) {
    for (const [field, value] of [['baseUrl', provider.baseUrl], ['options.appUrl', provider.options?.appUrl]]) {
      if (value === undefined) continue;
      let url;
      try { url = new URL(value); } catch { throw new Error(`ENDPOINT_INVALID:${provider.id}:${field}`); }
      requireThat(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
        `ENDPOINT_SECRET_OR_INVALID:${provider.id}:${field}`);
      const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, ''), family = isIP(host);
      let reason;
      if (host === '47.105.59.142') reason = 'SOURCE_SITE_ENDPOINT';
      else if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host.startsWith('127.')) reason = 'LOOPBACK';
      else if (host.endsWith('.internal') || host.endsWith('.local') || !family && !host.includes('.')) reason = 'LOCAL_SERVICE_NAME';
      else if (family === 6 && !/^2[0-9a-f]{3}:/i.test(host)) reason = 'PRIVATE_OR_SPECIAL_IP';
      else if (family === 4) {
        const [a, b] = host.split('.').map(Number);
        if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
          a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19)) reason = 'PRIVATE_OR_SPECIAL_IP';
      }
      if (reason) result.push({ providerId: provider.id, field, origin: url.origin, host, reason });
    }
  }
  return result;
}

function references(config) {
  const refs = [];
  const add = (group, id, from) => { if (id !== undefined) refs.push({ group, id, from }); };
  for (const row of config.upstreamModels) add('providers', row.providerId, `upstreamModels.${row.id}.providerId`);
  for (const row of config.publicModels) {
    add(row.target.type === 'pool' ? 'pools' : 'upstreamModels', row.target.id, `publicModels.${row.id}.target`);
    for (const channel of row.supplierRouting?.channels || []) add('upstreamModels', channel.upstreamId, `publicModels.${row.id}.supplierRouting`);
  }
  for (const row of config.pools) for (const id of row.candidates) add('upstreamModels', id, `pools.${row.id}.candidates`);
  for (const [key, id] of Object.entries(config.bindings || {})) add('publicModels', id, `bindings.${key}`);
  for (const [feature, business] of Object.entries(config.business || {})) {
    add('publicModels', business.defaultModelId, `business.${feature}.defaultModelId`);
    for (const option of business.options || []) {
      add('publicModels', option.modelId, `business.${feature}.options`);
      add('upstreamModels', option.routing?.defaultUpstreamId, `business.${feature}.${option.modelId}.routing`);
      for (const rule of option.routing?.rules || []) add('upstreamModels', rule.targetUpstreamId, `business.${feature}.${option.modelId}.routing.rules`);
    }
  }
  const preset = config.defaultImagePreset;
  if (preset) {
    add('upstreamModels', preset.upstreamId, 'defaultImagePreset.upstreamId');
    if (preset.enabled) for (const alias of preset.aliases || []) add('publicModels', alias.id, 'defaultImagePreset.aliases');
    for (const id of Object.values(preset.defaultModelIds || {})) add('publicModels', id, 'defaultImagePreset.defaultModelIds');
  }
  return refs;
}

function missingReferences(config) {
  const ids = Object.fromEntries(GROUPS.map(group => [group, new Set(config[group].map(row => row.id))]));
  return references(config).filter(ref => !ids[ref.group].has(ref.id));
}

/** Pure, credential-reference-only transformation. Does not publish, import keys,
 * read files, discover models, perform I/O or change target customer pricing.
 * Caller must review conflicts/endpoints and run the real schema + publication
 * CAS against fresh target config/billing. This plan is not deployment approval. */
export function makeSupplierCopy103Plan(source47, target103, credentialRefs) {
  requireThat(source47?.schemaVersion === 1 && target103?.schemaVersion === 1, 'SCHEMA_VERSION_REQUIRED');
  requireThat(object(credentialRefs), 'CREDENTIAL_MAP_REQUIRED');
  const config = clone(target103), delta = [], conflicts = [];
  const sourceCounts = {}, sourceDigest = digest(source47), baselineDigest = digest(target103);
  for (const group of GROUPS) {
    const source = index(source47[group], 'id', `source.${group}`), target = index(config[group], 'id', `target.${group}`);
    sourceCounts[group] = source.size;
    for (const [id, original] of source) {
      const existing = target.get(id), next = clone(original);
      if (group === 'providers') {
        if (original.credentialRef !== undefined) {
          const mapping = credentialRefs[id], mapped = typeof mapping === 'string' ? mapping : mapping?.targetCredentialRef;
          requireThat(uuid(original.credentialRef) && uuid(mapped) && mapped !== original.credentialRef, `CREDENTIAL_MAPPING_REQUIRED:${id}`);
          if (object(mapping)) requireThat(mapping.sourceCredentialRef === original.credentialRef, `CREDENTIAL_SOURCE_CHANGED:${id}`);
          next.credentialRef = mapped;
        } else requireThat(!original.enabled, `SOURCE_ENABLED_WITHOUT_CREDENTIAL:${id}`);
      }
      if (group === 'publicModels') {
        if (next.toolScope) next.toolScope.defaultFor = clone(existing?.toolScope?.defaultFor || []);
        else if (existing?.toolScope) next.toolScope = clone(existing.toolScope);
        const defaults = next.toolScope?.defaultFor || [];
        if (defaults.length && (!next.enabled || !next.visible || defaults.some(feature => !next.toolScope.features.includes(feature))))
          conflicts.push({ code: 'TARGET_DEFAULT_SCOPE_CONFLICT', group, id, defaultFor: clone(defaults) });
      }
      const identityFields = group === 'providers' ? ['protocol', 'baseUrl'] : group === 'upstreamModels' ? ['providerId', 'model', 'modality'] : group === 'publicModels' ? ['modality', 'target'] : ['modality'];
      if (existing) for (const field of identityFields) if (!same(existing[field], next[field]))
        conflicts.push({ code: 'SAME_ID_IDENTITY_CHANGED', group, id, field });
      const before = existing ? { present: true, value: clone(existing) } : absent(), after = { present: true, value: next };
      if (!same(before, after)) {
        delta.push({ kind: 'row', group, id, before, after: clone(after) });
        if (existing) config[group][config[group].findIndex(row => row.id === id)] = next;
        else config[group].push(next);
      }
    }
  }
  sourceCounts.businessOptionsMatched = 0;
  for (const [feature, sourceBusiness] of Object.entries(source47.business || {})) {
    const targetBusiness = config.business?.[feature];
    const sourceOptions = index(sourceBusiness.options, 'modelId', `source.business.${feature}`);
    if (!targetBusiness) continue;
    index(targetBusiness.options, 'modelId', `target.business.${feature}`);
    for (const option of targetBusiness.options) {
      const sourceOption = sourceOptions.get(option.modelId);
      if (!sourceOption) continue;
      sourceCounts.businessOptionsMatched++;
      for (const field of ['routing', 'parameters']) {
        const before = slot(option, field), after = slot(sourceOption, field);
        if (same(before, after)) continue;
        delta.push({ kind: 'business-option', feature, modelId: option.modelId, field, before, after });
        if (after.present) option[field] = clone(after.value); else delete option[field];
      }
    }
  }
  for (const ref of missingReferences(config)) conflicts.push({ code: 'REFERENCE_MISSING', ...ref });
  for (const [binding, id] of Object.entries(config.bindings || {})) {
    if (!config.publicModels.find(row => row.id === id)?.enabled) conflicts.push({ code: 'TARGET_BINDING_DISABLED', binding, id });
  }
  const localEndpoints = supplierCopy103LocalEndpoints(config);
  const plan = { schemaVersion: 1, sourceDigest, baselineDigest, candidateDigest: digest(config), config, delta, sourceCounts, conflicts, localEndpoints,
    policy: { sourceSite: '47', targetSite: '103', customerPricing: 'TARGET_UNCHANGED', customerDefaults: 'TARGET_UNCHANGED', credentialPayloads: 0, networkCalls: 0, databaseWrites: 0 } };
  // Reject coding regressions before a caller can persist a publication request.
  requireThat(digest(rollbackSupplierCopy103(config, plan)) === baselineDigest, 'INVERSE_NOT_EXACT');
  requireThat(digest(source47) === sourceDigest && digest(target103) === baselineDigest, 'INPUT_MUTATED');
  return plan;
}

function restoreChannels(current, before, after, path) {
  const b = index(before, 'upstreamId', `${path}.before`), a = index(after, 'upstreamId', `${path}.after`), c = index(current, 'upstreamId', `${path}.current`);
  const result = clone(current);
  for (const id of new Set([...b.keys(), ...a.keys()])) {
    const restored = restore(c.has(id) ? { present: true, value: c.get(id) } : absent(), b.has(id) ? { present: true, value: b.get(id) } : absent(), a.has(id) ? { present: true, value: a.get(id) } : absent(), `${path}.${id}`);
    const position = result.findIndex(row => row.upstreamId === id);
    if (restored.present) { if (position === -1) result.push(restored.value); else result[position] = restored.value; }
    else if (position !== -1) result.splice(position, 1);
  }
  const beforeIds = [...b.keys()], afterIds = [...a.keys()];
  if (!same(beforeIds, afterIds)) {
    requireThat(same(current.filter(row => a.has(row.upstreamId)).map(row => row.upstreamId), afterIds), `ROLLBACK_FIELD_CONFLICT:${path}.order`);
    return [...beforeIds.map(id => result.find(row => row.upstreamId === id)), ...result.filter(row => !b.has(row.upstreamId))];
  }
  return result;
}

function restore(current, before, after, path) {
  if (same(before, after)) return clone(current);
  if (same(current, after)) return clone(before);
  if (current.present && before.present && after.present && object(current.value) && object(before.value) && object(after.value)) {
    const result = clone(current.value);
    for (const key of new Set([...Object.keys(before.value), ...Object.keys(after.value)])) {
      const restored = restore(slot(result, key), slot(before.value, key), slot(after.value, key), `${path}.${key}`);
      if (restored.present) result[key] = restored.value; else delete result[key];
    }
    return { present: true, value: result };
  }
  if (path.endsWith('.channels') && current.present && before.present && after.present && [current.value, before.value, after.value].every(Array.isArray))
    return { present: true, value: restoreChannels(current.value, before.value, after.value, path) };
  throw new Error(`ROLLBACK_FIELD_CONFLICT:${path}`);
}

/** Selective three-way inverse; later edits to untouched leaves survive.
 * An edit to our own changed leaf, changed newly-added row or new dependent
 * blocks the entire inverse. No mutation or partial rollback escapes on error. */
export function rollbackSupplierCopy103(current, plan) {
  requireThat(plan?.schemaVersion === 1 && Array.isArray(plan.delta), 'ROLLBACK_PLAN_INVALID');
  const config = clone(current);
  for (const change of [...plan.delta].reverse()) {
    if (change.kind === 'row') {
      requireThat(GROUPS.includes(change.group), 'ROLLBACK_GROUP_INVALID');
      const rows = config[change.group];
      index(rows, 'id', change.group);
      const position = rows.findIndex(row => row.id === change.id);
      const restored = restore(position < 0 ? absent() : { present: true, value: rows[position] }, change.before, change.after, `${change.group}.${change.id}`);
      if (restored.present) {
        requireThat(position >= 0, `ROLLBACK_ROW_REMOVED:${change.group}.${change.id}`);
        rows[position] = restored.value;
      } else if (position >= 0) rows.splice(position, 1);
    } else {
      requireThat(change.kind === 'business-option' && ['routing', 'parameters'].includes(change.field), 'ROLLBACK_CHANGE_INVALID');
      const rows = config.business?.[change.feature]?.options;
      const option = index(rows, 'modelId', `business.${change.feature}`).get(change.modelId);
      requireThat(option, `ROLLBACK_OPTION_REMOVED:${change.feature}.${change.modelId}`);
      const restored = restore(slot(option, change.field), change.before, change.after, `business.${change.feature}.${change.modelId}.${change.field}`);
      if (restored.present) option[change.field] = restored.value; else delete option[change.field];
    }
  }
  const missing = missingReferences(config);
  requireThat(!missing.length, `ROLLBACK_DEPENDENCY_HOLD:${missing[0]?.from || ''}`);
  return config;
}
