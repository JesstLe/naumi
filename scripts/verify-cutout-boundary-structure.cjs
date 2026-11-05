// Bounded structural contract checks; behavior is covered by the PG entry verifier.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const baseline=process.argv.includes('--baseline'),root=process.cwd();let checks=0;
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const adapter=read('src/lib/imagegen/adapters.ts');
check(/app\/api\/cutout\/route/.test(adapter),baseline,'Only the baseline imports its HTTP route from imagegen');
check(fs.existsSync('src/lib/imagegen/legacy-cutout-request.ts'),baseline,'Legacy cookie/FormData bridge is deleted, not dormant');
if(!baseline){
  const op=read('src/lib/imagegen/cutout-operation.ts'),billing=read('src/lib/billing/synchronous-operation.ts'),http=read('src/lib/billing/synchronous.ts');
  check(/new (Request|FormData)|signUserSession|app\/api/.test(op),false,'Cutout has no internal HTTP serialization');
  check(/new (Request|Response)|request\.(headers|url)|\.formData\(/.test(billing),false,'Billing operation owns no HTTP parsing/rendering');
  check(http.includes('withSynchronousOperation'),true,'Existing HTTP tools share billing implementation');
  check(http.includes('if(result===projected&&originalResponse)return originalResponse'),true,'HTTP retains response identity and headers');
  check(read('src/app/api/cutout/route.ts').includes('executeCutout(input,'),true,'Public cutout uses shared execution');
  check(read('src/app/api/generate-image/route.ts').includes('readGeneration('),true,'HTTP polling delegates shared read use case');
  const parent=process.argv.indexOf('--original-root'),oldRoot=parent>=0?path.resolve(process.argv[parent+1]):path.resolve('output/refactor-r1a2-20261024/baseline-tree');
  const print=ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed});
  function fn(source,name){const sf=ts.createSourceFile('fixture.ts',source.replace(/\r\n/g,'\n'),ts.ScriptTarget.Latest,true),n=sf.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name);assert(n,name);return print.printNode(ts.EmitHint.Unspecified,ts.factory.updateFunctionDeclaration(n,n.modifiers?.filter(m=>m.kind!==ts.SyntaxKind.ExportKeyword),n.asteriskToken,n.name,n.typeParameters,n.parameters,n.type,n.body),sf);}
  const old=fs.readFileSync(path.join(oldRoot,'src/app/api/cutout/route.ts'),'utf8'),provider=read('src/lib/imagegen/cutout-provider.ts');
  for(const name of ['loadSharp','resolveReplicateVersion','cutoutReplicate','cutoutOpenAI'])check(fn(provider,name),fn(old,name),name+' moved unchanged');
  const oldBilling=fs.readFileSync(path.join(oldRoot,'src/lib/billing/synchronous.ts'),'utf8');
  for(const name of ['recordBillingUsage','markBillingUpstream','settleSynchronous','configuredToolCost','synchronousChargedCredits','completeSynchronousStream','failSynchronousStream','exposeAbandonedBillingOperations'])check(fn(billing,name),fn(oldBilling,name),name+' moved unchanged');
  check(fn(http,'billingRequestIdentity'),fn(oldBilling,'billingRequestIdentity'),'HTTP fingerprint parser unchanged');
}
console.log(`CUTOUT_BOUNDARY_STRUCTURE=${baseline?'BASELINE':'MODIFIED'} PASS checks=${checks} INTERNAL_CUTOUT_HTTP=${baseline?1:0} DUPLICATED_BILLING_IMPLEMENTATIONS=0`);
