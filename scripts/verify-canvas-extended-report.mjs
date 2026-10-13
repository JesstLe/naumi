import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'output/canvas-win-mac-audit-20261013');
const stage=process.argv[2];assert.ok(['ASSESS','BASELINE','MODIFIED','ROLLBACK'].includes(stage));
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async file=>JSON.parse(await readFile(path.join(dir,file),'utf8'));
if(stage==='ASSESS'){
 const rawBytes=await readFile(path.join(dir,'browser/results.json'));const raw=JSON.parse(rawBytes);assert.equal(raw.results.length,92);
 const keyboard=await json('webkit-keyboard-focus/results.json'),parameters=await json('parameters-button-verified/results.json'),readonly=await json('readonly-verified/results.json');
 assert.equal(keyboard.results.length,1);assert.equal(keyboard.results[0].status,'PASS');assert.equal(parameters.results.length,16);assert.equal(readonly.results.length,4);assert.ok(readonly.results.every(x=>x.status==='PASS'));
 const results=raw.results.map(item=>{
   if(item.id.startsWith('parameters-')){const recheck=parameters.results.find(x=>x.id===item.id&&x.profile===item.profile);assert.ok(recheck);return {...recheck,originalStatus:item.status,originalMessage:item.message,sourceEvidence:'parameters-button-verified/results.json',assessment:'Button-only children match actual parameter content; no text-entry assumption.'};}
   if(item.profile==='mac-webkit-sim'&&item.id==='crop-normal-escape-and-focus-restore')return {...keyboard.results[0],originalStatus:item.status,originalMessage:item.message,sourceEvidence:'webkit-keyboard-focus/results.json',assessment:'Keyboard activation establishes return focus; initial mouse activation does not guarantee WebKit trigger focus.'};
   if(item.id==='properties-readonly-tab-ring')return {...item,id:'properties-overlay-tab-ring',originalId:item.id,assessment:'Original name said readonly, but props were normal editable overlay. Real readOnly=true tested separately.'};
   return item;
 });
 assert.equal(results.filter(x=>x.status==='PASS').length,60);assert.equal(results.filter(x=>x.status==='FAIL').length,32);
 const all=[...results,...readonly.results.map(item=>({...item,sourceEvidence:'readonly-verified/results.json'}))];
 const assessed={...raw,results:all,originalEvidence:'browser/results.json',originalSha256:sha(rawBytes),rawTotals:{checks:92,pass:59,fail:33},totals:{checks:96,pass:64,fail:32},
   confirmedNewIssues:6,risks:1,observations:2,productModified:false,classification:{'parameters-ime-escape':'defensive observation O01; current production children do not include text editors','assistant-legacy-229-enter':'Safari risk R02, native sequence not verified'}};
 await writeFile(path.join(dir,'assessed-results.json'),JSON.stringify(assessed,null,2)+'\n');
 console.log('EXTENDED_ASSESSMENT=PASS CHECKS=96 PASS=64 FAIL=32 RAW=UNCHANGED CONFIRMED_NEW=6 RISK=1 OBSERVATIONS=2 PRODUCT=UNCHANGED');process.exit(0);
}
const file=stage==='BASELINE'?'BASELINE_FILE.md':stage==='MODIFIED'?'MODIFIED_FILE.md':'rollback-rehearsal/MODIFIED_FILE.md';
const bytes=await readFile(path.join(dir,file));
const state=bytes.toString('utf8').includes('Audit-State: AUDITED')?'AUDITED':'PLANNED';
assert.equal(state,stage==='MODIFIED'?'AUDITED':'PLANNED');
const baseline=await readFile(path.join(dir,'BASELINE_FILE.md'));
assert.equal(sha(baseline),'16b92f96241afa466bb2495c169a52a020d457efe7448ff2d261bb5045df111a');
if(stage==='MODIFIED'){
 const report=bytes.toString('utf8');for(const id of ['C13','C14','C15','C16','C17','C18','R02','O01','O02'])assert.ok(report.includes(`| ${id} |`));
 const a=await json('assessed-results.json'),r=await json('runtime/results.json');
 assert.equal(a.originalSha256,sha(await readFile(path.join(dir,'browser/results.json'))));assert.deepEqual(a.totals,{checks:96,pass:64,fail:32});assert.equal(a.results.length,96);
 assert.equal(a.results.filter(x=>x.status==='PASS').length,64);assert.equal(a.results.filter(x=>x.status==='FAIL').length,32);
 assert.equal(a.confirmedNewIssues,6);assert.equal(a.providerCalls,0);assert.equal(a.unroutedApiCalls,0);assert.equal(a.nativeMac,false);assert.deepEqual(a.errors,[]);
 assert.equal(r.findings.length,2);assert.equal(r.controls.length,7);assert.ok(r.controls.every(x=>x.result==='PASS'));assert.equal(r.providerCalls,0);
 for(const [file,hash] of Object.entries(a.sourceHashes))assert.equal(sha(await readFile(path.join(root,file))),hash);
 assert.equal(sha(await readFile(path.join(root,'docs/changes/2026-10-13-canvas-win-mac-audit-continuation.md'))),sha(bytes));
 const prev=await json('previous-baseline-review.json');assert.equal(prev.unchangedBodies.length,4);assert.equal(prev.unchangedFiles.length,4);
 assert.ok(report.includes('JPEG下载统一PNG命名'));
 console.log('EXTENDED_MODIFIED=PASS STATE=AUDITED COMPONENTS=96 PASS=64 FAIL=32 CONFIRMED_NEW=6 RISK=1 OBSERVATIONS=2 CONTROLS=7 PRODUCT=UNCHANGED');
}else{
 assert.equal(sha(bytes),sha(baseline));console.log(stage==='BASELINE'?'EXTENDED_BASELINE=PASS STATE=PLANNED':'EXTENDED_ROLLBACK=PASS STATE=PLANNED HASH=RESTORED');
}
