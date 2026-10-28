// Executes the actual primary-action function extracted from the selected tree.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'.'),mode=process.argv[3]||'modified';
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');
const ast=ts.createSourceFile('canvas-client.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let method;
function visit(node){if(ts.isFunctionDeclaration(node)&&['generateSelectedImage','generateChild'].includes(node.name?.text))method=node;ts.forEachChild(node,visit)}visit(ast);assert.ok(method);
const code=ts.transpileModule('('+method.getText(ast)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
 const selected={id:'original-node',prompt:'橙色小熊趴在窗台',image:'/media/original.png',canvasX:120,canvasY:80};
 let last;const context={selected,dockReferenceState:{error:''},referenceError:'',visibleDockRefs:[],extraFiles:[],MAX_TOTAL_IMAGES:16,generationMode:'standard',editPrompt:selected.prompt,genRatio:'auto',genStyle:'',genCount:1,genResolution:'1K',composerReferences:[],inheritableImagePrompt:x=>x,FAITHFUL_REGEN_PROMPT:'保持主体',setGenError:e=>{throw Error(e)},runGen:async(node,prompt,options)=>{last={node,prompt,options};return[]},VIEW_CONSISTENCY_RULES:'保持主体',renameGeneratedArtwork:async()=>{}};
 await vm.runInNewContext(code,context)();assert.equal(last.node.id,selected.id);assert.equal(last.prompt,selected.prompt);
 const same=last.options.replaceNode===true,count=same?1:2;
 assert.equal(same,mode!=='baseline');assert.equal(last.options.referenceInputs.length,0);
 if(mode!=='baseline'){
  context.generationMode='triptych';await vm.runInNewContext(code,context)();assert.notEqual(last.options.replaceNode,true);assert.equal(last.options.parentId,selected.id);
  assert.match(source,/canvasTargetRevision/);assert.match(source,/n\.data\.regenerating/);assert.match(source,/ImageVersionControl/);
 }
 console.log(`${mode.toUpperCase()}=${same?'PASS':'REPRODUCED'} sameNode=${same} nodes=${count} explicitDerivation=${mode==='baseline'?'not-tested':'preserved'}`);
})().catch(e=>{console.error(e);process.exitCode=1});
