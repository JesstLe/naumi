require('tsx/cjs');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const helpers=require('../src/lib/canvas/generation-failure.ts'),{ImagegenHttpError}=require('../src/lib/imagegen/http.ts');
const source=fs.readFileSync('src/components/canvas/canvas-client.tsx','utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),fn={};function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)fn[n.name.text]=n.getText(ast);ts.forEachChild(n,walk)}walk(ast);
const code=ts.transpileModule(fn.landEditResult+'\n'+fn.submitAnnotations,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function main(){let cases=0;
 for(const scenario of ['done','400','415','502','transport','409-pending','409-conflict','position-fails','missing-result']){
  let nodes=[],calls=0,checks=0,undo=0,ready=false,positions=[],closed=0;
  const source={id:'source'},c={editTaskStateRef:{current:new Map()},...helpers,ImagegenHttpError,Error,readOnly:false,user:{email:'fixture'},canvasAccountRef:{current:'fixture'},canvasContextEpochRef:{current:1},activeProjectRef:{current:{key:'A'}},generationOperationRef:{current:new Set()},generationChecksRef:{current:new Set()},rfRef:{current:{getNode:()=>({position:{x:10,y:20}})}},flowNodeSize:()=>({width:320}),artworkNodeSize:()=>({width:320}),X_GAP:40,browserRandomUUID:()=>String(calls),window:{setInterval:()=>1,clearInterval:()=>{}},setPendNodes:f=>{nodes=f(nodes)},readJsonSafe:r=>r.json(),livePendingPosition:()=>({x:777,y:888}),privateFetchRaw:async(url,init)=>{checks++;positions.push(JSON.parse(init.body));return Response.json({ok:true},{status:scenario==='position-fails'&&!ready?503:200})},mergeWorks:async()=>scenario==='missing-result'&&!ready?[]:[{id:'result',image:'/result.png'}],pushAddUndo:()=>undo++,applyServerUser:()=>{},flashTip:()=>{},annotateArtwork:source,setAnnotateArtwork:()=>closed++};
  const run=async()=>{calls++;if(ready||scenario==='done'||['position-fails','missing-result'].includes(scenario))return Response.json({id:'result'});if(scenario==='transport')throw Error('fixture offline');const status=Number(scenario.split('-')[0]);return Response.json({error:'fixture failure',code:scenario==='409-pending'?'OPERATION_PENDING':scenario==='409-conflict'?'OPERATION_CONFLICT':undefined,operationId:status===409?'tool-fixture':undefined},{status})};
  c.privateFetch=run;vm.createContext(c);vm.runInContext(code,c);
  await c.submitAnnotations(new FormData());assert.equal(closed,0,'parent never closes the editor; child owns immediate-close');
  if(scenario==='done'){assert.equal(nodes.length,0);assert.equal(undo,1)}else{
   assert.equal(nodes.length,1);const kind=['400','415'].includes(scenario)?'not-started':['position-fails','missing-result'].includes(scenario)?'sync':'uncertain';assert.equal(nodes[0].generationFailure.kind,kind);assert.equal(c.generationOperationRef.current.size,kind==='not-started'?0:1);
   if(kind==='sync'){
    const check=nodes[0].onGenerationCheck;const before=calls,beforeChecks=checks;c.canvasAccountRef.current='other';await check();assert.equal(checks,beforeChecks);c.canvasAccountRef.current='fixture';ready=true;await check();assert.equal(calls,before);assert.equal(nodes.length,0);assert.equal(undo,1);assert.equal(positions.at(-1).x,777);assert.equal(c.generationOperationRef.current.size,0);
   }else if(kind==='uncertain'){const before=calls;await c.landEditResult(source,run,'扩图');assert.equal(calls,before,'unknown lock blocks repeat request')}
   else {ready=true;await c.landEditResult(source,run,'扩图');assert.equal(nodes.length,0);assert.equal(undo,1)}
  }
  cases++;
 }
 console.log(`EDIT_FEEDBACK=PASS CASES=${cases} FAILURE_RETAINED=YES RECOVERY_GENERATION_POSTS=0 UNKNOWN_RESUBMIT=0 PARENT_CLOSE_CALLS=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
