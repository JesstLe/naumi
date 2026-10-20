import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as resolution from '../src/lib/model-config/resolution-fallback';
const baseline=process.argv.includes('--baseline');
const config=JSON.parse(readFileSync('output/image-channel-compatibility-20261020/MODEL_REDACTED.json','utf8')).config;
let unknown=0,checks=0;
for(const u of config.upstreamModels.filter((u:any)=>u.enabled&&u.modality==='image'&&config.providers.some((p:any)=>p.id===u.providerId&&p.enabled))){
 const tiers=resolution.upstreamResolutionTiers(u,'1:1');
 const declared=u.parameterMap.resolutionPolicy?.mode==='map'||u.capabilities.nativeResolutions.length>0||Object.keys(u.parameterMap.resolution||{}).length>0||!!u.parameterMap.apimartImages;
 if(declared)continue;
 unknown++;
 for(const t of ['1K','2K','4K']){
  const accepted=baseline?tiers.includes(t):resolution.upstreamAcceptsResolution(u,t,'1:1');
  assert.equal(accepted,!baseline,u.id+':'+t);checks++;
 }
}
assert.ok(unknown>0);
if(!baseline){
 const u=structuredClone(config.upstreamModels.find((u:any)=>u.modality==='image'));
 u.parameterMap={resolutionPolicy:{mode:'map',field:'resolution',values:{'1K':'1k','2K':'2k'}}};u.capabilities.nativeResolutions=[];
 assert.equal(resolution.upstreamAcceptsResolution(u,'4K','1:1'),false);
 assert.equal(resolution.upstreamAcceptsResolution(u,'2K','1:1'),true);checks+=2;
 for(const f of ['src/lib/imagegen/plan.ts','src/lib/model-config/execution.ts'])assert.match(readFileSync(f,'utf8'),/upstreamAcceptsResolution\(/);
}
console.log(`${baseline?'BASELINE=REPRODUCED UNKNOWN_TIER_CHANNELS_REJECTED':'MODIFIED=PASS UNKNOWN_TIER_CHANNELS_PRESERVED'} CHANNELS=${unknown} CHECKS=${checks} EXPLICIT_CONTRACT=STRICT SUPPLIER_CALLS=0`);
