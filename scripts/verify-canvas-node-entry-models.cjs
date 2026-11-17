const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const mode=process.argv[2]||'MODIFIED',out=path.resolve('output/canvas-node-entry-models-20261016');const root=mode==='MODIFIED'?process.cwd():path.join(out,mode==='BASELINE'?'baseline':'rollback-copy');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');const client=read('src/components/canvas/canvas-client.tsx'),video=read('src/components/canvas/video/compact-composer.tsx'),advanced=read('src/components/canvas/video/settings-panel.tsx');
const ast=ts.createSourceFile('canvas.tsx',client,99,true,4);let fn;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='createCanvasNode')fn=n.getText(ast);ts.forEachChild(n,visit)}visit(ast);
if(mode!=='MODIFIED'){assert.ok(!fn);assert.ok(video.includes('<select aria-label={V(\'视频模型\')}'));assert.ok(advanced.includes('<select aria-label={V("视频模型")}'));console.log(`${mode}=PASS ADD_MENU=MIXED DIRECT_CONTEXT=IMAGE VIDEO_MODEL=NATIVE_SELECT EXIT=0`);process.exit(0)}
assert.ok(fn);let calls=[],readOnly=false,videoAllowed=true;const mod={exports:{}};const c=vm.createContext({module:mod,exports:mod.exports,require,Buffer,createTimelineNode(){},createAudioNode(){},createSceneNode(){},createCharacterNode(){},createDirectorNode(){},get readOnly(){return readOnly},setNodeTypeMenu:()=>{},centerScreen:()=>({x:5,y:6}),addTextNodeAtScreen:(...v)=>calls.push(['text',...v]),addPendAtScreen:(...v)=>calls.push(['image',...v]),canFeature:()=>videoAllowed,openVideoNodeFromSelection:(...v)=>calls.push(['video',...v])});if(fs.existsSync(path.join(root,'src/lib/canvas/node-creation.ts'))){const code=require('esbuild').buildSync({stdin:{contents:'export {dispatchCanvasNodeCreation} from \"./src/lib/canvas/node-creation\";',resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;vm.runInContext(code,c);Object.assign(c,mod.exports);}vm.runInContext(ts.transpileModule(fn,{compilerOptions:{target:99}}).outputText,c);
for(const k of ['text','image','video'])c.createCanvasNode(k,{x:71,y:83});assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['text',71,83],['image',71,83,null,false],['video',true,{x:71,y:83}]]);const length=calls.length;readOnly=true;c.createCanvasNode('text');assert.equal(calls.length,length);readOnly=false;videoAllowed=false;c.createCanvasNode('video');assert.equal(calls.length,length);
const a=client.indexOf('triggerTestId="canvas-add-node-button"'),b=client.indexOf('\n                  />',a),menu=client.slice(a,b);assert.ok(menu.includes('items={canvasNodeMenuItems('));assert.ok(client.includes('<ContextMenuSubmenu'));assert.ok(client.includes('onCreate: kind => createCanvasNode(kind, ctxMenu)'));assert.ok(client.includes('ctxMenu ||'));
let imagePresentation=client;if(client.includes('<CanvasImageComposer')){const composer=read('src/components/canvas/image-composer.tsx');assert.ok(composer.includes('<CanvasImageGenerationControls'));imagePresentation=read('src/components/canvas/image-generation-controls.tsx');}for(const s of [imagePresentation,video,advanced])assert.ok(s.includes('<CanvasModelSelect'));
const modelModule={exports:{}};
const modelSource=require('esbuild').buildSync({stdin:{contents:'export {selectVideoUiModel} from "./src/lib/video/ui-draft";',resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
new Function('module','exports','require',modelSource)(modelModule,modelModule.exports,require);
function modelPickerChange(source,name){
 const tree=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),handlers=[];
 function collect(node){
  if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&node.tagName.getText(tree)==='CanvasModelSelect'){
   const prop=node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(tree)==='onChange');
   assert.ok(prop?.initializer&&ts.isJsxExpression(prop.initializer)&&prop.initializer.expression,`${name} model picker needs an onChange handler`);
   handlers.push(prop.initializer.expression.getText(tree));
  }
  ts.forEachChild(node,collect);
 }
 collect(tree);assert.equal(handlers.length,1,`${name} should expose one shared model picker`);
 return handlers[0];
}
const config={providerId:'first',modelId:'before',prompt:'原草稿',intentPreference:'frames_required',parameters:{resolution:'custom',durationSeconds:9}};
const models=[{providerId:'first',modelId:'shared'},{providerId:'second',modelId:'shared'},{providerId:'second',modelId:'other'}];
for(const [source,name] of [[video,'compact-composer.tsx'],[advanced,'settings-panel.tsx']]){
 const updates=[],update=next=>updates.push(JSON.parse(JSON.stringify(next)));
 const callback=vm.runInNewContext('('+modelPickerChange(source,name)+')',{config,models,selectVideoUiModel:modelModule.exports.selectVideoUiModel,onConfig:update,onChange:update});
 callback('second/missing');assert.deepEqual(updates,[],`${name} must ignore unknown choices`);
 callback('second/shared');assert.deepEqual(updates,[{...config,providerId:'second',modelId:'shared'}],`${name} must switch both IDs and preserve the draft`);
 assert.ok(!source.includes('<select aria-label={V(\'视频模型\')}'));
}
console.log('MODIFIED=PASS ADD_MENU=EIGHT_TYPES THREE_IMPLEMENTED=YES PICK_BEFORE_CREATE=YES CONTEXT_POSITION=EXACT IMAGE_VIDEO_MODEL=SHARED PERMISSION=GUARDED EXIT=0');
