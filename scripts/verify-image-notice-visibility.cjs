// Focused notice presentation acceptance. Product source/functions are real;
// auth, storage, plan/POST/GET and React setters are explicit local fixtures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const ref=arg('--ref',''),source=path.resolve(arg('--source',root)),mode=arg('--mode',ref?'baseline':'modified'),out=path.resolve(arg('--output','output/image-notice-visibility-20261030/'+mode));
fs.mkdirSync(out,{recursive:true});const results=[],sources=new Map(),cache=new Map();let network=0;
const read=rel=>{const b=ref?cp.execFileSync('git',['show',ref+':'+rel],{cwd:root,stdio:['ignore','pipe','pipe']}):fs.readFileSync(path.join(source,rel));sources.set(rel,crypto.createHash('sha256').update(b).digest('hex'));return b.toString('utf8');};
function load(rel){if(cache.has(rel))return cache.get(rel).exports;const m={exports:{}};cache.set(rel,m);const code=esbuild.transformSync(read(rel),{loader:rel.endsWith('.tsx')?'tsx':'ts',format:'cjs',target:'node22'}).code;
 const req=id=>{if(id==='server-only')return{};if(!id.startsWith('.')&&!id.startsWith('@/'))return require(id);const p=id.startsWith('@/')?'src/'+id.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(rel),id));return load(/\.(ts|tsx)$/.test(p)?p:p+'.ts');};vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:rel})(req,m,m.exports);return m.exports;}
function functions(rel,names){const text=read(rel),ast=ts.createSourceFile(rel,text,ts.ScriptTarget.Latest,true,rel.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),found=[];const visit=n=>{if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))found.push(n.getText(ast));ts.forEachChild(n,visit);};visit(ast);for(const name of names)assert(found.some(s=>new RegExp('function '+name+'\\b').test(s)),'MISSING_REAL_FUNCTION:'+name);return ts.transpileModule(found.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText.replace(/^export /gm,'');}
const AB=[
 ['A1','图片已生成，实际尺寸 736×1312，比例与所选 9:16 有差异；已保留完整画面'],
 ['A2','图片已生成，实际尺寸待读取；已保留原图'],
 ['A3','本次按最接近参考图画幅的 9:16 生成'],
 ['A4','本次按最接近所选画幅的 9:16 生成'],
 ['A5','本次自适应跟随参考画幅，结果保留完整画面'],
 ['A6','本次由4K自动调整为2K，按实际档位生成，积分按所选档位报价保持不变。'],
 ['B1','模型编辑后按蒙版合成，未选区保留原图；原生成版本也会保留。'],
 ['B2','所选模型先生成，再通过后台指定的抠图模型生成透明图；两步积分已合计，原图保留。'],
 ['B3','已识别：透明背景 · 生成 → 抠图 · 12 积分'],
];
const KEEP=[
 ['C1','节点已更新或锁定，新结果已保存在历史版本，未覆盖当前图片'],
 ['C2','已从保存的原始结果恢复，没有重新生成或重复扣费'],
 ['C3','已恢复原生成图片，积分以实际结算记录为准'],
 ['C4','局部重绘完成，结果已载入画布'],['C5','文字修改完成，结果已生成在原图右侧'],
 ['D1','请求 3 张，已保存 2 张；积分以实际结算记录为准'],['D2','这张图片未完成，已生成图片已保留'],
 ['D3','积分结算信息暂未同步，请查看积分记录'],['D4','已保留生成结果，节点历史待同步'],
 ['D5','图片已生成，附加尺寸处理未完成，已保留完整原图'],['D6','已保留生成图片，实际图片不是透明背景'],['D7','已保留原图，原处理配置缺失，未按当前配置改写'],['D8','位置尚未保存，原任务已保留'],
 ['E1','原始生成图片已恢复，其余处理仍待核查；不会重新生成'],['E2','已有原始生成图片待恢复，点击检查原任务可恢复；不会重新生成或重复扣费'],['E3','原任务图片已保存，节点版本仍待同步'],['E4','原节点已删除，生成结果已保存在创作记录'],['E5','部分完成，已恢复现有图片，原任务仍待核查'],['E6','部分完成，图片尚未合并'],['E7','已完成，暂无可恢复图片'],
 ['F1','本次未取得图片，请重试'],['F2','图片加载失败，请重试'],['F3','生成未完成，请稍后检查'],['F4','本次图片生成未取得结果，已结束等待并释放预占积分，请重新发起。'],
];
const advisory=load('src/lib/imagegen/output-advisory.ts'),http=load('src/lib/imagegen/http.ts'),failure=load('src/lib/canvas/generation-failure.ts');let visibility;
try{visibility=load('src/lib/imagegen/notice-visibility.ts');}catch(e){if(!ref&&fs.existsSync(path.join(source,'src/lib/imagegen/notice-visibility.ts')))throw e;visibility=null;}
const visible=warnings=>{assert(visibility?.userVisibleImageWarnings,'PUBLIC_FILTER_NOT_PRESENT_IN_SOURCE');return visibility.userVisibleImageWarnings(warnings);};

