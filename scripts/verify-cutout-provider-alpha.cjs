const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),sharp=require('sharp'),{build}=require('esbuild');
(async()=>{
 const state={output:Buffer.alloc(0),calls:0,edit:null},mocks={
  'src/lib/supplier-cost/collect.ts':'export const supplierCostFetch=f=>f;',
  'src/lib/model-config/clients.ts':'export const modelAwareOpenAI=()=>({images:{edit:async value=>{__fixture.edit=value;return{data:[{b64_json:__fixture.output.toString("base64")}]}}}});',
  'src/lib/billing/synchronous-operation.ts':'export const markBillingUpstream=()=>{};',
  'src/lib/bi/model-calls.ts':'export const observeOpenAI=x=>x;',
  'src/lib/openai-base.ts':'export const getOpenAIBaseUrl=async()=>"https://fixture.invalid/v1";',
 };
 const result=await build({stdin:{contents:'export {cutoutReplicate,cutoutOpenAI} from "./src/lib/imagegen/cutout-provider";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'ports',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));b.onLoad({filter:/\.[cm]?tsx?$/},a=>{const key=path.relative(process.cwd(),a.path).replaceAll('\\','/');if(mocks[key])return{contents:mocks[key],loader:'ts'}})}}]});
 const m=new Module(path.resolve('scripts/.cutout-provider-alpha.cjs'));m.filename=path.resolve('scripts/.cutout-provider-alpha.cjs');m.paths=module.paths;globalThis.__cutoutProvider=state;try{m._compile('const __fixture=globalThis.__cutoutProvider;\n'+result.outputFiles[0].text,m.filename)}finally{delete globalThis.__cutoutProvider}
 const original=await sharp({create:{width:16,height:16,channels:4,background:'#3067d9'}}).png().toBuffer(),originalCopy=Buffer.from(original);
 const mask=await sharp({create:{width:16,height:16,channels:3,background:'black'}}).composite([{input:await sharp({create:{width:8,height:8,channels:3,background:'white'}}).png().toBuffer(),left:4,top:4}]).removeAlpha().png().toBuffer();
 const previous=global.fetch;global.fetch=async url=>{
  if(String(url)==='https://api.replicate.com/v1/models/fixture/mask')return Response.json({latest_version:{id:'fixture-version'}});
  if(String(url)==='https://api.replicate.com/v1/predictions'){state.calls++;return Response.json({status:'succeeded',output:'https://fixture.invalid/output.png'})}
  assert.equal(String(url),'https://fixture.invalid/output.png','No external request');return new Response(state.output);
 };
 try{
  state.output=mask;const output=await m.exports.cutoutReplicate(original,'image/png','fixture-only','fixture/mask'),decoded=await sharp(output).ensureAlpha().raw().toBuffer();let clear=0;for(let i=3;i<decoded.length;i+=4)if(decoded[i]===0)clear++;
  if(process.argv.includes('--baseline')){assert.equal(clear,0);console.log('CUTOUT_PROVIDER_BASELINE=REPRODUCED rgba_source_grayscale_mask=alpha_lost external_calls=0');return;}
  assert.equal(clear,192);for(let y=4;y<12;y++)for(let x=4;x<12;x++)assert.deepEqual([...decoded.subarray((y*16+x)*4,(y*16+x)*4+4)],[48,103,217,255]);
  assert.deepEqual(original,originalCopy,'original bytes not changed');
  state.output=await sharp(mask).ensureAlpha().png().toBuffer();const rgbaMask=await m.exports.cutoutReplicate(original,'image/png','fixture-only','fixture/mask');assert.deepEqual(await sharp(rgbaMask).raw().toBuffer(),decoded,'opaque RGBA masks are still masks');
  state.output=output;assert.deepEqual(await m.exports.cutoutReplicate(original,'image/png','fixture-only','fixture/mask'),output,'actual transparent PNG bytes retained');
  for(const [color,alpha]of [['white',254/255],['#467bcd',1]]){
   state.output=await sharp({create:{width:16,height:16,channels:4,background:alpha<1?{r:255,g:255,b:255,alpha}:color}}).png().toBuffer();
   await assert.rejects(m.exports.cutoutReplicate(original,'image/png','fixture-only','fixture/mask'),/有效透明背景/);
  }
  state.output=output;const b=await m.exports.cutoutOpenAI(original,'image/png','fixture-only','fixture-image');assert.deepEqual(b,output);assert.equal(state.edit.background,'transparent');assert.ok(state.edit.prompt.includes('不要绘制灰白棋盘格'));assert.equal(state.edit.model,'fixture-image');
  const out=process.env.CUTOUT_EVIDENCE;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'mask-source.png'),original);fs.writeFileSync(path.join(out,'mask.png'),mask);fs.writeFileSync(path.join(out,'mask-result.png'),output);}
  console.log('CUTOUT_PROVIDER_ALPHA=PASS rgba_mask=real_alpha original_rgb=exact native_png=byte_identical pseudo_alpha=reject color_non_mask=reject prompt=no_checkerboard external_calls=0');
 }finally{global.fetch=previous}
})().catch(e=>{console.error(e);process.exitCode=1});
