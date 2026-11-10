// Actual Canvas entry points + link compiler; persistence is an explicit test port.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),esbuild=require('esbuild');
const root=process.cwd(),out=path.resolve(process.env.CANVAS_REFERENCE_OUT||'output/canvas-reference-creation');
const client=fs.readFileSync('src/components/canvas/canvas-client.tsx','utf8');
const ast=ts.createSourceFile('canvas.tsx',client,99,true,4),functions={};
(function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)functions[n.name.text]=n.getText(ast);ts.forEachChild(n,walk);})(ast);
const names=['createCanvasNode','spawnNode','submitCanvasLink','onConnectStart','onConnectEnd'];
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:99,module:1}}).outputText;
const files=['canvas/node-creation','canvas/link-command','character/project','scene/project','director/project','audio/project','timeline/project'];
const built=esbuild.buildSync({stdin:{contents:files.map(f=>`export * from './src/lib/${f}';`).join('\n'),resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};vm.runInThisContext('(function(module,exports,require){'+built.outputFiles[0].text+'\n})')(mod,mod.exports,require);const lib=mod.exports;
const plain=x=>JSON.parse(JSON.stringify(x));let cases=0;
async function test(name,run){await run();cases++;console.log('PASS '+name);}
function fixture(options={}){
 const data={image:[],text:[],video:[],director:[],character:[],scene:[],audio:[],timeline:[]},actions=[],creates=[],notices=[];
 let current=true,release;const gate=options.defer?new Promise(r=>release=r):Promise.resolve();
 const scope={project:'tree:test',viewCurrent:()=>current,assertView(){assert.ok(current);}};
 const source={id:options.source||'image-source',projectKey:scope.project,title:'Source',sourceIds:[],productIds:[],targetIds:[],content:'source text'};
 const store=kind=>({nodes:[],getSnapshot:()=>({nodes:data[kind]}),getNode:id=>data[kind].find(n=>n.id===id)});
 const c={...lib,console,Error,Promise,Set,Map,Date,crypto:globalThis.crypto,readOnly:!!options.readOnly,user:{email:'fixture'},L:zh=>zh,t:key=>key,
  canFeature:()=>!options.videoDenied,centerScreen:()=>({x:100,y:200}),isNodeLocked:()=>!!options.locked,
  preparingPendingImagesRef:{current:new Set()},multiSel:[],videoCreationCatalogRef:{current:{models:[]}},
  flashTip:m=>notices.push(m),withProductMention:x=>x,canvasHistory:{scope,submit:async(s,compile)=>{
   const action=compile();if(!action)return false;if(options.reject)throw Error('link rejected');actions.push(plain(action));return true;
  }},canvasTextDocument:{flush:async()=>{},getSnapshot:()=>({nodes:[...(source.id.startsWith('text-')?[source]:[]),...data.text]})},
  canvasArtworkDocument:{getSnapshot:()=>({nodes:[source]})},active:{members:[source]},
  pendingPresentation:{getSnapshot:()=>data.image},timelineActions:{inspect:async(id,ids)=>ids.map(artworkId=>({artworkId,kind:'image',durationSeconds:null,hasAudio:false}))},
  videoInputChoices:[{nodeId:source.id,kind:options.audio?'audio':source.id.startsWith('text-')?'text':'image',available:true,value:'fixture'}],
  setSpawnMenu:value=>{c.spawnMenu=value;},setCtxMenu:()=>{},setLinking:()=>{},spawnSourceRef:{current:null},connectedRef:{current:false},
  canvasAreaRef:{current:{getBoundingClientRect:()=>({left:40,top:60})}},
 };
 for(const kind of ['video','director','character','scene','audio','timeline'])c[kind+'NodesStore']=store(kind);
 async function create(kind,point){
  creates.push([kind,point]);await gate;if(options.fail)return;
  const node={id:(kind==='image'?'pend':kind)+'-new',projectKey:scope.project,inputs:[],parentId:null,linked:false,sourceIds:[],productIds:[],targetIds:[],content:'',
   config:{mode:'text'},character:lib.newCharacterProject(),scene:lib.newSceneProject(),project:lib.newDirectorProject(),audio:lib.newAudioProject(),timeline:lib.newTimelineProject()};
  data[kind].push(node);return node;
 }
 for(const kind of ['director','character','scene','audio','timeline'])c['create'+kind[0].toUpperCase()+kind.slice(1)+'Node']=p=>create(kind,p);
 c.addTextNodeAtScreen=(x,y)=>create('text',{x,y});c.addPendAtScreen=(x,y)=>create('image',{x,y});c.openVideoNodeFromSelection=(_,p)=>create('video',p);
 vm.createContext(c);vm.runInContext(transpile(names.map(n=>functions[n]).join('\n')),c);
 return {c,data,creates,actions,notices,release:()=>release?.(),leave:()=>current=false};
}
async function behavior(){
 for(const kind of ['image','text','video','director','character','scene','audio','timeline'])await test('shared-create-and-reference-'+kind,async()=>{
  const f=fixture(kind==='audio'?{source:'audio-material',audio:true}:{}),source=kind==='audio'?'audio-material':'image-source';
  f.c.spawnMenu={sourceId:source,x:71,y:83,cx:111,cy:143};await f.c.spawnNode(kind);
  assert.deepEqual(plain(f.creates),[[kind,{x:71,y:83}]]);assert.equal(f.actions.length,1);assert.equal(f.c.spawnMenu,null);
  const a=f.actions[0];assert.equal(a.kind,kind==='image'?'pending-link':kind+'-patch');
  if(kind==='image')assert.deepEqual(a.to.inputs,[source]);if(kind==='text')assert.deepEqual(a.to.sourceIds,[source]);
  if(kind==='video')assert.equal(a.to.inputs[0].nodeId,source);if(kind==='audio')assert.equal(a.to.audio.sourceArtworkId,source);
  if(kind==='character')assert.deepEqual(a.to.character.appearances[0].referenceArtworkIds,[source]);
  if(kind==='scene')assert.deepEqual(a.to.scene.states[0].referenceArtworkIds,[source]);
  if(kind==='director')assert.equal(a.to.project.panoramaArtworkId,source);
  if(kind==='timeline')assert.equal(a.to.timeline.tracks[0].clips[0].artworkId,source);
 });
 await test('text-to-text-no-longer-hidden',async()=>{const f=fixture({source:'text-source'});await f.c.createCanvasNode('text',undefined,'text-source');assert.deepEqual(f.actions[0].to.sourceIds,['text-source']);});
 for(const kind of ['character','scene','audio','timeline'])await test('native-source-to-video-'+kind,async()=>{
  const f=fixture(),id=kind+'-source',node={id,projectKey:'tree:test',character:lib.newCharacterProject(),scene:lib.newSceneProject()};f.data[kind].push(node);
  const alias=kind==='character'?`character:${id}#base`:kind==='scene'?`scene:${id}#base`:`${kind}-node:${id}`;
  f.c.videoInputChoices.push({nodeId:alias,kind:kind==='audio'?'audio':kind==='timeline'?'video':'text',available:true,value:'fixture'});
  await f.c.createCanvasNode('video',undefined,id);assert.equal(f.actions[0].to.inputs[0].nodeId,alias);
 });
 await test('scene-to-director-uses-scene-snapshot',async()=>{const f=fixture();f.data.scene.push({id:'scene-source',revision:2,scene:lib.newSceneProject()});await f.c.createCanvasNode('director',undefined,'scene-source');assert.equal(f.actions[0].kind,'director-patch');assert.ok(f.actions[0].to.project.sceneReference);});
 await test('director-to-image-resolves-output',async()=>{const f=fixture();f.data.director.push({id:'director-source',outputs:[{artworkId:'image-source'}]});await f.c.createCanvasNode('image',undefined,'director-source');assert.deepEqual(f.actions[0].to.inputs,['image-source']);});
 await test('plain-add-does-not-reference-selection',async()=>{const f=fixture();await f.c.createCanvasNode('video');assert.equal(f.creates.length,1);assert.equal(f.actions.length,0);});
 for(const options of [{readOnly:true},{locked:true},{videoDenied:true},{fail:true}])await test('blocked-or-failed-'+JSON.stringify(options),async()=>{const f=fixture(options);await f.c.createCanvasNode('video',undefined,'image-source');assert.equal(f.actions.length,0);});
 await test('await-save-before-link',async()=>{const f=fixture({defer:true});const task=f.c.createCanvasNode('video',undefined,'image-source');assert.equal(f.actions.length,0);f.release();await task;assert.equal(f.actions.length,1);});
 await test('project-change-during-save-no-link',async()=>{const f=fixture({defer:true});const task=f.c.createCanvasNode('video',undefined,'image-source');f.leave();f.release();await task;assert.equal(f.actions.length,0);});
 await test('link-rejection-reports-without-recreating',async()=>{const f=fixture({reject:true});await f.c.createCanvasNode('video',undefined,'image-source');assert.equal(f.creates.length,1);assert.deepEqual(f.notices,['link rejected']);});
 await test('incompatible-reference-reuses-link-validation',async()=>{const f=fixture();await f.c.createCanvasNode('audio',undefined,'image-source');assert.equal(f.actions.length,0);assert.equal(f.notices.length,1);assert.equal(f.creates.length,1);});
 await test('native-source-menu-and-viewport-coordinates',()=>{const f=fixture();for(const id of ['video-source','character-source','scene-source','audio-source','timeline-source','director-source']){
  f.c.onConnectStart(null,{nodeId:id});f.c.onConnectEnd({clientX:111,clientY:143});assert.deepEqual(plain(f.c.spawnMenu),{sourceId:id,x:71,y:83,cx:111,cy:143});
 }});
 await test('valid-existing-connection-does-not-spawn',()=>{const f=fixture();f.c.onConnectStart(null,{nodeId:'source'});f.c.onConnectEnd({clientX:1,clientY:2},{isValid:true});assert.equal(f.c.spawnMenu,undefined);});
}
async function browser(){
 const {chromium}=require('@playwright/test'),{pathToFileURL}=require('node:url');
 const surface=fs.readFileSync('src/components/canvas/context-menu-surface.tsx','utf8');
 const jsx=client.match(/\{spawnMenu && \(\s*(<ContextMenuSurface[^]*?<\/ContextMenuSurface>)\s*\)\}/)?.[1];assert.ok(jsx,'real spawn JSX uses shared menu');
 const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';
 import{ContextMenuSurface,ContextMenuItem as Item}from'./src/components/canvas/context-menu-surface';
 import{canvasNodeMenuItems}from'./src/components/canvas/node-menu-items';
 function App(){const[spawnMenu,setSpawnMenu]=useState(null);const[readOnly,setReadOnly]=useState(false);const[videoNodeCreateDisabled,setBusy]=useState(false);
 const L=(zh,en)=>zh,lightCanvas=true,canFeature=()=>true,spawnNode=kind=>window.calls.push(kind);
 window.openMenu=(x,y,ro=false,busy=false)=>{setReadOnly(ro);setBusy(busy);setSpawnMenu({cx:x,cy:y,sourceId:'scene-source'})};
 return <main style={{height:'100vh',background:'#f3f4f6',padding:32}}><h2>画布节点引用</h2>{spawnMenu&&(${jsx})}</main>};window.calls=[];createRoot(document.getElementById('root')).render(<App/>);`;
 const bundle=await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const config=require('tailwindcss/loadConfig')(path.resolve('tailwind.config.ts'));
 const css=await require('postcss')([require('tailwindcss')({...config,content:[{raw:entry+surface,extension:'tsx'}]})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});
 fs.mkdirSync(out,{recursive:true});const html=path.join(out,'menu.html');fs.writeFileSync(html,`<!doctype html><meta charset="utf-8"><style>${css.css}</style><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1100,height:720}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(pathToFileURL(html).href);await page.waitForFunction(()=>window.openMenu);
 await page.evaluate(()=>window.openMenu(1040,650));const menu=page.getByRole('menu');await menu.waitFor();
 assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),['角色','场景','3D 导演台','文本','图片','视频','音频','多轨编辑器']);
 await menu.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));await page.screenshot({path:path.join(out,'desktop.png')});
 for(const [label,kind]of [['角色','character'],['场景','scene'],['3D 导演台','director'],['文本','text'],['图片','image'],['视频','video'],['音频','audio'],['多轨编辑器','timeline']]){
  await page.evaluate(()=>window.openMenu(100,100));await page.getByRole('menuitem',{name:label,exact:true}).click();assert.equal(await menu.count(),0);assert.equal(await page.evaluate(()=>window.calls.at(-1)),kind);
 }
 await page.evaluate(()=>window.openMenu(100,100,false,true));assert.equal(await page.getByRole('menuitem',{name:'视频',exact:true}).isDisabled(),true);
 await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'多轨编辑器');await page.keyboard.press('Escape');assert.equal(await menu.count(),0);
 await page.evaluate(()=>window.openMenu(100,100,true));await require('@playwright/test').expect(menu.locator('button:disabled')).toHaveCount(8);await page.keyboard.press('Escape');
 await page.setViewportSize({width:320,height:240});await page.evaluate(()=>window.openMenu(315,235));await menu.waitFor();await menu.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));const box=await menu.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=320&&box.y+box.height<=240);
 await page.screenshot({path:path.join(out,'small.png')});await page.getByRole('menuitem',{name:'多轨编辑器',exact:true}).click();assert.equal(await menu.count(),0);
 assert.deepEqual(errors,[]);console.log('BROWSER PASS: actual spawn JSX, eight actions, permissions, keyboard, 320x240 scroll; page errors 0');
 }finally{await browser.close();}
}
(async()=>{await behavior();if(process.argv.includes('--browser'))await browser();console.log(`CANVAS_REFERENCE_CREATION=PASS CASES=${cases} DB=0 SUPPLIER=0`);})().catch(e=>{console.error(e);process.exitCode=1;});