const submitCode=functions('src/lib/imagegen/canvas-client.ts',['submitCanvasImagegen']);
async function submitScenario(warnings,{transparent=false,refresh=false}={}){
 const state={notes:[],previews:0,starts:0,uploads:0,requests:[],saved:[]};let pending=null;
 const c={exports:{},...advisory,...visibility,...http,...load('src/lib/imagegen/schema.ts'),...load('src/lib/imagegen/frame-ratio.ts'),...load('src/lib/imagegen/intent.ts'),FormData,File,Response,Blob,Error,Set,Map,Promise,JSON,console,crypto:crypto.webcrypto,
  currentWorkspace:()=> 'personal',browserRandomUUID:()=> '00000000-0000-4000-8000-000000000001',imagegenScopeHeaders:x=>x,
  canvasImagegenActionKey:async()=> 'fixture-action',pendingAttemptKey:()=> 'fixture-key',readPendingAttempt:()=>pending,savePendingAttempt:(_key,v)=>{pending=v;state.saved.push(structuredClone(v));},withPendingAttempt:async(_key,fn)=>fn(),
  uploadImagegenInput:async()=>{state.uploads++;return{artworkId:'asset-reference',sourceWidth:941,sourceHeight:1672,width:470,height:836,url:'/media/reference.png'};},
  previewImagegen:async request=>{state.previews++;state.requests.push(structuredClone(request));return{request,requestedParameters:{resolution:'1K'},frameChoice:{target:'941:1672',effective:'9:16',source:'reference',method:'nearest'},intent:{background:transparent?'transparent':null},steps:[{operation:'generate'},...(transparent?[{operation:'cutout'}]:[])],totalCredits:transparent?12:6,billingVersion:8,modelVersion:117,quote:{id:'quote-'+state.previews},confirmationRequired:false,warnings:[...warnings]};},
  startImagegen:async(request,confirmation)=>{state.starts++;state.confirmation=confirmation;if(refresh&&state.starts===1)throw new http.ImagegenHttpError('plan changed',409,false,'IMAGEGEN_PLAN_CHANGED');return{jobId:'imagegen-'+request.operationId,operationId:request.operationId};},
  pollImagegen:async()=>{throw Error('UNEXPECTED_EXISTING_TASK_POLL');},canvasReferenceManifestSchema:{parse:JSON.parse},referenceManifestError:()=>undefined,readCanvasFanoutPlacement:()=>{throw Error('UNEXPECTED_PLACEMENT');},fetch:()=>{network++;throw Error('NETWORK_FORBIDDEN');}};
 vm.createContext(c);vm.runInContext(submitCode,c);const form=new FormData();form.set('model','fixture-image');form.set('userPrompt','换成红色');form.set('ratio','auto');form.set('resolution','1K');form.set('count','1');if(transparent)form.set('transparent','1');form.append('image',new File(['fixture-reference'],'reference.png',{type:'image/png'}));const response=await c.submitCanvasImagegen(form,'source',m=>state.notes.push(m),{owner:'fixture@example.test',project:'workspace'});
 assert.equal(response.status,200);assert.equal(state.uploads,1);assert.equal(state.starts,refresh?2:1);assert.equal(state.previews,refresh?2:1);assert.equal(state.confirmation.credits,transparent?12:6);assert.equal(state.requests[0].parameters.ratio,'941:1672');assert.equal(state.saved.at(-1).accepted,'accepted');return state;
}
const canvasCode=functions('src/components/canvas/canvas-client.tsx',['runGen','generatePend']);
function canvasScenario(warnings,error){const src={id:'source',image:'/media/source.png',prompt:'source recipe',title:'source',category:'main',ratio:'1:1'},pend={id:'pend-A',label:'blank A',inputs:['source'],x:500,y:200};
 const state={post:0,reads:0,positions:0,clears:0,notices:[],artifacts:[src,{id:'result',image:'/media/result.png'}]};
 const c={exports:{},Error,Headers,isNodeLocked:()=>false,currentWorkspace:()=> 'personal',currentWorkspaceRevision:()=>1,canvasContextEpochRef:{current:1},readPendingAttempt:()=>null,pendingAttemptKey:()=> 'fixture',composerReferences:undefined,consumePendingNodeHistory:()=>{},completeCanvasImagegen:()=>{},fanoutHistoryRef:{current:new Map()},editTaskStateRef:{current:new Map()},...failure,...advisory,...visibility,...http,console,Date,Math,Promise,Set,Map,Response,AbortSignal,FormData,File,Blob,encodeURIComponent,setTimeout:f=>{f();return 1},readOnly:false,user:{email:'fixture@example.test'},t:k=>k,source:src,pend,genQuality:'medium',genCount:1,genRatio:'3:4',genStyle:'default',genResolution:'1K',genModel:'fixture',imageModels:[],generationMode:'standard',editPrompt:'fixture prompt',textNodes:[],pendNodes:[pend],generationTasks:[],rfNodes:[],works:state.artifacts,worksRef:{current:[src]},active:{key:'tree:source',members:[src]},activeKey:'tree:source',targetEmail:null,canvasAccountRef:{current:'fixture-account'},activeProjectRef:{current:{key:'tree:source'}},selectedIdRef:{current:'source'},selectedPendId:'pend-A',selectedPendIdRef:{current:'pend-A'},pendingNodeRef:{current:null},generationOperationRef:{current:new Set()},generationChecksRef:{current:new Set()},generationTaskPosRef:{current:{}},generationTaskSizeRef:{current:{}},pendNodesRef:{current:[pend]},textNodesRef:{current:[]},rfRef:{current:{getNode:id=>({id,position:{x:500,y:200},data:{}})}},X_GAP:40,NODE_LABEL_H:24,FAITHFUL_REGEN_PROMPT:'keep',flowNodeSize:()=>({width:320,height:320}),generationPlaceholderSize:()=>({width:384,height:512}),generationPositionForTask:a=>a,normalizeCanvasRatio:v=>v||'auto',normalizeCanvasResolution:v=>v||'1K',normalizeCanvasCount:v=>v||1,routeImageModel:v=>v,rememberGenerationDrag:()=>{},authHeader:async()=>({}),readJsonSafe:r=>r.json(),applyServerUser:()=>{},pushAddUndoMany:()=>{},pushAddUndo:()=>{},setGenError:m=>{state.error=m},flashTip:m=>state.notices.push(m),persistTextNode:async()=>{},setTextNodes:()=>{},completeCanvasReceipt:()=>{state.clears++},reserveGenerationPosition:(id,pos)=>{c.generationTaskPosRef.current[id]=pos;return pos}};
 c.setGenerationTasks=f=>{c.generationTasks=typeof f==='function'?f(c.generationTasks):f};c.setPendNodes=f=>{c.pendNodes=typeof f==='function'?f(c.pendNodes):f;c.pendNodesRef.current=c.pendNodes};c.setSelectedPendId=f=>{c.selectedPendId=typeof f==='function'?f(c.selectedPendId):f};c.readBrowserImage=async()=>new Blob(['fixture'],{type:'image/png'});c.privateFetch=async()=>{state.post++;return Response.json({jobId:'job-fixture'});};c.fetch=async()=>{state.reads++;return Response.json(error?{status:'error',operationStatus:'failed',error}:{status:'done',warnings,images:[{id:'result',url:'/media/result.png',width:736,height:1312}]});};c.privateFetchRaw=async()=>{state.positions++;return Response.json({ok:true})};c.expectJsonOk=async r=>{assert.ok(r.ok);return r.json()};c.mergeWorks=async()=>state.artifacts;
 vm.createContext(c);vm.runInContext(canvasCode,c);return{c,state};}
