const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),esbuild=require('esbuild');
const root=path.resolve(process.argv[2]||'.');
function bundled(file){const result=esbuild.buildSync({entryPoints:[path.join(root,file)],bundle:true,platform:'node',format:'cjs',write:false});const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports}
const params=bundled('src/lib/canvas/generation-parameters.ts');
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas-client.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let node;
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='privateFetch')node=n;ts.forEachChild(n,visit)}visit(ast);assert.ok(node);
const code=ts.transpileModule('('+node.getText(ast)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
 let captured;const context={...params,Headers,FormData,Request,Response,ImagegenPreparationCancelled:Error,currentWorkspace:()=> 'personal',activeProjectRef:{current:{key:'tree:source'}},active:{members:[{id:'source',width:1200,height:1600,ratio:'1:1',resolution:'1K'}]},user:{email:'fixture@example.test'},canvasToolQualities:{},genQuality:'medium',genModel:'image-a',authHeader:async()=>({}),adminConfiguredFeature:()=>false,featureModelManaged:()=>false,billing:{quoteAndSubmit:async(url,init,facts,assertCurrent)=>{assertCurrent();captured={url,body:init.body instanceof FormData?Object.fromEntries(init.body):JSON.parse(init.body),facts};return Response.json({ok:true})}}};
 let run;
 if(fs.existsSync(path.join(root,'src/lib/canvas/creation-request.ts'))){
  const result=esbuild.buildSync({entryPoints:[path.join(root,'src/lib/canvas/creation-request.ts')],bundle:true,platform:'node',format:'cjs',write:false,external:['../supabase','../model-config/selection-policy','../model-config/feature-client','../imagegen/canvas-client']});
  const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(id=>id==='../supabase'?{authHeader:context.authHeader}:id==='../model-config/selection-policy'?{adminConfiguredFeature:context.adminConfiguredFeature}:id==='../model-config/feature-client'?{featureModelManaged:context.featureModelManaged}:id==='../imagegen/canvas-client'?{}:require(id),module,module.exports);
  const scope={owner:context.user.email,project:'tree:source',workspace:'personal',isCurrent:()=>true,assertCurrent:()=>{}};
  run=(url,init)=>module.exports.submitCanvasCreationRequest(url,init,{scope,authenticated:true,sources:context.active.members,model:context.genModel,quality:context.genQuality,toolQualities:{}},{billing:context.billing});
 }else run=vm.runInNewContext(code,context);let checks=0;
 for(const route of ['/api/canvas/annotate','/api/canvas/text-edit','/api/canvas/image-tasks']){
  const json={artworkId:'source',quality:'medium'};let body=JSON.stringify(json);if(route.endsWith('annotate')){body=new FormData();Object.entries(json).forEach(([k,v])=>body.set(k,v))}
  await run(route,{method:'POST',body});assert.equal(captured.body.ratio,'3:4');assert.equal(captured.facts.ratio,'3:4');assert.equal(captured.facts.resolution,'1K');checks++;
 }
 await run('/api/canvas/expand',{method:'POST',body:JSON.stringify({artworkId:'source',ratio:'16:9'})});assert.equal(captured.body.ratio,'16:9');assert.equal(captured.facts.ratio,'16:9');checks++;
 assert.equal(params.canvasSourceFrameRatio({width:1200,height:1600,ratio:'1:1'}),'3:4');checks++;
 assert.equal(params.canvasSourceFrameRatio({ratio:'9:16'}),'9:16');checks++;
 assert.equal(params.canvasSourceFrameRatio({}), 'auto');checks++;
 assert.equal(params.canvasSourceFrameEdit('/api/generate-image'),false);checks++;
 assert.equal(params.canvasSourceFrameEdit('/api/canvas/expand'),false);checks++;
 console.log(`EDIT_FRAME_CONTRACT=PASS CASES=${checks} QUOTE_RATIO=3:4 EXPAND_RATIO=16:9`);
})().catch(e=>{console.error(e);process.exitCode=1});
