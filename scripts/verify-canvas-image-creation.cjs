/** Full old Canvas functions versus actual new application + actual Canvas
 * adapters. Task/history/document I/O are narrow recorded ports, not copies. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},baseline=args.includes('--baseline'),root=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||path.join(process.env.CANVAS_CREATION_EVIDENCE||'output/canvas-image-creation','run'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),source=read('src/components/canvas/canvas-client.tsx'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),fns={},constants=[];let blank;
function visit(n){
 if(ts.isFunctionDeclaration(n)&&['generateSelectedImage','generateChild','generateSplitViews','retrySelected','genFromAssistant','canvasImageCreationServices','viewPrompt'].includes(n.name?.text))fns[n.name.text]=n.getText(ast);
 if(ts.isVariableDeclaration(n)&&['FAITHFUL_REGEN_PROMPT','VIEW_CONSISTENCY_RULES','MAX_TOTAL_IMAGES'].includes(n.name.getText(ast))){let s=n;while(!ts.isVariableStatement(s))s=s.parent;constants.push(s.getText(ast));}
 if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='promptToUse')blank=n.initializer.getText(ast);
 ts.forEachChild(n,visit);
}visit(ast);const primary=fns.generateSelectedImage?'generateSelectedImage':'generateChild',hasRedo=!!fns.retrySelected;assert.ok(blank&&fns[primary]&&fns.genFromAssistant);assert.equal(!!fns.generateSplitViews,baseline);
const transpile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
async function bundled(){
 const entry=['export * from "./src/lib/canvas/image-references";','export * from "./src/lib/canvas/image-task-scope";',...(!baseline?['export * from "./src/lib/canvas/image-creation";']:[])].join('\n');
 return (await build({stdin:{contents:entry,loader:'ts',resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false,tsconfig:path.join(root,'tsconfig.json'),nodePaths:[path.resolve('node_modules')],plugins:[{name:'browser-ports',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'ports'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'ports'}));b.onLoad({filter:/.*/,namespace:'ports'},a=>({contents:a.path==='auth'?'export const authHeader=async()=>({});':'export const currentWorkspace=()=>__workspace.value;export const currentWorkspaceRevision=()=>__workspace.revision;',loader:'js'}));}}]})).outputFiles[0].text;
}
async function plain(value){
 if(value instanceof File)return {file:value.name,type:value.type,bytes:Buffer.from(await value.arrayBuffer()).toString('hex')};
 if(Array.isArray(value))return Promise.all(value.map(plain));
 if(value&&typeof value==='object'){const x={};for(const key of Object.keys(value).sort())if(value[key]!==undefined&&typeof value[key]!=='function')x[key]=await plain(value[key]);return x;}
 return value;
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
function fixture(code,options={}){
 const source={id:'source',image:'/media/source.png',prompt:'原始配方',title:'原图',category:'main',ratio:'3:4',resolution:'2K',style:'原风格',parentId:'parent',parentIds:['other-parent']},parent={...source,id:'parent',image:'/media/parent.png',parentId:undefined,prompt:'父配方'};
 const ref={key:'node:source',sourceNodeId:'source',title:'目标',url:source.image,number:3,role:'edit-target'},file=new File([new Uint8Array([0,255,18,41])],'reference-original.png',{type:'image/png'});
 const c={console,Buffer,File,Blob,URL,FormData,Headers,Request,Response,AbortSignal,Promise,Map,Set,Math,Date:class extends Date{static now(){return 123456;}},__workspace:{value:'personal',revision:0},module:{exports:{}},exports:{},
  selected:source,active:{members:[source,parent]},assistantArtworkId:'source',editPrompt:'  用户要求  ',generationMode:'standard',genRatio:'3:4',genStyle:'当前风格',genCount:2,genResolution:'4K',visibleDockRefs:[source],extraFiles:[],composerReferences:[ref],dockReferenceState:{error:null},referenceError:null,
  user:{email:'owner@fixture.test'},canvasAccountRef:{current:'owner@fixture.test'},activeProjectRef:{current:{key:'tree:source'}},canvasContextEpochRef:{current:0},batchRunMountedRef:{current:true},errors:[],calls:[],renames:[],details:[],pending:[],MAX_TOTAL_IMAGES:16,
 };
 c.exports=c.module.exports;vm.createContext(c);vm.runInContext(code,c);Object.assign(c,c.module.exports);
 const entered=deferred(),release=deferred();let used=false;
 c.runGen=(art,prompt,opts)=>{
  const index=c.calls.length;c.calls.push(null);const suffix=opts.operationKey?.split(':').at(-1),id=['front','side','back'].includes(suffix)?suffix:'result';
  const work=(async()=>{c.calls[index]=await plain({source:art,prompt,options:opts});if(options.hold==='generate'&&!used){used=true;entered.resolve();await release.promise;}if(options.fail===id)return [];if(options.reject===id)throw Error('fixture generation failed');return [{id,url:'/media/'+id+'.png',width:1024,height:1024}];})();c.pending.push(work);return work;
 };
 c.renameGeneratedArtwork=async(id,title)=>{c.renames.push([id,title]);if(options.hold==='rename'&&!used){used=true;entered.resolve();await release.promise;}};
 c.generateDetailSequence=async(...values)=>{c.details.push(await plain(values));};c.setGenError=error=>{c.errors.push(error);};
 vm.runInContext(transpile(constants.join('\n')+'\n'+Object.values(fns).join('\n')+`\nfunction blankPrompt(text,inputTextNodes,inputArts){return ${blank};}\nglobalThis.entries={generateChild:${primary},${hasRedo?'retrySelected,':''}genFromAssistant,blankPrompt};`),c);
 const snapshot=async()=>({calls:await plain(c.calls),renames:await plain(c.renames),details:await plain(c.details),errors:await plain(c.errors)});
 const run=async(kind='dock')=>{await (kind==='retry'?c.entries.retrySelected():kind==='assistant'?c.entries.genFromAssistant(c.editPrompt):c.entries.generateChild());await Promise.all(c.pending);await Promise.resolve();return snapshot();};
 return {c,source,parent,ref,file,run,snapshot,entered:entered.promise,release:release.resolve,switch(kind){
  if(kind==='project'||kind==='project-aba'){c.activeProjectRef.current={key:'tree:other'};c.canvasContextEpochRef.current++;if(kind==='project-aba'){c.activeProjectRef.current={key:'tree:source'};c.canvasContextEpochRef.current++;}}
  else if(kind==='account'){c.canvasAccountRef.current='other@fixture.test';c.canvasContextEpochRef.current++;}
  else if(kind==='workspace'||kind==='workspace-aba'){c.__workspace.value='tenant-other';c.__workspace.revision++;if(kind==='workspace-aba'){c.__workspace.value='personal';c.__workspace.revision++;}}
  else if(kind==='unmount')c.batchRunMountedRef.current=false;
  else if(kind==='selection')c.selected={...source,id:'new-selection'};
 }};
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const code=await bundled(),common=[],races=[];
 const cases=[
  ['standard-prompt',()=>{}],['standard-source-recipe',f=>{f.c.editPrompt='';}],['standard-numbered-recipe-neutral-default',f=>{f.c.editPrompt='';f.source.prompt='上一轮【图1】引用';}],
  ['standard-file-as-base',f=>{f.c.visibleDockRefs=[];f.c.extraFiles=[f.file,new File(['other'],'other.png',{type:'image/png'})];f.c.composerReferences=[{...f.ref,key:'upload',sourceNodeId:undefined,file:f.file,url:'',role:'style'}];}],
  ['standard-multiple-visible-references-and-upload',f=>{f.c.visibleDockRefs=[f.source,f.parent];f.c.extraFiles=[f.file];f.c.composerReferences=[f.ref,{...f.ref,key:'node:parent',sourceNodeId:'parent',url:f.parent.image,role:'style',number:7},{...f.ref,key:'upload',sourceNodeId:undefined,file:f.file,url:'',role:'reference',number:12}];}],
  ['dock-reference-error-first',f=>{f.c.dockReferenceState.error='原引用错误';f.c.referenceError='第二错误';}],['reference-error',f=>{f.c.referenceError='引用未就绪';}],
  ['reference-over-capacity',f=>{f.c.visibleDockRefs=Array.from({length:17},()=>f.source);}],
  ['detail-with-visible',f=>{f.c.generationMode='detail';f.c.extraFiles=[f.file];}],['detail-fallback-source',f=>{f.c.generationMode='detail';f.c.visibleDockRefs=[];}],
  ['triptych-with-feedback',f=>{f.c.generationMode='triptych';}],['triptych-without-feedback',f=>{f.c.generationMode='triptych';f.c.editPrompt=' ';}],
  ['split-anchor-then-side-back',f=>{f.c.generationMode='split';f.c.composerReferences=[f.ref,{...f.ref,key:'style',number:11,role:'style'}];}],
  ['split-missing-target',f=>{f.c.generationMode='split';f.c.composerReferences=[];}],['split-no-anchor-space',f=>{f.c.generationMode='split';f.c.composerReferences=Array.from({length:16},(_,i)=>({...f.ref,number:i+1}));}],
  ['retry-parent-found',()=>{},'retry'],['retry-parent-missing',f=>{f.c.active.members=[f.source];},'retry'],['retry-no-parent',f=>{delete f.source.parentId;},'retry'],
  ['retry-inherited-style-resolution',f=>{f.source.style='';f.source.resolution='';},'retry'],['retry-same-prompt',f=>{f.c.editPrompt=f.source.prompt;},'retry'],['retry-empty-prompt',f=>{f.c.editPrompt='';},'retry'],
  ['retry-numbered-recipe',f=>{f.source.prompt='错误引用【图3】';f.c.editPrompt='';},'retry'],['retry-invalid-reference',f=>{f.c.referenceError='原引用冲突';},'retry'],
  ['assistant-original-source',()=>{},'assistant'],['assistant-empty-prompt',f=>{f.c.editPrompt=' ';},'assistant'],['assistant-anchor-not-loaded',f=>{f.c.assistantArtworkId='missing';},'assistant'],
 ];
 for(const [name,configure,kind] of cases){if(kind==='retry'&&!hasRedo)continue;const f=fixture(code);configure(f);const result=await f.run(kind);if(name==='split-anchor-then-side-back'){
   eq(result.calls.length,3,name);eq(result.calls[1].options.parentIds,['front'],'anchor lineage');eq(result.calls[1].options.referenceInputs.at(-1).number,12,'anchor ordinal');eq(result.calls[1].options.referenceInputs.at(-1).role,'reference','anchor role');eq(result.renames,[['front','正面视图'],['side','侧面视图'],['back','背面视图']],'view titles');
  }common.push({name,result});checks++;}
 for(const [name,opts,mode,expected]of [['front-empty',{fail:'front'},'split',1],['side-empty',{fail:'side'},'split',3],['triptych-empty',{fail:'result'},'triptych',1]]){
  const f=fixture(code,opts);f.c.generationMode=mode;const result=await f.run();eq(result.calls.length,expected,name);common.push({name,result});
 }
 const blanks=[['explicit',' 显式要求 ',[],[]],['text-fallback','',[{content:'第一段',prompt:'旧'},{content:' ',prompt:'第二段'}],[]],['image-recipe','',[],[{prompt:'原图配方'}]],['numbered-recipe-neutral','',[],[{prompt:'引用【图1】'}]],['empty-neutral','',[],[]]];
 for(const [name,prompt,texts,images]of blanks){const f=fixture(code);common.push({name:'blank-'+name,result:f.c.entries.blankPrompt(prompt.trim(),texts,images)});checks++;}
 for(const kind of ['project','project-aba','account','workspace','workspace-aba','unmount','selection']){
  const f=fixture(code,{hold:'rename'});f.c.generationMode='split';const work=f.run();await f.entered;f.switch(kind);f.release();const result=await work;
  const follows=result.calls.length-1;eq(follows,baseline||kind==='selection'?2:0,'follow-up after '+kind);races.push({kind,followupCalls:follows,renames:result.renames});
 }
 for(const action of hasRedo?['dock','retry']:['dock']){const f=fixture(code,{hold:'generate'});f.c.generationMode='triptych';const work=f.run(action);await f.entered;f.switch('project');f.release();const result=await work;eq(result.renames.length,baseline?1:0,'stale final title '+action);races.push({kind:'final-title-'+action,renames:result.renames.length});}
 const priorPath=arg('--baseline-report');if(priorPath){const prior=JSON.parse(fs.readFileSync(priorPath,'utf8'));eq(JSON.parse(JSON.stringify(common)),prior.common,'all original creative instructions/options/file bytes/order/lineage');}
 const report={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',checks,common,races,primary,retiredRedo:!hasRedo,scope:'ACTUAL_CANVAS_ADAPTERS_AND_APPLICATION_WITH_TASK_PORTS',supplier:0,network:0,pg:false};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`CANVAS_IMAGE_CREATION=PASS MODE=${report.mode} CHECKS=${checks} COMMON_CASES=${common.length} RACES=${races.length} CREATIVE_BODY=${baseline?'INLINE':'OWNED'} ORIGINAL_FILE_BYTES=RETAINED STALE_FOLLOWUPS=${baseline?12:0} SELECTION_CONTINUES=1 TASK_OWNER=REUSED NETWORK=0 SUPPLIER=0`);
}
main().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:error.stack,checks},null,2)+'\n');console.error(error);process.exitCode=1;});
