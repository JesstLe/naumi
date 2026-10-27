// Run the real paste handler against a persistent orb and a modal, not a regex-only contract.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=path.resolve(process.argv[2]||'.'),baseline=process.argv.includes('--baseline');
const source=readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');
const modular=source.includes('useCanvasClipboard');
const handlerSource=modular?readFileSync(path.join(root,'src/components/canvas/use-canvas-clipboard.ts'),'utf8'):source;
const ast=ts.createSourceFile('canvas-client.tsx',handlerSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===(modular?'pasteEvent':'handleCanvasPaste'))handler=n;ts.forEachChild(n,visit);}visit(ast);
assert.ok(handler);
class Element {closest(){return null;}}
let modal=false,editable=false,imports=0,prevented=false;
const context={Element,ready:true,user:{email:'fixture@local'},readOnly:false,browsing:false,loading:false,canvasShortcutLayerOpen:false,
  document:{querySelector:selector=>modal?{}:selector.includes(':not(button)')?{persistentOrb:true}:null},
  CANVAS_MODAL_SELECTOR:'.fixed.inset-0, [data-canvas-hotkeys-blocked="true"][aria-modal="true"]',
  canvasAreaRef:{current:{getBoundingClientRect:()=>({left:0,top:0,width:1200,height:800})}},
  rfRef:{current:{screenToFlowPosition:point=>point}},isEditableClipboardTarget:()=>editable,
  workflowPaste:{paste:()=>{imports++;return true;}},clipboardImageFiles:()=>[],nodeClipRef:{current:null},};
if(modular){context.session={current:{owner:'fixture@local',artwork:null}};context.readSelection=()=>null;context.latest={current:{state:()=>({ready:context.ready,readOnly:context.readOnly,browsing:context.browsing,loading:context.loading,blocked:context.canvasShortcutLayerOpen}),center:()=>({x:600,y:400}),workflow:context.workflowPaste.paste}};}
vm.createContext(context);vm.runInContext(ts.transpileModule(handler.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
const paste=()=>context[modular?'pasteEvent':'handleCanvasPaste']({target:new Element(),clipboardData:{getData:()=>'<span data-app="editor-next"></span>'},preventDefault:()=>{prevented=true;}});
paste();
if(baseline){assert.equal(imports,0);assert.equal(prevented,false);console.log('BASELINE=BUG WORKFLOW_PASTE=BLOCKED_BY_PERSISTENT_ORB IMPORT_CALLS=0');process.exit(0);}
assert.equal(imports,1);assert.equal(prevented,true);
modal=true;paste();modal=false;editable=true;paste();editable=false;
context.readOnly=true;paste();context.readOnly=false;context.browsing=true;paste();
assert.equal(imports,1);
console.log('MODIFIED=PASS WORKFLOW_PASTE=READY_WITH_ORB IMPORT_CALLS=1 MODAL_INPUT_READONLY_BROWSING=GUARDED');
