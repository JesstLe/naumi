// Evaluate both actual recovery call sites against the actual pure state helper.
// No task/lease edits or production I/O. Baseline is read from --source-root.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),vm=require('node:vm');
const {build}=require('esbuild');
async function main(){
 const root=path.resolve(process.argv[2]||'.'),source=fs.readFileSync(path.join(root,'src/lib/video/runtime.ts'),'utf8'),ast=ts.createSourceFile('runtime.ts',source,99,true),expressions=[];
 (function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='admission'&&node.initializer)expressions.push(node.initializer.getText(ast));ts.forEachChild(node,visit);})(ast);assert.equal(expressions.length,2);
 const helper=path.join(root,'src/lib/video/submission-state.ts'),entry=`import * as state from ${JSON.stringify(helper)};const {videoRecoveryAdmission}=state;export const probes=[${expressions.map(expression=>`task=>(${expression})`).join(',')}];`;
 const compiled=await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs'}),module={exports:{}};vm.runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports});
 const cases=[
  ['v3-prepared',3,'prepared','','claim'],['v3-sending',3,'sending','','continuation'],['v3-missing',3,undefined,'','continuation'],['v3-unrecognized',3,'new-state','','continuation'],
  ['v2-prepared',2,'prepared','','claim'],['v2-sending',2,'sending','','continuation'],['v2-missing',2,undefined,'','continuation'],
  ['legacy-create',undefined,undefined,'','claim'],['future-legacy-semantics',4,'sending','','claim'],['queued-receipt-preserves-existing-classification',3,'sending','original-upstream','claim'],['legacy-queued-receipt',undefined,undefined,'original-upstream','claim'],
  ['known-processing-receipt',3,'sending','original-upstream','continuation','processing'],['legacy-processing-receipt',undefined,undefined,'original-upstream','continuation','processing'],
 ];let checks=0;
 for(const [name,version,submissionState,upstreamId,expected,status='queued'] of cases)for(const [index,probe] of module.exports.probes.entries()){
  const actual=probe({status,upstreamId,parameters:{version,submissionState}});
  if(actual!==expected){console.log(`VIDEO_RECOVERY_ADMISSION=FAIL CASE=${name} PATH=${index} EXPECTED=${expected} ACTUAL=${actual}`);assert.equal(actual,expected);}
  checks++;
 }
 console.log(`VIDEO_RECOVERY_ADMISSION=PASS CASES=${cases.length} CHECKS=${checks} ACTUAL_RECOVERY_PATHS=2 PAID_POSTS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
