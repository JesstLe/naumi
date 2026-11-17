// Native audio uses the existing Canvas owners. Actual rule/action/controller
// modules run here; browser auth, transport and node store are explicit ports.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]},root=path.resolve(arg('--source-root')||'.'),baseline=args.includes('--baseline'),out=path.resolve(arg('--out')||'output/audio-owner-integration');
let checks=0,cases=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},ok=v=>{assert.ok(v);checks++},reject=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++};
const fixture={workspace:'personal',revision:0,auth:async()=>({})};
async function load(files){
 const result=await esbuild.build({stdin:{contents:files.map(f=>`export * from ${JSON.stringify(path.join(root,f).replaceAll('\\','/'))};`).join('\n'),resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',nodePaths:[path.resolve('node_modules')],tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'browser-ports',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export const authHeader=()=>__fixture.auth();':'export const currentWorkspace=()=>__fixture.workspace;export const currentWorkspaceRevision=()=>__fixture.revision;',loader:'js'}));}}]});
 const m={exports:{}};vm.runInThisContext('(function(module,exports,require,__fixture){'+result.outputFiles[0].text+'\n})')(m,m.exports,require,fixture);return m.exports;
}
const files=['src/lib/canvas/history-contract.ts','src/lib/canvas/history-model.ts','src/lib/canvas/history-controller.ts','src/lib/canvas/node-commands.ts','src/lib/canvas/project-catalog.ts','src/lib/canvas/scene-projection.ts','src/lib/canvas/selection.ts','src/lib/canvas/link-command.ts','src/lib/canvas/document-scope.ts'];
async function main(){
 const lib=await load([...files,...(baseline?[]:['src/lib/canvas/audio-actions.ts','src/lib/audio/project.ts','src/lib/canvas/native-document-lifecycle.ts'])]);
 if(baseline){
  eq(fs.existsSync(path.join(root,'src/lib/canvas/audio-actions.ts')),false);eq(fs.existsSync(path.join(root,'src/lib/canvas/audio-node-schema.ts')),false);
  eq(lib.historyRequest.safeParse({operationId:'11111111-1111-4111-8111-111111111111',operations:[{type:'audio-visibility',id:'audio-one',visible:true}]}).success,false);
  console.log('CANVAS_AUDIO_INTEGRATION=PASS MODE=BASELINE CHECKS='+checks+' AUDIO_OWNER=ABSENT AUDIO_HISTORY=ABSENT NETWORK=0 DB=0 SUPPLIER=0');return;
 }
 const now='2026-10-28T00:00:00.000Z',audio=lib.withAudioSource('sound'),record={id:'audio-one',projectKey:'tree:one',revision:3,title:'Narration',x:10,y:20,width:360,height:200,audio,deletedAt:null,createdAt:now,updatedAt:now};
 const artwork={id:'sound',origin:'canvas',source:'canvas-add',category:'audio',title:'Sound',image:'',videoUrl:'/media/source.wav',status:'completed',createdAt:now,groupId:'one',canvasX:0,canvasY:0};
 const input={works:[artwork],names:{},t:k=>k,readOnly:false,pinnedNode:null,textNodes:[],videoNodes:[],audioNodes:[record]};
 eq(lib.canvasProjects(input)[0].count,2);eq(lib.canvasProjects({...input,works:[]})[0].audioNodes,[record]);cases++;
 const scene={nodes:[],edges:[],active:{members:[]},activeKey:'tree:one',generationTasks:[],taskPositions:{},pendNodes:[],textNodes:[],videoNodes:[],audioNodes:[record],videoTasks:[],works:[artwork],selectedId:record.id,selectedPendId:null,selectedTextId:null,multiSel:[],expandedTextIds:new Set(),locale:'en',lightCanvas:true,nodeSettings:{},nodeSettingsReady:true,readOnly:false,cutoutAvailable:false,operations:new Set(),workflowManifests:[],actions:{audioEdit(){},cutout(){}}};
 const view=lib.projectCanvasScene(scene),node=view.displayNodes.find(n=>n.id===record.id);eq(node.type,'audio');eq(node.data.url,artwork.videoUrl);eq(node.draggable,true);
 eq(lib.projectCanvasScene({...scene,readOnly:true}).displayNodes.find(n=>n.id===record.id).draggable,false);eq(lib.projectCanvasScene({...scene,nodeSettings:{[record.id]:{locked:true}}}).displayNodes.find(n=>n.id===record.id).draggable,false);eq(lib.projectCanvasScene({...scene,activeKey:'tree:other'}).displayNodes.some(n=>n.id===record.id),false);cases++;
 const get=id=>id===record.id?record:undefined;
 for(const undo of [false,true]){
  const move={kind:'move-many',moves:[{id:record.id,from:{x:10,y:20},to:{x:40,y:50}}]};
  eq(lib.compileCanvasHistory(move,undo,()=>undefined,undefined,undefined,undefined,undefined,undefined,get),[{type:'audio-patch',id:record.id,expectedRevision:3,fields:undo?{x:10,y:20}:{x:40,y:50}}]);
  eq(lib.compileCanvasHistory({kind:'audio-add',records:[record]},undo,()=>undefined),[{type:'audio-visibility',id:record.id,visible:!undo}]);
  eq(lib.compileCanvasHistory({kind:'mixed-add',artworks:[artwork],textNodes:[],videoNodes:[],audioNodes:[record],projectKey:record.projectKey},undo,()=>undefined).map(op=>op.type),['visibility','audio-visibility']);
 }
 eq(lib.canvasHistoryProject({kind:'audio-add',records:[record]}),record.projectKey);
 const settings={kind:'node-settings',id:record.id,text:false,audio:true,from:{locked:false},to:{locked:true}};
 eq(lib.compileCanvasHistory(settings,false,()=>undefined)[0].audio,true);
 eq(lib.historyRequest.safeParse({operationId:'11111111-1111-4111-8111-111111111111',operations:[{type:'audio-patch',id:record.id,expectedRevision:3,fields:{audio}}]}).success,true);cases++;
 const records=lib.canvasDeleteRecords([record.id],{artworks:[artwork],textNodes:[],videoNodes:[],audioNodes:[record]});eq(records.audioNodes,[record]);eq(lib.canvasDeletionAction(records).kind,'mixed-delete');eq(lib.canvasSelectionIds([record.id],new Map([[record.id,'audio']])).selectedId,record.id);cases++;
 const video={id:'vnode-one',projectKey:record.projectKey,revision:4,config:{mode:'reference'},inputs:[]},alias='audio-node:'+record.id;
 const snapshot={project:record.projectKey,artworks:[artwork],texts:[],videos:[video],audios:[record],pending:[],selected:[],choices:[{nodeId:'sound',kind:'audio',available:true,value:artwork.videoUrl},{nodeId:alias,kind:'audio',available:true,value:artwork.videoUrl}],locked:()=>false};
 const linked=lib.compileCanvasLink(snapshot,{source:record.id,target:video.id,add:true});eq(linked.to.inputs[0].nodeId,alias);eq(linked.to.inputs[0].role,'source_audio');
 eq(lib.compileCanvasLink({...snapshot,videos:[{...video,inputs:linked.to.inputs}]},{source:record.id,target:video.id,add:false}).to.inputs,[]);
 eq(lib.compileCanvasLink(snapshot,{source:'sound',target:record.id,add:true}),null);
 const reset=lib.compileCanvasLink(snapshot,{source:'sound',target:record.id,add:false});eq(reset.kind,'audio-patch');eq(reset.to.audio.sourceArtworkId,null);
 eq(lib.compileCanvasLink({...snapshot,locked:()=>true},{source:'sound',target:record.id,add:false}),null);cases++;
 // Real history controller must refresh the audio store after its atomic save.
 let refreshes=0;const oldFetch=global.fetch;global.fetch=async()=>Response.json({ok:true,persisted:true});
 const context=lib.createCanvasDocumentContext(),scope=context.render('fixture@example.test',record.projectKey);
 try{
  const controller=lib.createCanvasHistoryController({changed(){},readOnly:()=>false,flush:async()=>{},video:()=>undefined,audio:get,transaction:(_s,work)=>work(),commit(){},pending(){},refresh:async()=>{refreshes++},warning(){}});
  await controller.apply(scope,{kind:'audio-patch',id:record.id,from:{title:'Before'},to:{title:'After'}},false);eq(refreshes,1);cases++;
 }finally{global.fetch=oldFetch;}
 const history=[],notices=[],calls=[];let live=structuredClone(record),locked=false,ready=true,renderFail=true,refreshFail=false;
 const job={id:'job-one',operationId:'11111111-1111-4111-8111-111111111111',status:'completed',outputs:[{artworkId:'edited',mimeType:'audio/wav',fragment:false}]};
 const ports={english:true,writable:()=>true,settingsReady:()=>ready,locked:()=>locked,
  store:{getNode:()=>live,flush:async()=>{},save:async(id,fields)=>{calls.push({kind:'save',id,fields});if(fields.expectedRevision!==undefined&&fields.expectedRevision!==live.revision)throw Error('CAS_CONFLICT');live={...live,...fields,id,revision:live.revision+1};return live;},render:async(id,revision,operationId)=>{calls.push({kind:'render',id,revision,operationId});if(renderFail)throw Error('UNKNOWN_ACCEPTANCE');live={...live,audio:{...live.audio,render:{operationId,baseRevision:revision,sourceArtworkId:live.audio.sourceArtworkId,edit:live.audio.edit}}};return {node:live,job:{...job,operationId}};}},
  location:()=>({projectKey:record.projectKey,x:0,y:0}),created:n=>calls.push({kind:'created',id:n.id}),history:a=>history.push(a),upload:async()=>[{id:'sound',nodeId:'sound',kind:'audio',title:'Source',value:'/media/source.wav',available:true}],merge:async()=>[artwork],jobs:[],refresh:async()=>{if(refreshFail)throw Error('REFRESH_FAILURE')},notice:s=>notices.push(s)};
 const owner=lib.createCanvasAudioActions(),commands=owner.bind(scope,ports);
 await commands.patch(record.id,{title:'New title'});eq(history.at(-1).kind,'audio-patch');eq(history.at(-1).from.title,record.title);cases++;
 locked=true;await reject(()=>commands.patch(record.id,{title:'Locked'}),/Unlock/);locked=false;ready=false;await reject(()=>commands.patch(record.id,{title:'Not ready'}),/Unlock/);ready=true;cases++;
 await reject(()=>commands.render(record.id,live.revision),/UNKNOWN_ACCEPTANCE/);await reject(()=>commands.render(record.id,live.revision),/UNKNOWN_ACCEPTANCE/);
 let renders=calls.filter(c=>c.kind==='render');eq(renders[0].operationId,renders[1].operationId);eq(renders[0].revision,renders[1].revision);renderFail=false;await commands.render(record.id,live.revision);renders=calls.filter(c=>c.kind==='render');eq(renders[2].operationId,renders[0].operationId);cases++;
 // Existing node binding survives refresh failure without creating a second job.
 refreshFail=true;await reject(()=>commands.render(record.id,live.revision),/REFRESH_FAILURE/);refreshFail=false;await commands.render(record.id,live.revision);renders=calls.filter(c=>c.kind==='render');eq(new Set(renders.map(c=>c.operationId)).size,1);cases++;
 const completed={...job,operationId:live.audio.render.operationId};
 await commands.adopt(record.id,completed);eq(live.audio.render,null);eq(live.audio.adopted.artworkId,'edited');eq(history.at(-1).from.audio.render,null);cases++;
 // A save arriving during flush cannot be overwritten with a stale adoption body.
 live=structuredClone(record);live.audio.render={operationId:job.operationId,baseRevision:3,sourceArtworkId:'sound',edit:live.audio.edit};
 let flushes=0;ports.store.flush=async()=>{if(++flushes===2)live={...live,revision:live.revision+1,title:'Later edit'};};
 await reject(()=>owner.bind(scope,ports).adopt(record.id,job),/CAS_CONFLICT/);eq(live.title,'Later edit');eq(live.audio.render.operationId,job.operationId);cases++;
 ports.store.flush=async()=>{};ports.jobs=[job];live=structuredClone(record);live.audio.render={operationId:job.operationId,baseRevision:3,sourceArtworkId:'sound',edit:live.audio.edit};
 const auto=owner.bind(scope,ports);auto.adoptReady([live]);auto.adoptReady([live]);await new Promise(r=>setImmediate(r));eq(live.audio.render,null);eq(notices,[]);cases++;
 live=structuredClone(record);live.audio.render={operationId:job.operationId,baseRevision:3,sourceArtworkId:'sound',edit:{...live.audio.edit,gain:.5}};const before=calls.length;auto.adoptReady([live]);await new Promise(r=>setImmediate(r));eq(calls.length,before);cases++;
 const choices=await auto.upload(record.id,[]);eq(choices[0].title,'Source');eq(history.at(-1).kind,'add');cases++;
 // Creation is scoped and coalesces a double click without another node save.
 live=structuredClone(record);const createBefore=calls.filter(c=>c.kind==='save').length,historyBefore=history.length;
 const creations=await Promise.all([auto.create({x:0,y:0}),auto.create({x:0,y:0})]);
 eq(creations.filter(Boolean).length,1);eq(calls.filter(c=>c.kind==='save').length-createBefore,1);eq(live.title,'Audio');eq(history.length-historyBefore,1);eq(history.at(-1).kind,'audio-add');cases++;
 const other=context.render('fixture@example.test','tree:other');ok(other.viewCurrent());await reject(()=>commands.patch(record.id,{title:'Stale'}),/切换/);cases++;
 // Canvas and startup wiring are checked in addition to exercising real owners.
 const canvas=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),sql=fs.readFileSync(path.join(root,'src/lib/canvas/storage-schema.ts'),'utf8');
 ok(canvas.startsWith('"use client";'));ok(canvas.includes('audioActionsOwner.bind(canvasHistory.scope'));ok(canvas.includes('useAudioResultAdoption('));ok(!canvas.includes('audioRenderAttempts'));ok(!canvas.includes('audioAdopting'));
 ok(/audios:audioNodesStore\.(?:nodes|getSnapshot\(\)\.nodes)\.(?:map|filter)\(/.test(canvas));ok(canvas.includes('kinds:nativeDocuments.settingsKinds'));
 const kinds=lib.canvasNativeDocuments({audioNodes:{getNode:get}}).settingsKinds;
 eq(kinds(record.id).audio,true);eq(kinds(record.id).timeline,false);eq(kinds('missing').audio,false);
 ok(canvas.includes('audio:audioNodesStore.getNode'));eq((sql.match(/CREATE TABLE IF NOT EXISTS app_canvas_audio_/g)||[]).length,2);ok(sql.includes('databaseSchemaReadiness(getPool(),"canvas-audio-nodes")'));cases++;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',cases,checks,actualOwners:true,browserPorts:'fixture',db:false,supplier:0},null,2)+'\n');
 console.log(`CANVAS_AUDIO_INTEGRATION=PASS MODE=MODIFIED CASES=${cases} CHECKS=${checks} GRAPH_HISTORY_NODE_ACTIONS=ACTUAL UNKNOWN_RENDER=SAME_OPERATION ADOPTION=CAS SCOPE=CAPTURED NETWORK=FIXTURE DB=0 SUPPLIER=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
