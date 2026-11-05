// Source-bound R1A1 checks. Real PG execution is covered by verify-imagegen-execution.ts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{build}=require('esbuild'),{createHash}=require('node:crypto');
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1]},root=path.resolve(arg('--source-root')||'.'),baseline=path.resolve(arg('--baseline-root')||'output/refactor-r1a-20261024/baseline-tree');
const read=(r,f)=>fs.readFileSync(path.join(r,f),'utf8');
let checks=0;const check=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const node=(source,name)=>{const ast=ts.createSourceFile('source.ts',source,99,true);const n=ast.statements.find(n=>n.name?.text===name||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));assert(n,name);return n.getText(ast).replace(/^export /,'')};
const normalized=text=>ts.createPrinter({removeComments:true}).printFile(ts.createSourceFile('fn.ts',text,99,true)).replace(/^export /,'');
async function loadCore(sourceRoot,state){
 const fake={
  'server-only':'',
  '../native-auth':'export const USER_COOKIE="session";export const signUserSession=()=>"fixture";',
  '../model-config/accepted-context':'export const signAcceptedModelContext=async()=>"fixture-accepted";',
  './inputs':'export const readImagegenInputs=async()=>__fixture.inputs;',
  '../db':'export const dbEnabled=true;export const listArtworksByIds=async()=>__fixture.works;export const getPool=()=>({query:async()=>({rows:[{project_key:"tree:text-project"}]})});',
  '../saas/creation-context':'export const currentCreationContext=()=>undefined;export const assertCreationProjectInput=async()=>{};',
  './prompt':'export const compileImagegenPrompt=req=>req.prompt;',
  './context':'export const withImagegenStep=async(_r,_i,run)=>run();',
  './generation-operation':'export const submitGenerationOperation=async command=>{__fixture.command=command;return {status:200,body:{jobId:"captured"}}};',
  '../../app/api/generate-image/route':'export const POST=async req=>{__fixture.request=req;return Response.json({jobId:"captured"})};'
 };
 const built=await build({entryPoints:[path.join(sourceRoot,'src/lib/imagegen/generation-core.ts')],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'boundary-fixture',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(fake,a.path)?{path:a.path,namespace:'fixture'}:null);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fake[a.path],loader:'ts'}));}}]});
 const m={exports:{}};vm.runInNewContext(built.outputFiles[0].text,{module:m,exports:m.exports,require,console,Buffer,Request,Response,Headers,File,FormData,Blob,URL,structuredClone,__fixture:state});return m.exports;
}
async function main(){
 const legacyRoute=read(baseline,'src/app/api/generate-image/route.ts'),coreSource=read(root,'src/lib/imagegen/generation-core.ts'),modified=fs.existsSync(path.join(root,'src/lib/imagegen/generation-operation.ts'));
 const parser=ts.transpileModule(['parseIds','parseCount','parseDimension','parseParams'].map(n=>node(legacyRoute,n)).join('\n')+'\nmodule.exports=parseParams;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(parser,{module:m,exports:m.exports,Buffer,File,FormData,currentImagegenStep:()=>({}),MAX_IMAGES:16,provenanceEntry:v=>v});
 const parse=m.exports;
 const fingerprint=async req=>{
  const form=await req.clone().formData();const fields=[];
  for(const [k,v]of [...form].sort(([a],[b])=>a.localeCompare(b)))fields.push([k,typeof v==='string'?v:{name:v.name,type:v.type,size:v.size,sha256:createHash('sha256').update(Buffer.from(await v.arrayBuffer())).digest('hex')}]);
  return createHash('sha256').update(JSON.stringify([new URL(req.url).pathname,req.headers.get('x-naumi-image-quality'),req.headers.get('x-naumi-text-model'),req.headers.get('x-naumi-feature-model'),fields])).digest('hex');
 };
 for(const scenario of ['text','reference','mask','text-project','exact','missing-model']){
  const input=(id,role)=>({artworkId:id,role,mimeType:'image/png',buffer:Buffer.from('fixture-'+id),width:1024,height:1024});
  const inputs=scenario==='reference'?[input('art-a','reference'),input('asset-b','style')]:scenario==='mask'?[input('art-a','edit-target'),input('asset-mask','mask')]:[];
  const request={operationId:'12345678-1234-4234-a234-123456789012',entry:'canvas',mode:scenario==='mask'?'edit':'generate',prompt:' A fixture prompt\nwith a line\r\nand another ',variants:2,inputs:inputs.map(({artworkId,role})=>({artworkId,role})),parameters:{quality:'medium',resolution:'1K',ratio:'3:4',...(scenario==='exact'?{width:768,height:1024}:{})},output:{},...(scenario==='text-project'?{sourceNodeId:'text-anchor'}:{})};
  const plan={request,intent:{operation:'generate',background:null,requirements:[]},modelVersion:12,billingVersion:6,steps:[{key:'generate',operation:'generate',modelId:scenario==='missing-model'?undefined:'image-a',credits:12,parameters:{}}]};
  const old={inputs,works:[{id:'art-a',groupId:'group-A'}]},current={inputs,works:old.works};
  await(await loadCore(baseline,old)).submitGenerationCore(plan,'generate','fixture@example.test');
  const result=await(await loadCore(root,current)).submitGenerationCore(plan,'generate','fixture@example.test');
  if(modified){
   const c=current.command,fields=Object.entries(c.fields);
   for(const f of c.files)fields.push([f.field,{name:f.name,type:f.mimeType,size:f.buffer.length,sha256:createHash('sha256').update(f.buffer).digest('hex')}]);
   fields.sort(([a],[b])=>a.localeCompare(b));
   const identity=require(path.join(process.cwd(),'node_modules/typescript'));
   const code=identity.transpileModule(read(root,'src/lib/billing/submission-identity.ts'),{compilerOptions:{module:identity.ModuleKind.CommonJS}}).outputText;
   const x={exports:{}};vm.runInNewContext(code,{module:x,exports:x.exports,require});
   check(x.exports.submissionFingerprint('/api/generate-image',null,null,plan.steps[0].modelId||'',fields),await fingerprint(old.request),scenario+' legacy intent identity');
   const p=await parse(old.request.clone());p.email='fixture@example.test';
   check(JSON.parse(JSON.stringify(c.parameters)),JSON.parse(JSON.stringify(p)),scenario+' actual legacy parser equals typed parameters');
   check(result.status,200,scenario+' typed status');check(typeof result.json,'undefined',scenario+' no Response parsing');
  }else check(await fingerprint(current.request),await fingerprint(old.request),scenario+' baseline original fingerprint');
 }
 if(modified){
  check(/new (Request|FormData)|signUserSession|app\/api/.test(coreSource),false,'generation core has no HTTP bridge');
  const groups={'generation-provider.ts':['sizeFor','mockImages','openaiImages','newApiFlowImages','normalizeForEdit'],'generation-output.ts':['enforceOutputShape','attachImageDimensions','upscaleImages','persistToStorage'],'generation-runtime.ts':['runJob','kickGeneration'],'generation-prompt.ts':['buildPrompt','ratioPrompt']};
  const shared=fs.existsSync(path.join(root,'src/lib/imagegen/complete-image-delivery.ts'));
  if(shared){delete groups['generation-output.ts'];delete groups['generation-runtime.ts'];check(read(root,'src/lib/imagegen/generation-runtime.ts').includes('await completeImageDelivery('),true,'runtime invokes shared delivery');check(read(root,'src/lib/imagegen/stored-delivery.ts').includes('await completeImageDelivery('),true,'recovery invokes shared delivery');}
  for(const [file,names]of Object.entries(groups))for(const name of names)check(normalized(node(read(root,'src/lib/imagegen/'+file),name)),normalized(node(legacyRoute,name)),name+' moved without semantic edits');
  check(coreSource.includes('submitGenerationOperation'),true,'core invokes typed application');
  check(read(root,'src/app/api/generate-image/route.ts').includes('submitGeneration(input,'),true,'HTTP invokes same submission');
  check(read(root,'src/lib/imagegen/dispatch.ts').includes('body=response.body'),true,'parent consumes typed result');
 }
 console.log(`IMAGE_GENERATION_BOUNDARY=${modified?'MODIFIED_PASS':'BASELINE_PASS'} checks=${checks} scenarios=6 legacy_fingerprint=equal parser_parameters=${modified?'equal':'original'} copied_runtime=${modified?(fs.existsSync(path.join(root,'src/lib/imagegen/complete-image-delivery.ts'))?'provider-prompt-identical-delivery-shared':'13-functions-identical'):'original'} HTTP=0 PG=0 SUPPLIER=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
