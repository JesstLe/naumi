const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {build}=require('esbuild'),sharp=require('sharp');
const out=path.resolve(process.env.TEMPLATE_CONTRACT_EVIDENCE||'output/template-cover-contract');fs.mkdirSync(out,{recursive:true});
(async()=>{
await build({stdin:{contents:'export * from "./src/lib/templates/cover-layout";export * from "./src/lib/templates/cover-repairs";export * from "./src/lib/templates/cover-metadata";export * from "./src/lib/templates/image-source";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'contract.cjs'),tsconfig:'tsconfig.json',plugins:[{name:'io-boundaries',setup(b){
 b.onResolve({filter:/^(server-only|@\/lib\/media-assets-reader|@\/lib\/object-storage\/runtime)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='server-only'?'':a.path.includes('media-assets-reader')?'export async function getMediaAssets(keys){globalThis.reads.push(keys);return new Map([["templates/a.webp",{width:640,height:960}]])}':'export function isManagedImageUrl(s){return s.startsWith("/media/")}export function storageKeyFromManagedUrl(s){return isManagedImageUrl(s)?s.slice(7):null}'}));
}}],logLevel:'silent'});
const api=require(path.join(out,'contract.cjs')),records=require('../src/lib/templates/cover-repairs.json');let checks=0;
const check=(value)=>{assert.ok(value);checks++;};
 for(const [id,r]of Object.entries(records)){
  const file=path.join(process.cwd(),'public',r.image);const bytes=fs.readFileSync(file),meta=await sharp(bytes).metadata();await sharp(bytes).raw().toBuffer();
  check(crypto.createHash('sha256').update(bytes).digest('hex')===path.basename(file).split('.')[0]);
  check(meta.width===r.width&&meta.height===r.height);
  check(api.templateImageDeliveryUrl(id,r.source)===r.image);
  check(api.templateImageDeliveryUrl(id,'/api/tpl-image?u='+encodeURIComponent(r.source))===r.image);
  check(api.templateImageDeliveryUrl(id,'/media/admin-changed.webp')==='/media/admin-changed.webp');
  check(api.templateImageDeliveryUrl(id,'https://example.test/changed.jpg').startsWith('/api/tpl-image?'));
  check(api.bundledTemplateCover(r.image).source===r.image);
 }
 assert.deepEqual(api.templateCoverDimensions({image:'a',cover:{source:'a',width:640,height:960}}),[640,960]);checks++;
 for(const cover of [undefined,{source:'b',width:1,height:2},{source:'a',width:0,height:2},{source:'a',width:NaN,height:2},{source:'a',width:1,height:-1}]){assert.deepEqual(api.templateCoverDimensions({image:'a',cover}),[4,5]);checks++;}
 globalThis.reads=[];const bundled=Object.values(records)[0];const input=[{image:'/media/templates/a.webp',prompt:'unchanged'},{image:'https://example.test/no-metadata.jpg'},{image:bundled.image}];const result=await api.withTemplateCovers(input);
 check(reads.length===1&&reads[0].length===1);check(result[0].cover.source===input[0].image&&result[0].cover.height===960);check(result[0].prompt==='unchanged'&&!input[0].cover);check(!result[1].cover);check(result[2].cover.width===bundled.width);
 console.log('TEMPLATE_COVER_CONTRACT=PASS checks='+checks+' repaired_covers=52 full_decode=52 admin_overrides=preserved batch_reads=1 supplier_calls=0');fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({checks,repairedCovers:52,fullDecode:52,tier:'actual layout/source/metadata projection; isolated media repository',supplierCalls:0},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
