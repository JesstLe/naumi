import assert from 'node:assert/strict';
import type {ModelConfig} from '../src/lib/model-config/types';

export const X6_FLASH_RATIO_SOURCE='https://docs.apimart.ai/en/api-reference/images/gemini-3.1-flash/generation.md';
export const X6_FLASH_ORIGINAL_RATIOS=['1:1','3:2','2:3','4:3','3:4','5:4','4:5','16:9','9:16','2:1','1:2','21:9'] as const;
const target=(config:ModelConfig)=>{
 const matches=config.upstreamModels.filter(u=>u.id==='apib:gemini-3.1-flash-image-preview');
 assert.equal(matches.length,1,'X6_FLASH_ROUTE_IDENTITY_CHANGED');const upstream=matches[0];
 const providers=config.providers.filter(p=>p.id===upstream.providerId);
 assert(upstream.model==='gemini-3.1-flash-image-preview'&&upstream.providerId==='apib-image'&&providers.length===1&&providers[0].protocol==='apimart-images','X6_FLASH_ROUTE_IDENTITY_CHANGED');
 assert(upstream.parameterMap.apimartImages&&upstream.parameterMap.resolutionPolicy?.ratioField==='size','X6_FLASH_WIRE_CONTRACT_CHANGED');
 return{upstream,provider:providers[0],policy:upstream.parameterMap.apimartImages};
};

/** Pure copy transform, no I/O. APIB's public /api/status links to the exact
 * source above. Its size enum excludes 1:2 and 2:1. Do not add new ratios or
 * infer runtime support, and never overwrite a later administrator list. */
export function repairX6FlashRatios(original:ModelConfig):ModelConfig {
 const result=structuredClone(original),{upstream,provider,policy}=target(result);
 if(!upstream.enabled||!provider.enabled)return result;
 if(JSON.stringify(policy.ratios)!==JSON.stringify(X6_FLASH_ORIGINAL_RATIOS))return result;
 policy.ratios=policy.ratios.filter(r=>r!=='1:2'&&r!=='2:1');
 return result;
}

/** Pure copy-only inverse; no database/filesystem operation. A caller may use
 * the result only through a fresh CAS publication. All checks precede edits;
 * unrelated later fields remain unchanged. */
export function rollbackX6FlashRatios(current:ModelConfig,original:ModelConfig):ModelConfig {
 const before=target(original),expected=target(repairX6FlashRatios(original));
 const result=structuredClone(current);
 if(JSON.stringify(before.policy.ratios)===JSON.stringify(expected.policy.ratios))return result;
 const now=target(current);
 assert.deepEqual(now.policy.ratios,expected.policy.ratios,'X6_FLASH_ROLLBACK_LATER_EDIT');
 target(result).policy.ratios=[...before.policy.ratios];
 return result;
}
