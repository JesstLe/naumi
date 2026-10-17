import assert from 'node:assert/strict';
import {readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const comparison=JSON.parse(await readFile('scripts/video-fusion/comparison.json','utf8')),coverage=JSON.parse(await readFile('scripts/video-fusion/coverage.json','utf8'));
const required=Array.from({length:24},(_,index)=>`V${String(index+1).padStart(2,'0')}`);
assert.deepEqual(comparison.capabilities.map(row=>row.capabilityId),required);assert.equal(comparison.paidVideoCalls,0);
const pins=new Set(Object.values(coverage.upstreamPins)),rows=[];
for(const row of comparison.capabilities){
 assert.ok(pins.has(row.observedVersion),row.capabilityId+' source pin');assert.ok(row.steps?.length&&row.result&&row.limitation,row.capabilityId+' observation and limits');assert.ok(row.evidence?.length,row.capabilityId+' upstream evidence');
 assert.ok(['partial-observation','observed-native-rules-with-limitations','observed-native-generation-with-isolated-supplier','observed-ui-and-backend-with-difference','observed-native-provider-with-limitations','observed-native-tool-with-limitations','blocked-by-observed-source-ui-history'].includes(row.status),row.capabilityId+' honest observation status');
 const capability=coverage.capabilities.find(item=>item.id===row.capabilityId);assert.equal(capability.state,'application-e2e-passed',row.capabilityId+' Naumi behavior acceptance');
 const upstream=[];for(const file of row.evidence){assert.ok((await stat(file)).isFile(),file);const bytes=await readFile(file);assert.ok(bytes.length,file);upstream.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});}
 const naumi=[];for(const key of capability.evidenceKeys){const entry=coverage.evidenceRegistry[key];assert.ok(entry,key);const file=path.resolve(entry.artifact);assert.ok((await stat(file)).isFile(),file);naumi.push({key,kind:entry.kind,artifact:entry.artifact});}
 rows.push({id:row.capabilityId,sourceCommit:row.observedVersion,status:row.status,result:row.result,limitation:row.limitation,upstream,naumi});
}
assert.ok(comparison.onlineLimits?.some(row=>row.url==='https://infinite-canvas-cpco.onrender.com'&&row.result.includes('commit unknown')));
assert.ok(comparison.onlineLimits?.some(row=>row.url==='https://api.toonflow.net'&&row.result.includes('CAPTCHA')));
const native=JSON.parse(await readFile(coverage.evidenceRegistry.icNativeGeneration.artifact,'utf8'));assert.equal(native.ok,true);assert.equal(native.actualLlmStrategyExecuted,false);assert.equal(native.realExternalSupplierRequests,0);assert.deepEqual(native.results.map(row=>row.name),['opening','mosaic','hardcut','same-camera','prequel','editing']);
assert.equal(rows.find(row=>row.id==='V24').status,'blocked-by-observed-source-ui-history');
const output='output/canvas-video-fusion-20261013/checkpoint-d/comparison-audit-20261017.json';
await writeFile(output,JSON.stringify({schemaVersion:1,ok:true,scope:'complete-24-row-comparison-record-with-explicit-source-limitations',all24SourceObservationsLinkedToNaumiAcceptance:true,onlineEntryAttributionAndLimitationsRecorded:true,pinnedLocalFallbackExecuted:true,sourceWorkbenchHistoryFailureRetained:true,realSupplierQualityValidated:false,formalSupplierCalls:0,rows},null,2));
console.log('VIDEO_COMPARISON_AUDIT=PASS observations=24 online_limits_retained=1 source_failures_retained=1 '+output);
