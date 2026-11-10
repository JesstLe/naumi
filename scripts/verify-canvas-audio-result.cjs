'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),esbuild=require('esbuild');
const compiled=esbuild.buildSync({stdin:{contents:"export {createCanvasAudioActions} from './src/lib/canvas/audio-actions';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};vm.runInThisContext('(function(module,exports,require){'+compiled.outputFiles[0].text+'\n})')(mod,mod.exports,require);
function fixture(){
 const state={live:true,writable:true,saves:[],history:[],opened:[],renders:0};
 const scope={key:'actor/workspace/project',account:'actor',workspace:'workspace',project:'project',assertView(){if(!state.live)throw Error('retired');},viewCurrent:()=>state.live,documentCurrent:()=>true};
 const ports={writable:()=>state.writable,settingsReady:()=>true,locked:()=>false,
  store:{getNode(){},flush:async()=>{},save:async(id,patch)=>{state.saves.push({id,patch});if(state.save)return state.save(id,patch);return {id,...patch,revision:1};},render:async()=>{state.renders++;}},
  location:()=>({projectKey:'project',x:10,y:20}),created:n=>state.opened.push(n),history:a=>state.history.push(a),upload:async()=>[],merge:async()=>[],jobs:[],refresh:async()=>{},notice(){}};
 return {state,owner:mod.exports.createCanvasAudioActions().bind(scope,ports)};
}
(async()=>{
 let checks=0;const source={artworkId:'source-audio',title:'录音.wav'};
 let f=fixture();await f.owner.create({x:0,y:0});assert.equal(f.state.saves[0].patch.audio.sourceArtworkId,null);checks++;
 f=fixture();await f.owner.create({x:0,y:0},source);assert.equal(f.state.saves[0].patch.audio.sourceArtworkId,source.artworkId);assert.equal(f.state.saves[0].patch.audio.adopted.artworkId,source.artworkId);assert.equal(f.state.history.length,1);assert.equal(f.state.renders,0);checks++;
 f=fixture();let release;f.state.save=(id,patch)=>new Promise(resolve=>release=()=>resolve({id,...patch,revision:1}));
 const first=f.owner.create({x:0,y:0},source),second=f.owner.create({x:0,y:0},source);assert.equal(f.state.saves.length,1);f.state.live=false;release();await Promise.all([first,second]);assert.equal(f.state.opened.length,0);assert.equal(f.state.history.length,1);checks++;
 f=fixture();f.state.writable=false;await assert.rejects(f.owner.create({x:0,y:0},source));assert.equal(f.state.saves.length,0);checks++;
 f=fixture();f.state.save=async()=>{throw Error('save failed')};await assert.rejects(f.owner.create({x:0,y:0},source));f.state.save=undefined;await f.owner.create({x:0,y:0},source);assert.equal(f.state.history.length,1);checks++;
 const file=fs.readFileSync('src/components/canvas/canvas-client.tsx','utf8'),ast=ts.createSourceFile('client.tsx',file,99,true,4);let entry;
 (function walk(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='editAudioResult')entry=node.getText(ast);ts.forEachChild(node,walk);})(ast);assert.ok(entry);
 const calls=[],ctx=vm.createContext({readOnly:false,user:{email:'actor'},nodeSettingsReady:true,isNodeLocked:()=>false,activeKey:'project',audioNodesStore:{nodes:[]},openAudioEditor:id=>calls.push(['open',id]),audioActions:{create:async(...args)=>calls.push(['create',...args])},centerScreen:()=>({x:80,y:90}),flashTip(){},L:zh=>zh});
 vm.runInContext(ts.transpileModule(entry,{compilerOptions:{target:9}}).outputText,ctx);
 const art={id:'source-audio',category:'audio',title:'录音.wav'};
 ctx.editAudioResult(art);await Promise.resolve();assert.equal(calls[0][2].artworkId,art.id);checks++;
 calls.length=0;ctx.audioNodesStore.nodes=[{id:'existing',projectKey:'project',audio:{sourceArtworkId:art.id}}];ctx.editAudioResult(art);assert.deepEqual(calls,[['open','existing']]);checks++;
 for(const gate of ['readOnly','nodeSettingsReady','locked','category']){
  calls.length=0;ctx.readOnly=gate==='readOnly';ctx.nodeSettingsReady=gate!=='nodeSettingsReady';ctx.isNodeLocked=()=>gate==='locked';ctx.editAudioResult({...art,category:gate==='category'?'main':'audio'});assert.equal(calls.length,0);checks++;
 }
 console.log(`AUDIO_RESULT=PASS CHECKS=${checks} SOURCE_PRESERVED=1 REUSES_EDITOR=1 SCOPED=1 PAID_CALLS=0`);
})().catch(error=>{console.error(error);process.exitCode=1;});
