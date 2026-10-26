const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript'), sharp = require('sharp');
const rootIndex = process.argv.indexOf('--source-root');
const root = path.resolve(rootIndex >= 0 ? process.argv[rootIndex + 1] : '.');
let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
function load(rel, deps = {}) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,
    {exports, Buffer, Response, Request, Headers, AbortSignal, URL, Error, console,
      require(id) { if (id === 'server-only') return {}; if (id in deps) return deps[id]; throw Error('unexpected dependency: '+id); }}, {filename:rel});
  return exports;
}
(async () => {
  const evidence = load('src/lib/imagegen/failure-evidence.ts');
  const sentinel = 'sk-private https://signed.invalid/image?token=private prompt-private';
  const cause = new RangeError('Maximum call stack size exceeded '+sentinel);
  const e = new Error(sentinel, {cause}); e.name = sentinel; e.code = sentinel;
  const result = evidence.imageFailureEvidence(e);
  check(result.causes[0].name === 'Error' && result.causes[0].code === undefined, 'unknown fields omitted');
  check(result.causes[1].name === 'RangeError' && result.causes[1].kind === 'stack-limit', 'fixed kind preserves cause');
  check(!JSON.stringify(result).includes('private'), 'no raw message/url/code/name leak');
  e.cause = e; check(evidence.imageFailureEvidence(e).causes.length === 1, 'cyclic cause bounded');
  const chain = new Error('root'); let curr = chain; for (let i=0;i<10;i++) { curr.cause = new Error('next'); curr=curr.cause; }
  check(evidence.imageFailureEvidence(chain).causes.length === 4, 'depth bounded');
  const hostile = Object.defineProperty({}, 'name', {get(){throw cause;}});
  check(evidence.imageFailureEvidence(hostile).causes.length === 0, 'getter never masks exception');
  const ioFile = 'src/lib/supplier-cost/io.ts', ioSource = fs.readFileSync(path.join(root,ioFile),'utf8');
  const ast = ts.createSourceFile(ioFile,ioSource,ts.ScriptTarget.Latest,true);
  const fn = ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='readBoundedBytes');
  const ioExports = {}; vm.runInNewContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:ioExports,Buffer,Error});
  const validator = load('src/lib/model-config/channel-image-response.ts', {sharp,'../supplier-cost/io':ioExports,'./transport':{modelEndpointFetch(){throw Error('network forbidden');}}});
  const png = await sharp({create:{width:3,height:4,channels:3,background:'#ffffff'}}).png().toBuffer();
  const response = await validator.completedChannelImage(Response.json({data:[{b64_json:png.toString('base64')}]}),AbortSignal.timeout(5000),{});
  check(response.status === 200, 'real image passes');
  check(await validator.completedChannelImage(response,AbortSignal.timeout(5000),{}) === response, 'accepted response idempotent');
  const alreadyDecoded=validator.validatedChannelImageResponse(Response.json({data:[{b64_json:png.toString('base64')}]}));
  check(await validator.completedChannelImage(alreadyDecoded,AbortSignal.timeout(5000),{})===alreadyDecoded && !alreadyDecoded.bodyUsed,'adapter-validated response avoids duplicate body parse/decode');
  const adapter=fs.readFileSync(path.join(root,'src/lib/model-config/apimart-preset.ts'),'utf8');
  check(adapter.indexOf('await sharp(bytes,{failOn:"error"')<adapter.indexOf('return validatedChannelImageResponse(')&&adapter.indexOf('if(!data.length)throw')<adapter.indexOf('return validatedChannelImageResponse('),'trusted marker only after actual adapter decoding and nonempty data');
  const payloadStart=adapter.indexOf('const payload=JSON.stringify({created:');
  const payloadEnd=adapter.indexOf('\n        }',payloadStart);
  assert.ok(payloadStart>0&&payloadEnd>payloadStart);
  const build=vm.runInNewContext('(data,receipt)=>{'+adapter.slice(payloadStart,payloadEnd)+'}',{Buffer,Response,Date,Math,Error,validatedChannelImageResponse:validator.validatedChannelImageResponse});
  const built=build([{b64_json:png.toString('base64')}],{usage:null});
  check((await built.json()).data.length===1,'actual adapter response builder preserves JSON');
  assert.throws(()=>build([{b64_json:'A'.repeat(48*1024*1024)}],{usage:null}),/receipt too large/);checks++;
  for (const [response,stage] of [[new Response('{'),'parse-response'],[Response.json({data:[]}), 'validate-envelope'],[Response.json({data:[{b64_json:Buffer.from('bad-image').toString('base64')}]}),'decode-pixels'],[Response.json({data:[{url:'not a url'}]}),'parse-image-url']]) {
    let caught; try {await validator.completedChannelImage(response,AbortSignal.timeout(5000),{});}catch(err){caught=err;}
    check(!!caught && validator.channelImageFailureStage(caught)===stage, 'precise fixed stage '+stage);
  }
  const consumed=Response.json({data:[]}); await consumed.text(); let bodyError;
  try{await validator.completedChannelImage(consumed,AbortSignal.timeout(5000),{});}catch(err){bodyError=err;}
  check(validator.channelImageFailureStage(bodyError)==='read-response','consumed body stage');
  const logs=[],observations=[],original=Error(sentinel); let validations=0;
  const fakeConsole={...console,error(...v){logs.push(v);}};
  const rel='src/lib/model-health/observe.ts', source=fs.readFileSync(path.join(root,rel),'utf8'),exports={};
  const scope={frozen:{feature:'canvas.image',modality:'image',modelVersion:141},connection:{providerId:'fixture',credentialRef:'fixture'}};
  const deps={'@/platform/db/pool':{dbEnabled:true,getPool:()=>({})},'../model-config/channel-image-response':{completedChannelImage:async()=>{validations++;throw original},channelImageFailureStage:()=> 'decode-base64'},
    '../model-config/types':{ModelConfigError:class extends Error{}},'../image-gateway':{ImageOperationDeferred:class extends Error{},currentImageOperationId:()=> 'job-fixture:image:0'},
    '../imagegen/failure-evidence':evidence,'../model-config/channel-text-response':{},'./repository':{createHealthRepository:()=>({observe:async(t,r)=>observations.push(r)})},'./targets':{healthTargetKey:()=> 'fixture'},'./outcomes':{classifyHealthFailure:()=>({success:false,reason:'network',status:200})}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Request,Response,URL,console:fakeConsole,require(id){if(id==='server-only')return {};if(id in deps)return deps[id];throw Error('unexpected dependency '+id)}});
  let caught;try {await exports.healthObservedFetch(scope,async()=>Response.json({data:[]}),{})('https://fixture.invalid/v1/images/generations',{method:'POST',body:'{}'});}catch(err){caught=err;}
  check(caught===original,'original error identity preserved');
  check(logs.length===1&&validations===1&&observations.length===1,'one log and original health observation');
  check(logs[0][0]==='[image-postaccept]'&&JSON.parse(logs[0][1]).stage==='decode-base64','internal stage recorded');
  check(!JSON.stringify(logs).includes('private'),'no private error message logged');
  check(observations[0].reason==='network','health contract unchanged');
  fakeConsole.error=()=>{throw Error('logging-down')};caught=undefined;
  try{await exports.healthObservedFetch(scope,async()=>Response.json({data:[]}),{})('https://fixture.invalid/v1/images/generations',{method:'POST',body:'{}'});}catch(err){caught=err;}
  check(caught===original,'logging outage preserves original failure');
  console.log(`IMAGE_POSTACCEPT_DIAGNOSTICS=PASS CHECKS=${checks} REAL_MODULE=1 SHARP=REAL HTTP_CALLS=0 DB_CALLS=0`);
})().catch(error=>{console.error(error);process.exitCode=1;});
