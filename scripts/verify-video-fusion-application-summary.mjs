import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Consolidate completed cases from preserved attempts; incomplete attempts stay visible.
// This is a module coverage audit, not the fixed release or whole-goal acceptance gate.
const root=path.resolve('output/canvas-video-fusion-20261013/checkpoint-d');
const runs=process.argv.find(value=>value.startsWith('--runs='))?.slice(7).split(',');
assert.ok(runs?.length,'Pass the actual application-protocols run directory names');
const manifest=JSON.parse(await readFile('scripts/video-fusion/application-protocol-cases.json','utf8'));
assert.equal(manifest.cases.length,51);
const expected=new Map(manifest.cases.map(item=>[item.id,item]));
assert.equal(expected.size,51);
const evidence=new Map(),attempts=[];
for(const run of runs){
  assert.match(run,/^application-protocols-[0-9a-f-]{36}$/);
  const resultPath=path.join(root,run,'result.json');
  const bytes=await readFile(resultPath),result=JSON.parse(bytes);
  assert.equal(result.schemaVersion,1);assert.equal(result.actualAppDbRouterWorker,true);
  assert.equal(result.paidVideoApiCalls,0);assert.equal(result.realVideoQualityValidated,false);
  assert.equal(result.completedCases,result.evidence.length);
  attempts.push({run,sha256:createHash('sha256').update(bytes).digest('hex'),completedCases:result.completedCases,scope:result.scope,fullRunCompleted:result.ok});
  for(const item of result.evidence){
    const planned=expected.get(item.id);assert.ok(planned,`Unexpected case ${item.id}`);
    assert.equal(item.profile,planned.profile);assert.equal(item.mode,planned.mode);
    for(const flag of ['actualRawWireValidated','actualAppAndWorkerCompleted','actualPrivateMediaHashesAndOwnership','idempotencyAndSettlement'])assert.equal(item[flag],true,`${item.id}: ${flag}`);
    assert.match(item.taskId,/^vid-/);assert.ok(item.expectedPath.startsWith('/'));
    assert.match(item.originalSha256,/^[0-9a-f]{64}$/);
    assert.ok(item.assets.length>0);
    if(planned.extra.multiOutput)assert.equal(item.assets.length,2);
    for(const asset of item.assets){assert.match(asset.sha256,/^[0-9a-f]{64}$/);assert.ok(asset.artworkId);assert.ok(asset.probe.durationSeconds>0);assert.ok(asset.probe.width>0&&asset.probe.height>0);}
    const calls=JSON.parse(await readFile(path.join(root,run,`${item.profile}-calls.json`),'utf8'));
    assert.ok(calls.length>0,`${item.id}: no native supplier create evidence`);
    evidence.set(item.id,{...item,run});
  }
}
const missing=manifest.cases.filter(item=>!evidence.has(item.id)).map(item=>item.id);
assert.deepEqual(missing,[],'Missing actual application cases');
const ordered=manifest.cases.map(item=>evidence.get(item.id));
assert.equal(new Set(ordered.map(item=>item.profile)).size,41);
const summary={schemaVersion:1,ok:true,scope:'all-51-cases-41-native-profiles',completedCases:51,completedProfiles:41,actualAppDbRouterWorker:true,paidVideoApiCalls:0,realVideoQualityValidated:false,wholeGoalAccepted:false,fixedReleaseValidated:false,attempts,evidence:ordered};
const output=path.join(root,'application-protocols-summary.json');
await writeFile(output,JSON.stringify(summary,null,2)+'\n');
process.stdout.write(`VIDEO_APPLICATION_PROTOCOL_SUMMARY=PASS cases=51 profiles=41 ${output}\n`);
