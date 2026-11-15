import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {verifyVideoInputEquivalence} from './video-compiler-input-equivalence';
import {verifyVideoProcessBrowser} from './video-compiler-process-browser';

/** Host-side real browser acceptance of the immutable Linux package. The RPC
 * bridge only observes fixture DB facts and controls its owned Worker. */
async function main(){
 const file=path.resolve(process.argv[2]),session=JSON.parse(await readFile(file,'utf8')),root=path.dirname(file),commands=path.join(root,'commands');
 assert.equal(session.runtime?.mode,'production');assert.match(session.runtime.commit,/^[a-f0-9]{40}$/);assert(session.historyTaskId);
 const rpc=async(command:unknown)=>{
  const tag=randomUUID(),out=path.join(commands,'result-'+tag+'.json');await writeFile(path.join(commands,'cmd-'+tag+'.json'),JSON.stringify(command));
  const end=Date.now()+180000;
  for(;;){try{const value=JSON.parse(await readFile(out,'utf8'));assert(value.ok,value.error);return value.value;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(Date.now()>end)throw Error('Production UI bridge deadline');await new Promise(resolve=>setTimeout(resolve,150));}
 };
 const run=async(script:string)=>{
  const child=spawn(process.execPath,[script,file],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:'inherit'});
  const code=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?1:code??1));});assert.equal(code,0,script);
 };
 try{
  const version=await(await fetch(session.origin+'/api/version')).json();assert.equal(version.commit,session.runtime.commit);
  const before=await rpc({action:'snapshot'});
  if(process.argv.includes('--production-input-equivalence')){assert(session.inputEquivalence?.files?.length===3,'Production input bridge metadata missing');await assert.rejects(()=>rpc({action:'input-equivalence',op:'counts'}),/storyboard not finished/);}
  await verifyVideoProcessBrowser({origin:session.origin,cookie:session.cookie,taskId:session.historyTaskId,outputDir:root,posts:()=>before.postsAdded});
  const after=await rpc({action:'snapshot'});assert.equal(after.postsAdded,before.postsAdded);assert.deepEqual(after.ledgerAdded,before.ledgerAdded);assert.deepEqual(after.tasks,before.tasks);
  await run('scripts/video-compiler-canvas-recovery-browser.cjs');
  const afterRecovery=await rpc({action:'snapshot'});assert.equal(afterRecovery.postsAdded,before.postsAdded);assert.deepEqual(afterRecovery.ledgerAdded,before.ledgerAdded);
  // The existing full driver finishes the bridge only after actual split/merge,
  // budget confirmation, review/adoption, clean fork, assembly and remake.
  await run('scripts/video-compiler-storyboard-browser.cjs');
  let inputChecks=0;
  if(process.argv.includes('--production-input-equivalence')){
   assert(session.inputEquivalence?.files?.length===3,'Production input bridge metadata missing');
   let observedPosts=0;const observe=async(op:string,extra:Record<string,unknown>={})=>{const response=await rpc({action:'input-equivalence',op,...extra});observedPosts=response.posts;return response.result;};await observe('counts');await assert.rejects(()=>observe('node',{id:'storyboard-browser-a'}));await assert.rejects(()=>observe('unknown'));
   const files=await Promise.all(session.inputEquivalence.files.map(async(file:{kind:'image'|'video'|'audio';name:string;mimeType:string;file:string})=>{assert(path.basename(file.file)===file.file);return {...file,buffer:await readFile(path.join(root,file.file))};}));
   await verifyVideoInputEquivalence({origin:session.origin,cookie:session.cookie,outputDir:root,files,posts:()=>observedPosts,
    snapshotCounts:()=>observe('counts'),foreignPreview:asset=>observe('foreign',{asset}),observeNode:id=>observe('node',{id}),readPlan:id=>observe('plan',{id}),complete:id=>observe('complete',{id}),observeLedger:id=>observe('ledger',{id}),observeParent:id=>observe('parent',{id})});
   const actual=JSON.parse(await readFile(path.join(root,'INPUT_EQUIVALENCE_RESULT.json'),'utf8'));assert.equal(actual.checks.length,21);inputChecks=actual.checks.length;await observe('finish');
  }
  const workbench=JSON.parse(await readFile(path.join(root,'BROWSER_RESULT.json'),'utf8')),canvas=JSON.parse(await readFile(path.join(root,'CANVAS_RECOVERY_BROWSER.json'),'utf8')),storyboard=JSON.parse(await readFile(path.join(root,'STORYBOARD_BROWSER_RESULT.json'),'utf8'));
  assert.equal(workbench.checks,4);assert.equal(canvas.results.length,2);assert(canvas.results.every((row:{ok:boolean})=>row.ok));assert.equal(storyboard.checks.length,10);
  await writeFile(path.join(root,'PRODUCTION_UI_RESULT.json'),JSON.stringify({ok:true,checks:workbench.checks+canvas.results.length+storyboard.checks.length+inputChecks,inputChecks,version,runtime:session.runtime,actualPackage:true,successHttpMocks:0,reactInjection:0,paidCalls:0},null,2));
  console.log('PRODUCTION_VIDEO_UI=PASS CHECKS='+(16+inputChecks)+' WORKBENCH=4 CANVAS_RECOVERY=2 STORYBOARD=10 INPUT_EQUIVALENCE='+inputChecks+' REAL_PACKAGE=1');
 }catch(error){
  await writeFile(path.join(root,'PRODUCTION_UI_FAILURE.json'),JSON.stringify({error:String(error),runtime:session.runtime},null,2));
  try{await rpc({action:'abort'});}catch(abort){console.error('PRODUCTION_UI_ABORT='+String(abort));}
  throw error;
 }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
