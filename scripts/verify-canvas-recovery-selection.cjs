require('tsx/cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=process.cwd(),src=fs.readFileSync(path.resolve(process.argv[2]||root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',src,99,true,4),fn={};let effect;
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)fn[n.name.text]=n.getText(ast);if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('canvasReceipts(sessionStorage,owner,project)'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit)}visit(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const helpers=require(root+'/src/lib/canvas/generation-failure.ts');
async function main(){let cases=0;
for(const scenario of ['success','missing','partial-missing','no-artifacts','read-failure','poll-failure','needs-attention','failed-empty']){
 let clears=0,queryCount=0,callback,recover=false;
 const art={id:'result',image:'/result.png'},other={id:'result2',image:'/result2.png'};
 const status=scenario==='needs-attention'?'needs_attention':scenario==='failed-empty'?'failed':'succeeded';
 const c={...helpers,Error,user:{email:'fixture@example.test'},readOnly:false,works:[],active:{key:'fixture'},sessionStorage:{},canvasReceipts:()=>[{key:'receipt',receipt:{id:'job',nodeId:'node:source',x:0,y:0}}],generationOperationRef:{current:new Set()},worksRef:{current:[]},NODE_LABEL_H:24,
 pollImagegen:async()=>{queryCount++;if(scenario==='poll-failure'&&!recover)throw Error('fixture poll');return {status,artifacts:scenario==='failed-empty'||scenario==='no-artifacts'&&!recover?[]:(scenario==='partial-missing'?[art,other]:[art]).map(a=>({artworkId:a.id,height:512}))}},
 privateFetchRaw:async(url)=>{if(url==='/api/artworks/position')return {ok:true};if(scenario==='read-failure'&&!recover)throw Error('fixture read');return {ok:true,json:async()=>({artworks:recover?[art,other]:scenario==='missing'?[]:[art]})}},
 clearCanvasReceipt:()=>clears++,setTimeout:cb=>{callback=cb;return 1},clearTimeout:()=>{},pushAddUndoMany:()=>{},flashTip:()=>{},canvasAccountRef:{current:'fixture'},targetEmail:null,invalidateBrowserData:()=>{},expectJsonOk:async r=>r.json(),t:k=>k,setWorks:fn=>{c.works=fn(c.works)},authHeader:async()=>({}),fetch:async()=>{throw Error('fixture fallback read')}};
 vm.createContext(c);vm.runInContext(compile(fn.mergeWorks+'\n'+fn.refetchWorks+'\nglobalThis.cleanup=('+effect.replace('void sync();','globalThis.firstSync=sync();')+')();'),c);
 await c.firstSync;
 const retry=['missing','partial-missing','no-artifacts','read-failure','poll-failure'].includes(scenario);
 assert.equal(clears,['success','failed-empty'].includes(scenario)?1:0,scenario);
 if(retry){assert.equal(typeof callback,'function');recover=true;await callback();assert.equal(clears,1);assert.equal(queryCount,2)}
 else assert.equal(callback,undefined);
 c.cleanup();cases++;
}
for(const kind of [null,'not-started','failed','uncertain','sync'])for(const lock of [false,true]){
 const c={generationTasks:[{sourceId:'source',failure:kind?{kind}:undefined}],generationOperationRef:{current:new Set(lock?['node:source']:[])},rfRef:{current:{getNodes:()=>[]}},activeProjectRef:{current:{members:[{id:'source',status:'completed',image:'/source.png'}]}},activeKey:'project',textNodesRef:{current:[]},pendNodesRef:{current:[]},canFeature:()=>true,isNodeLocked:()=>false,hasRenderableImage:()=>true,selectionRunTargets:require(root+'/src/lib/canvas/selection-run.ts').selectionRunTargets,...helpers};
 vm.createContext(c);vm.runInContext(compile(fn.currentSelectionRunTargets),c);
 assert.equal(c.currentSelectionRunTargets(['source']).length,!lock&&['not-started','failed'].includes(kind)?1:0,`${kind} lock=${lock}`);cases++;
}
console.log(`RECOVERY_SELECTION=PASS CASES=${cases} PARTIAL_MISSING_RETAINED=YES RETRY_AFTER_OUTAGE=YES UNKNOWN_BLOCKED=YES SUPPLIER_CALLS=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
