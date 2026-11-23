const ts=require('typescript');

/** Run the actual page save command. Other Canvas document owners are idle in
 * these video-only fixtures; their persistence is verified separately. */
function canvasSaveStatusJsx(source,legacy){return source.includes('<CanvasSaveStatus')?`<CanvasSaveStatus items={videoNodesStore.getSnapshot().saveItems||[]} project={scope.project} names={{}} onRetry={()=>saveCanvasChanges()} onLocate={()=>{}} onCopy={async()=>{}} onDiscard={async()=>{}}/><button aria-label="canvas.retrySave" data-testid="canvas-save-button" disabled={manualSaving} onClick={()=>void saveCanvasChanges()}>保存</button>`:legacy;}
function canvasSaveBrowserBinding(source,alert){
 if(!source.includes('<CanvasSaveStatus')&&!alert.includes('saveCanvasChanges'))return {imports:'',setup:''};
 const ast=ts.createSourceFile('canvas.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let caller;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='saveCanvasChanges')caller=node.getText(ast);ts.forEachChild(node,visit);}
 visit(ast);
 if(!caller)throw Error('Canvas save button has no page command');
 return {imports:`import {useState} from 'react';import {CanvasSaveStatus} from './src/components/canvas/canvas-save-status';import {projectSaveItems} from './src/lib/canvas/save-status';import {createCanvasSaveCommand} from './src/lib/canvas/save-command';import {canvasHistoryFailureMessage} from './src/lib/canvas/history-scope';`,setup:`
 const L=(zh)=>zh,readOnly=options.readOnly,user=options.email?{email:options.email}:null,browsing=false,idle=async()=>{};
 const flushProjectText=idle,currentSaveItems=()=>videoNodesStore.getSnapshot().saveItems||[],textAutosave={flushAll:idle},canvasHistory={scope,retry:idle},flushImagePrompts=idle;
 Object.assign(canvasTextDocument,{getSnapshot:()=>({unsaved:0})});
 const directorNodesStore={flush:idle,retryPending:idle},characterNodesStore={flush:idle,retryPending:idle},sceneNodesStore={flush:idle,retryPending:idle},audioNodesStore={flush:idle,retryPending:idle},timelineNodesStore={flush:idle,retryPending:idle},comfyNodesStore={flush:idle,retryPending:idle};
 const saveCommand=useRef(createCanvasSaveCommand()),[manualSaving,setManualSaving]=useState(false);
 ${caller}`};
}
module.exports={canvasSaveBrowserBinding,canvasSaveStatusJsx};
