const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),esbuild=require('esbuild');
const args=process.argv.slice(2),baseline=args.includes('--baseline'),root=path.resolve(args.includes('--source-root')?args[args.indexOf('--source-root')+1]:'.');
function load(files){const result=esbuild.buildSync({stdin:{contents:files.map(f=>`export * from ${JSON.stringify(path.join(root,f).replaceAll('\\','/'))}`).join(';'),resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,nodePaths:[path.resolve('node_modules')],tsconfigRaw:{compilerOptions:{baseUrl:root,paths:{'@/*':['src/*']}}}}),m={exports:{}};vm.runInThisContext('(function(module,exports,require){'+result.outputFiles[0].text+'\n})')(m,m.exports,require);return m.exports;}
const lib=load(['src/lib/canvas/history-contract.ts','src/lib/canvas/history-model.ts','src/lib/canvas/node-commands.ts','src/lib/canvas/project-catalog.ts','src/lib/canvas/scene-projection.ts','src/lib/canvas/selection.ts','src/lib/canvas/link-command.ts']);
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},ok=x=>{assert.ok(x);checks++};
const now='2026-10-27T00:00:00.000Z',project={version:1,name:'Director',panoramaArtworkId:'image',entities:[],cameras:[],activeCameraId:'camera',duration:2,keyframes:[]};
const director={id:'director-one',projectKey:'tree:one',revision:3,title:'Director',x:10,y:20,width:420,height:280,project,outputs:[{artworkId:'image',kind:'image'}],deletedAt:null,createdAt:now,updatedAt:now};
// Use the real main schema for valid engineering data in modified checks.
if(!baseline){const p=load(['src/lib/director/project.ts']).newDirectorProject();p.panoramaArtworkId='image';director.project=p}
const artwork={id:'image',origin:'canvas',source:'canvas-add',title:'Image',image:'/media/image.png',status:'completed',createdAt:now,groupId:'one',canvasX:0,canvasY:0};
const input={works:[artwork],names:{},t:k=>k,readOnly:false,pinnedNode:null,textNodes:[],videoNodes:[],directorNodes:[director]};
const projects=lib.canvasProjects(input);eq(projects[0].count,baseline?1:2);eq(projects[0].directorNodes?.length,baseline?undefined:1);
eq(lib.canvasProjects({...input,works:[]}).length,baseline?0:1);
const scene={nodes:[{id:'image',type:'art',position:{x:0,y:0},data:{id:'image'}}],edges:[],active:{members:[artwork]},activeKey:'tree:one',generationTasks:[],taskPositions:{},pendNodes:[],textNodes:[],videoNodes:[],directorNodes:[director],videoTasks:[],works:[artwork],selectedId:director.id,selectedPendId:null,selectedTextId:null,multiSel:[],expandedTextIds:new Set(),locale:'en',lightCanvas:true,nodeSettings:{},nodeSettingsReady:true,readOnly:false,cutoutAvailable:false,operations:new Set(),workflowManifests:[],actions:{directorEdit:()=>{},cutout:()=>{}}};
const view=lib.projectCanvasScene(scene);eq(view.displayNodes.filter(n=>n.type==='director').length,baseline?0:1);
if(!baseline){const node=view.displayNodes.find(n=>n.id===director.id);eq(node.data.node,director);eq(node.data.english,true);eq(node.data.preview,artwork.image);eq(view.displayEdges.map(e=>e.id),['e-director-background-director-one','e-director-output-director-one-image']);
 eq(lib.projectCanvasScene({...scene,readOnly:true}).displayNodes.find(n=>n.id===director.id).draggable,false);
 eq(lib.projectCanvasScene({...scene,nodeSettings:{[director.id]:{locked:true}}}).displayNodes.find(n=>n.id===director.id).draggable,false);
 eq(lib.projectCanvasScene({...scene,activeKey:'tree:other'}).displayNodes.some(n=>n.id===director.id),false);
 const get=id=>id===director.id?director:undefined;
 for(const undo of [false,true]){
  eq(lib.compileCanvasHistory({kind:'director-add',records:[director]},undo,()=>undefined,undefined,get),[{type:'director-visibility',id:director.id,visible:!undo}]);
  const result=lib.compileCanvasHistory({kind:'move-many',moves:[{id:director.id,from:{x:10,y:20},to:{x:40,y:50}}]},undo,()=>undefined,undefined,get);eq(result,[{type:'director-patch',id:director.id,expectedRevision:3,fields:undo?{x:10,y:20}:{x:40,y:50}}]);
 }
 eq(lib.canvasHistoryProject({kind:'director-add',records:[director]}),'tree:one');
 const action={kind:'mixed-add',artworks:[artwork],textNodes:[],videoNodes:[],directorNodes:[director],projectKey:'tree:one'};
 const ops=lib.compileCanvasHistory(action,true,()=>undefined,undefined,get);eq(ops.map(o=>o.type),['visibility','director-visibility']);eq(ops[0].expectedArtwork.visible,true);
 const parsed=lib.historyRequest.parse({operationId:'4e2dcfd3-8222-4310-b90a-254582b83381',operations:[{type:'director-patch',id:director.id,expectedRevision:3,fields:{project:director.project}}]});eq(parsed.operations[0].fields.project,director.project);
 const snapshot={project:'tree:one',artworks:[artwork],texts:[],videos:[],directors:[director],pending:[],selected:[],choices:[{nodeId:'image',kind:'image',available:true}],locked:()=>false,productTitle:'Product',referenceLimit:'Limit',cycleMessage:'Cycle',productMention:x=>x};
 const cut=lib.compileCanvasLink(snapshot,{source:'image',target:director.id,add:false});eq(cut.kind,'director-patch');eq(cut.to.project.panoramaArtworkId,null);
 const add=lib.compileCanvasLink({...snapshot,directors:[{...director,project:{...director.project,panoramaArtworkId:null}}]},{source:'image',target:director.id,add:true});eq(add.to.project.panoramaArtworkId,'image');
 eq(lib.compileCanvasLink({...snapshot,locked:id=>id===director.id},{source:'image',target:director.id,add:false}),null);
 eq(lib.compileCanvasLink({...snapshot,artworks:[artwork,{...artwork,id:'target'}]},{source:director.id,target:'target',add:true}),{kind:'parent',targetId:'target',parentId:'image',added:true});
 const records=lib.canvasDeleteRecords([director.id],{artworks:[artwork],textNodes:[],videoNodes:[],directorNodes:[director]});eq(records.directorNodes,[director]);eq(lib.canvasDeletionAction(records).kind,'mixed-delete');
 eq(lib.canvasSelectionIds([director.id],new Map([[director.id,'director']])).selectedId,director.id);
 ok(!fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8').includes('for(const director of directorNodesStore.nodes)'));
 ok(fs.readFileSync(path.join(root,'src/lib/db.ts'),'utf8').includes('Transitional compatibility facade'));
 ok(!/from\s*["']\.\.\/db/.test(fs.readFileSync(path.join(root,'src/lib/canvas/director-node-repository.ts'),'utf8')));
}else {eq(lib.canvasDeletionAction(lib.canvasDeleteRecords([director.id],{artworks:[],textNodes:[],videoNodes:[],directorNodes:[director]})),null)}
console.log(`CANVAS_DIRECTOR_INTEGRATION=PASS MODE=${baseline?'BASELINE':'MODIFIED'} CHECKS=${checks} SCENE_HISTORY_NODE_OWNERS=ACTUAL NETWORK=0 DB=0 SUPPLIER=0`);
