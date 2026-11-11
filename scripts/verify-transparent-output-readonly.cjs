// Read-only diagnosis. Do not modify download, media encoding or alpha functions.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),sharp=require('sharp'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const out=path.resolve(process.env.EVIDENCE_OUT||'output/transparent-output-readonly');fs.mkdirSync(out,{recursive:true});
const file='src/lib/imagegen/cutout-provider.ts',source=fs.readFileSync(file,'utf8'),before=execFileSync('git',['show','974fa2c2191447771048d84a190cd80449778c3f:'+file],{encoding:'utf8'}),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const assert=require('node:assert/strict');assert.equal(hash(source),hash(before),'protected provider source must stay byte-identical');
(async()=>{
 const original=await sharp({create:{width:16,height:16,channels:4,background:'#3067d9'}}).png().toBuffer();
 const mask=await sharp({create:{width:16,height:16,channels:3,background:'black'}}).composite([{input:await sharp({create:{width:8,height:8,channels:3,background:'white'}}).png().toBuffer(),left:4,top:4}]).png().toBuffer();
 const previousFetch=global.fetch;global.fetch=async url=>String(url).endsWith('/v1/models/fixture/mask')?Response.json({latest_version:{id:'fixture-version'}}):String(url).endsWith('/v1/predictions')?Response.json({status:'succeeded',output:'http://fixture.invalid/mask.png'}):new Response(mask,{headers:{'content-type':'image/png'}});
 const module={exports:{}};
 try{
  const code=ts.transpileModule(source,{compilerOptions:{module:1,target:9,esModuleInterop:true}}).outputText;
  const mocks={'server-only':{},'../supplier-cost/collect':{supplierCostFetch:f=>f},'../model-config/clients':{modelAwareOpenAI:()=>{throw Error('unexpected model')}},'../billing/synchronous-operation':{markBillingUpstream:()=>{}},'@/lib/bi/model-calls':{observeOpenAI:v=>v},'../openai-base':{getOpenAIBaseUrl:async()=>''}};
  vm.runInThisContext(require('node:module').wrap(code))(module.exports,name=>name in mocks?mocks[name]:require(name),module,file,path.dirname(file));
  const output=await module.exports.cutoutReplicate(original,'image/png','fixture-only','fixture/mask');
  const meta=await sharp(output).metadata(),raw=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});let transparent=0,visible=0;for(let i=3;i<raw.data.length;i+=4){if(raw.data[i]===0)transparent++;else visible++;}
  fs.writeFileSync(path.join(out,'input.png'),original);fs.writeFileSync(path.join(out,'mask.png'),mask);fs.writeFileSync(path.join(out,'output.png'),output);
  const result={status:'AUDITED_NO_FIX',providerSourceSHA256:hash(source),protectedSourceUnchanged:true,condition:'RGBA input plus returned grayscale mask; legacy Replicate mask-to-alpha branch',hasAlpha:meta.hasAlpha,channels:meta.channels,transparentPixels:transparent,visiblePixels:visible,defectReproduced:transparent===0,relatesToScreenshot:'Related transparency production path; historical screenshot origin and generation mode unconfirmed',supplier:'local explicit fixture, 0 external calls'};
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{global.fetch=previousFetch;}
})().catch(error=>{console.error(error);process.exitCode=1});
