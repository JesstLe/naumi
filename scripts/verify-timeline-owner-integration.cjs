// Native multitrack uses the existing Canvas owners. Actual rule/action/controller
// modules run here; browser auth, transport and node store are explicit ports.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]},root=path.resolve(arg('--source-root')||'.'),baseline=args.includes('--baseline'),out=path.resolve(arg('--out')||process.env.CANVAS_TEST_OUT||'output/timeline-owner-integration');
let checks=0,cases=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},ok=v=>{assert.ok(v);checks++},reject=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++};
const fixture={workspace:'personal',revision:0,auth:async()=>({})};
async function load(files){
 const result=await esbuild.build({stdin:{contents:files.map(f=>`export * from ${JSON.stringify(path.join(root,f).replaceAll('\\','/'))};`).join('\n'),resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',nodePaths:[path.resolve('node_modules')],tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'browser-ports',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export const authHeader=()=>__fixture.auth();':'export const currentWorkspace=()=>__fixture.workspace;export const currentWorkspaceRevision=()=>__fixture.revision;',loader:'js'}));}}]});
 const m={exports:{}};vm.runInThisContext('(function(module,exports,require,__fixture){'+result.outputFiles[0].text+'\n})')(m,m.exports,require,fixture);return m.exports;
}
const files=['src/lib/canvas/history-contract.ts','src/lib/canvas/history-model.ts','src/lib/canvas/history-controller.ts','src/lib/canvas/node-commands.ts','src/lib/canvas/project-catalog.ts','src/lib/canvas/scene-projection.ts','src/lib/canvas/selection.ts','src/lib/canvas/link-command.ts','src/lib/canvas/document-scope.ts','src/lib/timeline/project.ts','src/lib/timeline/edit.ts'];
async function main(){
 const lib=await load([...(baseline?files.filter(file=>!file.endsWith('/edit.ts')):files),...(baseline?[]:['src/lib/canvas/timeline-actions.ts'])]);
 if(baseline){
  eq(fs.existsSync(path.join(root,'src/lib/canvas/timeline-actions.ts')),false);eq(fs.existsSync(path.join(root,'src/lib/canvas/timeline-node-schema.ts')),false);
  eq(lib.historyRequest.safeParse({operationId:'11111111-1111-4111-8111-111111111111',operations:[{type:'timeline-visibility',id:'timeline-one',visible:true}]}).success,false);
  console.log('CANVAS_TIMELINE_INTEGRATION=PASS MODE=BASELINE CHECKS='+checks+' TIMELINE_OWNER=ABSENT TIMELINE_HISTORY=ABSENT NETWORK=0 DB=0 SUPPLIER=0');return;
 }
 const now='2026-10-28T00:00:00.000Z',material={artworkId:'source-video',kind:'video',durationSeconds:4,hasAudio:true,key:'source.mp4',url:'/media/source.mp4',sha256:'a'.repeat(64)};
 const project=lib.appendTimelineClip(lib.newTimelineProject(),material,{clipId:'clip-one',trackId:'',newTrackId:'video-two',newTrackName:'Video'}).project;
 const record={id:'timeline-one',projectKey:'tree:one',revision:3,title:'Sequence',x:10,y:20,width:400,height:280,timeline:project,adopted:{artworkId:'rendered',jobId:'job-prior',project:structuredClone(project)},render:null,deletedAt:null,createdAt:now,updatedAt:now};
 const artwork={id:'rendered',origin:'canvas',source:'canvas-add',title:'Movie',image:'',videoUrl:'/media/output.mp4',status:'completed',createdAt:now,groupId:'one',canvasX:0,canvasY:0};
 const input={works:[artwork],names:{},t:k=>k,readOnly:false,pinnedNode:null,textNodes:[],videoNodes:[],timelineNodes:[record]};
 eq(lib.canvasProjects(input)[0].count,2);eq(lib.canvasProjects({...input,works:[]})[0].timelineNodes,[record]);cases++;
 const scene={nodes:[],edges:[],active:{members:[]},activeKey:'tree:one',generationTasks:[],taskPositions:{},pendNodes:[],textNodes:[],videoNodes:[],timelineNodes:[record],videoTasks:[],works:[artwork],selectedId:record.id,selectedPendId:null,selectedTextId:null,multiSel:[],expandedTextIds:new Set(),locale:'en',lightCanvas:true,nodeSettings:{},nodeSettingsReady:true,readOnly:false,cutoutAvailable:false,operations:new Set(),workflowManifests:[],actions:{timelineEdit(){},cutout(){}}};
 const node=lib.projectCanvasScene(scene).displayNodes.find(n=>n.id===record.id);eq(node.type,'timeline');eq(node.data.url,artwork.videoUrl);eq(node.draggable,true);
 eq(lib.projectCanvasScene({...scene,readOnly:true}).displayNodes.find(n=>n.id===record.id).draggable,false);eq(lib.projectCanvasScene({...scene,nodeSettings:{[record.id]:{locked:true}}}).displayNodes.find(n=>n.id===record.id).draggable,false);eq(lib.projectCanvasScene({...scene,activeKey:'tree:other'}).displayNodes.some(n=>n.id===record.id),false);cases++;
 const sourceNode={...record,id:'vnode-source',config:{mode:'reference',prompt:'',durationSeconds:4,resolution:'720p',aspectRatio:'16:9'},inputs:[]},withSources=structuredClone(record);withSources.timeline.tracks[0].clips=[{...project.tracks[0].clips[0],canvasSourceId:sourceNode.id},{...project.tracks[0].clips[0],id:'clip-two',position:4,canvasSourceId:sourceNode.id}];
 const nativeEdges=lib.projectCanvasScene({...scene,videoNodes:[sourceNode],timelineNodes:[withSources]}).displayEdges.filter(edge=>edge.target===record.id);eq(nativeEdges.length,1);eq(nativeEdges[0].id,`e-timeline-input-${record.id}-${sourceNode.id}`);cases++;
 const get=id=>id===record.id?record:undefined;
 for(const undo of [false,true]){
  const move={kind:'move-many',moves:[{id:record.id,from:{x:10,y:20},to:{x:40,y:50}}]};
  eq(lib.compileCanvasHistory(move,undo,()=>undefined,undefined,undefined,undefined,undefined,undefined,undefined,get),[{type:'timeline-patch',id:record.id,expectedRevision:3,fields:undo?{x:10,y:20}:{x:40,y:50}}]);
  eq(lib.compileCanvasHistory({kind:'timeline-add',records:[record]},undo,()=>undefined),[{type:'timeline-visibility',id:record.id,visible:!undo}]);
  eq(lib.compileCanvasHistory({kind:'mixed-add',artworks:[artwork],textNodes:[],videoNodes:[],timelineNodes:[record],projectKey:record.projectKey},undo,()=>undefined).map(op=>op.type),['visibility','timeline-visibility']);
 }
 eq(lib.canvasHistoryProject({kind:'timeline-add',records:[record]}),record.projectKey);
 const settings={kind:'node-settings',id:record.id,text:false,timeline:true,from:{locked:false},to:{locked:true}};eq(lib.compileCanvasHistory(settings,false,()=>undefined)[0].timeline,true);
 eq(lib.historyRequest.safeParse({operationId:'11111111-1111-4111-8111-111111111111',operations:[{type:'timeline-patch',id:record.id,expectedRevision:3,fields:{timeline:project}}]}).success,true);cases++;
 const records=lib.canvasDeleteRecords([record.id],{artworks:[artwork],textNodes:[],videoNodes:[],timelineNodes:[record]});eq(records.timelineNodes,[record]);eq(lib.canvasDeletionAction(records).kind,'mixed-delete');eq(lib.canvasSelectionIds([record.id],new Map([[record.id,'timeline']])).selectedId,record.id);cases++;
 const video={id:'vnode-one',projectKey:record.projectKey,revision:4,config:{mode:'reference'},inputs:[]},alias='timeline-node:'+record.id;
 const snapshot={project:record.projectKey,artworks:[artwork],texts:[],videos:[video],timelines:[record],timelineMaterials:[material],pending:[],selected:[],choices:[{nodeId:alias,kind:'video',available:true,value:artwork.videoUrl}],locked:()=>false};
 const linked=lib.compileCanvasLink(snapshot,{source:record.id,target:video.id,add:true});eq(linked.to.inputs[0].nodeId,alias);eq(linked.to.inputs[0].role,'source_video');eq(lib.compileCanvasLink({...snapshot,videos:[{...video,inputs:linked.to.inputs}]},{source:record.id,target:video.id,add:false}).to.inputs,[]);cases++;
 const added=lib.compileCanvasLink(snapshot,{source:material.artworkId,target:record.id,add:true});eq(added.kind,'timeline-patch');eq(added.to.timeline.tracks.flatMap(t=>t.clips).at(-1).duration,4);
 assert.throws(()=>lib.compileCanvasLink({...snapshot,timelineMaterials:[]},{source:material.artworkId,target:record.id,add:true}),/已检验/);checks++;
 const removed=lib.compileCanvasLink(snapshot,{source:material.artworkId,target:record.id,add:false});eq(removed.to.timeline.tracks.flatMap(t=>t.clips).length,0);eq(lib.compileCanvasLink({...snapshot,locked:()=>true},{source:material.artworkId,target:record.id,add:true}),null);cases++;
 // Actual history controller must refresh the native store after its transaction.
 let refreshes=0;const oldFetch=global.fetch;global.fetch=async()=>Response.json({ok:true,persisted:true});
 const context=lib.createCanvasDocumentContext(),scope=context.render('fixture@example.test',record.projectKey);
 try{const controller=lib.createCanvasHistoryController({changed(){},readOnly:()=>false,flush:async()=>{},video:()=>undefined,timeline:get,transaction:(_s,work)=>work(),commit(){},pending(){},refresh:async()=>{refreshes++},warning(){}});await controller.apply(scope,{kind:'timeline-patch',id:record.id,from:{title:'Before'},to:{title:'After'}},false);eq(refreshes,1);cases++;}finally{global.fetch=oldFetch;}
 const history=[],calls=[];let live=structuredClone(record),locked=false,ready=true,renderFail=true,adoptFail=true,refreshFail=false;
 const job={id:'job-one',operationId:'11111111-1111-4111-8111-111111111111',status:'completed',outputs:[{artworkId:'rendered',mimeType:'video/mp4',fragment:false}]};
 const ports={english:true,writable:()=>true,settingsReady:()=>ready,locked:()=>locked,
  store:{getNode:()=>live,flush:async()=>{},save:async(id,fields)=>{calls.push({kind:'save',id,fields});if(fields.expectedRevision!==undefined&&fields.expectedRevision!==live.revision)throw Error('CAS_CONFLICT');live={...live,...fields,id,revision:live.revision+1};return live;},
   render:async(id,revision,operationId)=>{calls.push({kind:'render',id,revision,operationId});if(renderFail)throw Error('UNKNOWN_ACCEPTANCE');live={...live,render:{operationId,baseRevision:revision,project:structuredClone(live.timeline)}};return {node:live,job:{...job,operationId}};},
   adopt:async(id,revision,operationId,jobId)=>{calls.push({kind:'adopt',id,revision,operationId,jobId});if(adoptFail)throw Error('UNKNOWN_ADOPTION');live={...live,adopted:{artworkId:'rendered',jobId,project:live.render.project},revision:live.revision+1};return live;},inspect:async()=>[material]},
  location:()=>({projectKey:record.projectKey,x:0,y:0}),created:n=>calls.push({kind:'created',id:n.id}),history:a=>history.push(a),upload:async()=>[{id:'source-video',nodeId:'source-video',kind:'video',title:'Source',value:material.url,available:true}],merge:async()=>[artwork],jobs:[],refresh:async()=>{if(refreshFail)throw Error('REFRESH_FAILURE')}};
 const owner=lib.createCanvasTimelineActions(),commands=owner.bind(scope,ports);
 await commands.patch(record.id,{title:'New title'});eq(history.at(-1).kind,'timeline-patch');eq(history.at(-1).from.title,record.title);cases++;
 locked=true;await reject(()=>commands.patch(record.id,{title:'Locked'}),/Unlock/);locked=false;ready=false;await reject(()=>commands.patch(record.id,{title:'Not ready'}),/Unlock/);ready=true;cases++;
 await reject(()=>commands.render(record.id,live.revision),/UNKNOWN_ACCEPTANCE/);await reject(()=>commands.render(record.id,live.revision),/UNKNOWN_ACCEPTANCE/);
 let renders=calls.filter(c=>c.kind==='render');eq(renders[0].operationId,renders[1].operationId);eq(renders[0].revision,renders[1].revision);renderFail=false;await commands.render(record.id,live.revision);renders=calls.filter(c=>c.kind==='render');eq(renders[2].operationId,renders[0].operationId);cases++;
 // An accepted intent without a visible job still reuses its original operation.
 refreshFail=true;await reject(()=>commands.render(record.id,live.revision),/REFRESH_FAILURE/);refreshFail=false;await commands.render(record.id,live.revision);renders=calls.filter(c=>c.kind==='render');eq(new Set(renders.map(c=>c.operationId)).size,1);cases++;
 const oldAdopted=structuredClone(live.adopted);await reject(()=>commands.adopt(record.id,job),/UNKNOWN_ADOPTION/);live={...live,title:'Later draft',timeline:{...live.timeline,masterGain:.5}};await reject(()=>commands.adopt(record.id,job),/UNKNOWN_ADOPTION/);
 let adoptions=calls.filter(c=>c.kind==='adopt');eq(adoptions[0].operationId,adoptions[1].operationId);eq(adoptions[0].revision,adoptions[1].revision);adoptFail=false;await commands.adopt(record.id,job);eq(history.at(-1).from.adopted,oldAdopted);eq(live.title,'Later draft');eq(live.timeline.masterGain,.5);eq(live.adopted.jobId,job.id);cases++;
 // Metadata reads and imported media use actual scope-bound action ports.
 eq(await commands.inspect(record.id,['source-video']),[material]);const choices=await commands.upload(record.id,[]);eq(choices[0].title,'Source');eq(history.at(-1).kind,'add');cases++;
 live=structuredClone(record);const before=calls.filter(c=>c.kind==='save').length,h=history.length;const created=await Promise.all([commands.create({x:0,y:0}),commands.create({x:0,y:0})]);eq(created.filter(Boolean).length,1);eq(calls.filter(c=>c.kind==='save').length-before,1);eq(history.length-h,1);eq(history.at(-1).kind,'timeline-add');cases++;
 const other=context.render('fixture@example.test','tree:other');ok(other.viewCurrent());await reject(()=>commands.patch(record.id,{title:'Stale'}),/切换/);await reject(()=>commands.inspect(record.id,[]),/切换/);cases++;
 const canvas=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),sql=fs.readFileSync(path.join(root,'src/lib/canvas/storage-schema.ts'),'utf8');
 ok(canvas.startsWith('"use client";'));ok(canvas.includes('timelineActionsOwner.bind(canvasHistory.scope'));ok(!canvas.includes('timelineRenderAttempts'));ok(!canvas.includes('timelineAdoptAttempts'));ok(canvas.includes('timelines:timelineNodesStore.nodes.map'));ok(canvas.includes('timeline:!!timelineNodesStore.getNode(id)'));ok(canvas.includes('timeline:timelineNodesStore.getNode'));eq((sql.match(/CREATE TABLE IF NOT EXISTS app_canvas_timeline_/g)||[]).length,2);ok(sql.includes('databaseSchemaReadiness(getPool(),"canvas-timeline-nodes")'));cases++;
 ok(fs.readFileSync(path.join(root,'src/components/canvas/use-canvas-scene-actions.ts'),'utf8').includes('timelineEdit:(...args)=>current.current.timelineEdit?.(...args)'));
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',cases,checks,actualOwners:true,browserPorts:'fixture',db:false,supplier:0},null,2)+'\n');
 console.log(`CANVAS_TIMELINE_INTEGRATION=PASS MODE=MODIFIED CASES=${cases} CHECKS=${checks} GRAPH_HISTORY_NODE_ACTIONS=ACTUAL UNKNOWN_RENDER=SAME_OPERATION UNKNOWN_ADOPTION=SAME_OPERATION SCOPE=CAPTURED MATERIALS=INSPECTED NETWORK=FIXTURE DB=0 SUPPLIER=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
