const ts=require('typescript');

/** Run the actual page save command. Other Canvas document owners are idle in
 * these video-only fixtures; their persistence is verified separately. */
function canvasSaveBrowserBinding(source,alert){
 if(!alert.includes('saveCanvasChanges'))return {imports:'',setup:''};
 const ast=ts.createSourceFile('canvas.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let caller;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='saveCanvasChanges')caller=node.getText(ast);ts.forEachChild(node,visit);}
 visit(ast);
 if(!caller)throw Error('Canvas save button has no page command');
 return {imports:`import {useState} from 'react';import {createCanvasSaveCommand} from './src/lib/canvas/save-command';import {canvasHistoryFailureMessage} from './src/lib/canvas/history-scope';`,setup:`
 const L=(zh)=>zh,readOnly=options.readOnly,user=options.email?{email:options.email}:null,browsing=false,idle=async()=>{};
 const textAutosave={flushAll:idle},canvasHistory={scope,retry:idle},flushImagePrompts=idle;
 Object.assign(canvasTextDocument,{getSnapshot:()=>({unsaved:0})});
 const directorNodesStore={flush:idle},characterNodesStore={flush:idle},sceneNodesStore={flush:idle},audioNodesStore={flush:idle},timelineNodesStore={flush:idle},comfyNodesStore={flush:idle};
 const saveCommand=useRef(createCanvasSaveCommand()),[manualSaving,setManualSaving]=useState(false);
 ${caller}`};
}
module.exports={canvasSaveBrowserBinding};
