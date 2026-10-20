require('tsx/cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),{createRequire}=require('node:module');
const root=process.cwd(),sourceRoot=path.resolve(process.argv[2]||root);
const file=path.join(root,'scripts/verify-canvas-generation-failure.cjs');
const h={require:createRequire(file),process:{cwd:()=>root,argv:['node','test',sourceRoot],env:{}},console,Response,File,FormData,Blob,setTimeout};
vm.createContext(h);vm.runInContext(fs.readFileSync(file,'utf8').split('(async()=>{const rows=[];')[0]+';globalThis.setup=setup;',h);
const source=fs.readFileSync(sourceRoot+'/src/components/canvas/canvas-client.tsx','utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4);let detail='';
function walk(n){if(ts.isFunctionDeclaration(n)&&['generateDetailSequence','livePendingPosition'].includes(n.name?.text))detail+=n.getText(ast)+'\n';ts.forEachChild(n,walk)}walk(ast);assert.ok(detail);
const code=ts.transpileModule(detail,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function main(){let cases=0;
for(const pending of [false,true])for(const scenario of ['reference-fails','rejected','submit-unknown','poll-unknown','terminal','review','partial','sync-missing','position-fails','done']){
 const {c,state}=h.setup(scenario);let posts=0,queries=0,recovered=false;const urls=[],positions=[];
 Object.assign(c,{Error,MAX_GENERATION_COUNT:4,MAX_TOTAL_IMAGES:6,DETAIL_MODULE_ORDER:['hero'],fmt:v=>v,NODE_W:320,artworkNodeSize:()=>({height:512})});
 const result=()=>scenario==='review'&&!recovered?{status:'error',operationStatus:'needs_attention',reviewRequired:true,error:'fixture review'}:scenario==='terminal'&&!recovered?{status:'error',operationStatus:'error',error:'fixture failure'}:{status:scenario==='partial'?'error':'done',error:scenario==='partial'?'partial result':undefined,shots:[{id:'result',status:'done',url:'/media/result.png',height:512}],operationStatus:'done'};
 c.privateFetch=async(url,opts)=>{urls.push(url);if(opts?.method==='POST'){posts++;if(scenario==='rejected')return Response.json({error:'fixture rejected'},{status:400});if(scenario==='submit-unknown')throw Error('unknown POST');return Response.json({jobId:'aplus-fixture'})}queries++;if(scenario==='poll-unknown'&&!recovered)throw Error('query offline');return Response.json(result())};
 c.fetch=async url=>{urls.push(url);queries++;return Response.json(result())};
 c.privateFetchRaw=async(url,options)=>{if(url==='/api/artworks/position')positions.push(JSON.parse(options.body));if(url==='/api/artworks/position'&&scenario==='position-fails'&&!recovered)return Response.json({error:'fixture position'},{status:503});return Response.json({artworks:state.artifacts,ok:true})};
 c.mergeWorks=async()=>scenario==='sync-missing'&&!recovered?[c.source]:state.artifacts;
 vm.runInContext(code,c);
 await c.generateDetailSequence(c.source,[c.source],'fixture',[],pending?c.pend:undefined);
 const item=()=>pending?c.pendNodes[0]:c.generationTasks[0],failure=()=>pending?item()?.generationFailure:item()?.failure;
 if(scenario==='done'){assert.equal(c.generationTasks.length,0);if(pending)assert.equal(c.pendNodes.length,0);assert.equal(c.generationOperationRef.current.size,0)}
 else {
   const expected=['reference-fails','rejected'].includes(scenario)?'not-started':['terminal','partial'].includes(scenario)?'failed':['sync-missing','position-fails'].includes(scenario)?'sync':'uncertain';
   assert.equal(failure()?.kind,expected,`${pending} ${scenario}`);
   assert.equal(c.generationOperationRef.current.size,['sync','uncertain'].includes(expected)?1:0);
   if(['poll-unknown','review','sync-missing','position-fails'].includes(scenario)){
     const check=pending?item().onGenerationCheck:item().onCheck;assert.equal(typeof check,'function');
     const before=posts;c.canvasAccountRef.current='another-account';await check();assert.equal(posts,before);c.canvasAccountRef.current='fixture-account';
     recovered=true;
     if(pending)c.rfRef.current.getNode=()=>({position:{x:777,y:888}});else c.generationTaskPosRef.current[item().id]={x:777,y:888};
     await check();assert.equal(positions.at(-1).x,777);assert.equal(positions.at(-1).y,888);assert.equal(posts,before,'recovery must never POST');assert.ok(urls.at(-1).startsWith('/api/aplus?job='));
     assert.equal(c.generationOperationRef.current.size,0);assert.equal(c.generationTasks.length,0);if(pending)assert.equal(c.pendNodes.length,0);
   }
   if(scenario==='reference-fails'&&!pending){await c.generateDetailSequence(c.source,[c.source],'fixture');assert.equal(c.generationTasks.length,1,'retry replaces prior definite failure card')}
   if(scenario==='submit-unknown'){await c.generateDetailSequence(c.source,[c.source],'fixture',[],pending?c.pend:undefined);assert.equal(posts,1,'unknown POST blocks resubmit')}
 }
 cases++;
}
console.log(`DETAIL_FAILURE=PASS CASES=${cases} RECHECK_POSTS=0 UNKNOWN_RESUBMIT=0 SUPPLIER_CALLS=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
