import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
for(const [file,variable] of [['src/lib/agent/runtime.ts','event'],['src/lib/agent/bridges/pi-bridge.ts','e']]){
 const code=await readFile(file,'utf8'),sf=ts.createSourceFile(file,code,99,true,3);let block;
 function walk(n){if(ts.isIfStatement(n)&&n.expression.getText(sf)===`${variable}.type === "tool_execution_end"`)block=n.thenStatement.getText(sf);ts.forEachChild(n,walk);}walk(sf);assert.ok(block);
 for(const status of ['unavailable','passed','failed']){
  const events=[];let attachments=0;const result={content:[{type:'text',text:'private-provider-secret'}],details:{verificationStatus:status,publicSummary:'inspection-'+status}};
  const event={type:'tool_execution_end',toolCallId:'fixture',toolName:'verify_image_output',result};
  const context=vm.createContext({event,e:event,events,session:{onToolResult:async()=>{attachments++;}},push:(type,data)=>events.push({type,data}),persistAgentSession:async()=>{}});
  const js=ts.transpileModule(`(async()=>${block})()`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;await vm.runInContext(js,context);
  assert.equal(events[0].data.summary,'inspection-'+status);assert.equal(events[0].data.isError,status==='unavailable');assert.ok(!JSON.stringify(events).includes('private-provider-secret'));
  if(variable==='event')assert.equal(attachments,status==='unavailable'?0:1);
 }
}
console.log('VISION_EVENTS=PASS RUNTIME_AND_PIBRIDGE=CONSISTENT UNAVAILABLE=ERROR PUBLIC_SUMMARY=ONLY ATTACH_UNAVAILABLE=SKIPPED');