async function test(name,run){try{await run();results.push({name,pass:true});console.log('PASS '+name);}catch(e){results.push({name,pass:false,error:e.stack});console.log('FAIL '+name+' '+e.message);}}
(async()=>{
 for(const [name,text]of AB)await test(name+' hidden at real Canvas formatter',()=>assert.equal(advisory.imageOutputWarningText([text]),undefined));
 for(const [name,text]of KEEP)await test(name+' retained verbatim',()=>assert.equal(advisory.imageOutputWarningText([text]),text));
 for(const [name,input,expected]of [
  ['old joined AB only',[AB[0][1]+'；'+AB[5][1]],undefined],
  ['old joined AB then real processing failure',[AB[0][1]+'；'+KEEP[9][1]],KEEP[9][1]],
  ['old joined retained around AB',[KEEP[0][1]+'；'+AB[0][1]+'；'+KEEP[10][1]],KEEP[0][1]+'；'+KEEP[10][1]],
  ['newlines mixed old notice',[AB[6][1]+'\n'+KEEP[14][1]],KEEP[14][1]],
  ['filter before three-item cap',[...AB.map(x=>x[1]),KEEP[0][1],KEEP[7][1],KEEP[10][1]],KEEP[0][1]+'；'+KEEP[7][1]+'；'+KEEP[10][1]],
 ])await test(name,()=>assert.equal(advisory.imageOutputWarningText(input),expected));
 await test('unknown warning unchanged, not broad keyword suppression',()=>{const message='管理员提醒：图片已生成，但文件校验失败；请重新下载';assert.equal(advisory.imageOutputWarningText([message]),message);});
 await test('malformed inputs remain non-crashing',()=>{for(const v of [null,undefined,{},42,'string'])assert.equal(advisory.imageOutputWarningText(v),undefined);assert.equal(advisory.imageOutputWarningText([null,4,'',AB[0][1]]),undefined);});
 const legacy='生成结果为 29:36（928×1152），与所选 53:79 不一致；原图已保留，实际生成积分已结算，任务未自动重试';
 await test('internal ratio diagnostic and old guard retained',()=>{assert(advisory.imageRatioWarning('9:16',{width:736,height:1312}));assert(advisory.legacyRatioWarning(legacy));assert.equal(advisory.legacyRatioWarning('上游提交结果待核查'),undefined);});
 await test('legacy no-image remains error',()=>assert.equal(advisory.imageOutputNotice(legacy,undefined,false).error,legacy));
 await test('legacy delivered error keeps internal notice but UI is quiet',()=>{const n=advisory.imageOutputNotice(legacy,undefined,true);assert.equal(n.error,undefined);assert(n.warning);assert.equal(advisory.imageOutputWarningText([n.warning]),undefined);});
 await test('real errors retained alongside muted advisory',()=>{for(const e of ['模型未返回有效透明主体','上游提交结果待核查','图片生成失败,请稍后重试'])assert.deepEqual(advisory.imageOutputNotice(e,AB[0][1],true),{error:e,warning:AB[0][1]});});
 await test('single legacy result quiet read-only projection',()=>{const result={operationId:'fixture-op',jobId:'fixture-job',status:'failed',stage:'editing',artifacts:[{artworkId:'fixture-art',url:'/media/original.png',width:928,height:1152,mime:'image/png'}],chargedCredits:6,billingStatus:'confirmed',error:{code:'EXECUTION_FAILED',message:legacy},warnings:[AB[2][1],KEEP[0][1]]},before=JSON.stringify(result),p=advisory.presentImagegenOutput(result,true);assert.equal(p.status,'succeeded');assert.equal(p.error,undefined);assert.equal(advisory.imageOutputWarningText(p.warnings),KEEP[0][1]);assert.equal(p.chargedCredits,6);assert.deepEqual(p.artifacts,result.artifacts);assert.equal(JSON.stringify(result),before);assert.equal(advisory.presentImagegenOutput(result,false).status,'failed');});
 await test('public filter preserves all CDEF instead of UI cap',()=>assert.deepEqual(visible([...AB.map(x=>x[1]),...KEEP.map(x=>x[1])]),KEEP.map(x=>x[1])));
 for(const refresh of [false,true]){
  await test('actual submit plan AB silent '+(refresh?'after409':'initial'),async()=>{const s=await submitScenario(AB.map(x=>x[1]),{transparent:true,refresh});assert.deepEqual(s.notes,[]);});
  await test('actual submit plan C warning retained '+(refresh?'after409':'initial'),async()=>{const s=await submitScenario([AB[2][1],KEEP[0][1]],{refresh});assert.deepEqual(s.notes,Array(refresh?2:1).fill(KEEP[0][1]));});
 }
 for(const kind of ['runGen','generatePend'])for(const [label,warnings,error,expected]of [['AB',AB.map(x=>x[1]),undefined,[]],['mixed',[AB[0][1],KEEP[0][1],AB[6][1],KEEP[9][1]],undefined,[KEEP[0][1]+'；'+KEEP[9][1]]],['failure',[],KEEP[20][1],[]]])await test('actual Canvas '+kind+' '+label,async()=>{const {c,state}=canvasScenario(warnings,error);if(kind==='runGen')await c.runGen(c.source,'fixture',{ratio:'3:4'});else await c.generatePend();assert.equal(state.post,1);assert.equal(c.generationOperationRef.current.size,0);assert.deepEqual(state.notices,expected);if(error){assert.equal(state.error,error);const item=kind==='runGen'?c.generationTasks[0]:c.pendNodes[0];assert.equal((kind==='runGen'?item.failure:item.generationFailure).message,error);}else{assert.equal(kind==='runGen'?c.generationTasks.length:c.pendNodes.length,0);assert(!state.error);assert(state.positions>0);}});
 const failed=results.filter(r=>!r.pass).length,report={mode,source,ref,input:{AB,KEEP},results,passed:results.length-failed,failed,sourceHashes:Object.fromEntries(sources),network,supplierCalls:0,evidence:'actual product modules and AST-extracted actual Canvas functions; explicit browser/HTTP/auth/storage/plan/React fixtures, no live browser/PG/provider'};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2));
 console.log(`IMAGE_NOTICE_VISIBILITY=${failed?'FAIL':'PASS'} MODE=${mode} CHECKS=${results.length} PASSED=${results.length-failed} FAILED=${failed} NETWORK=${network} SUPPLIER_CALLS=0`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
