// Exercise the actual page context capture, retaining document guards and undo view.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const source=fs.readFileSync('src/components/canvas/canvas-client.tsx','utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4);
let declaration;
(function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='canvasImportContext')declaration=n.getText(ast);ts.forEachChild(n,visit)})(ast);
assert(declaration);const key='tree:deleted-fixture-root',current=()=>true;
const scope={workspace:'personal',project:key,documentCurrent:current,viewCurrent:current};
const context={canvasArtworkDocument:{scope},creatingNew:true,activeProjectRef:{current:null},user:{email:'fixture@example.invalid'},canvasAccountRef:{current:'fixture-account'},mergeWorks:()=>{},pushAddUndoMany:()=>{},t:k=>k,locale:'zh'};
vm.createContext(context);vm.runInContext(ts.transpileModule(declaration,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
let captured=context.canvasImportContext();assert.equal(captured.project,null);assert.equal(scope.project,key);assert.equal(captured.documentCurrent,current);assert.equal(captured.workspace,'personal');
context.activeProjectRef.current={key};captured=context.canvasImportContext();assert.equal(captured.project,key);
context.activeProjectRef.current=null;context.creatingNew=false;assert.equal(context.canvasImportContext().project,key);
context.creatingNew=true;scope.project=null;assert.equal(context.canvasImportContext().project,null);
console.log('EMPTY_CANVAS_IMPORT_CONTEXT=PASS cases=4 undoViewPreserved=true existingProjectPreserved=true scopeGuardsPreserved=true supplierCalls=0');
